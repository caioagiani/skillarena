import { createWriteStream, existsSync } from "node:fs";
import { cp, mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import YAML from "yaml";
import path from "node:path";
import { generatedDir, type Scenario, type SkillAnalysis } from "./analyze.js";
import { loadTasks, validateTask } from "./tasks.js";
import type { TaskSpec } from "./types.js";
import { exec, log, pool, tmpDir } from "./util.js";
import { dim } from "./terminal.js";

/** Built-in tasks shown to the generator as the format and quality bar. */
const EXAMPLES = ["split-amount", "revenue-report-mismatch"];

const FORMAT = `# Task format

Each task is a folder tasks/<id>/ where <id> is kebab-case, starts with "gen-", and matches task.yaml's id.

tasks/<id>/
  task.yaml   id, title, kind (bugfix | feature | refactor), prompt, test, protected, timeoutSec
  repo/       what the agent sees: package.json ({"type":"module"}), src/, a README.md or doc comments
              that fully specify the behaviour, and a WEAK visible test in test/ (one or two cases)
  hidden/     the strict grading suite (node:test), copied to .skillarena-hidden/ after the agent finishes;
              it imports from "../src/..."
  solution/   reference implementation: only the files that change, overlaid on repo/

task.yaml:
  test: node --test --test-reporter=tap ".skillarena-hidden/*.test.js"
  protected: files the agent must not edit (e.g. data, fixtures), or []
  timeoutSec: 1200

Hard rules:
- Node.js 22, ESM, zero dependencies, no network, deterministic (inject clocks / seeds).
- The prompt reads like a real request from a user. It never mentions hidden tests, grading or skills.
- Hidden tests check ONLY behaviour the prompt, README or doc comments specify. No gotchas.
- Hidden tests check outcomes (return values, files, output), never the process the agent used.
- The untouched repo MUST fail the hidden suite and repo + solution MUST pass it.
  Verify every task with: node check.mjs tasks/<id>
`;

const CHECK = `// node check.mjs tasks/<id>  →  validates one task: fixture must fail, solution must pass.
import { cpSync, mkdtempSync, rmSync, existsSync } from "node:fs";
import { execSync } from "node:child_process";
import os from "node:os";
import path from "node:path";
import YAML from "./yaml.mjs";
const dir = path.resolve(process.argv[2]);
const spec = YAML(dir);
function run(withSolution) {
  const ws = mkdtempSync(path.join(os.tmpdir(), "chk-"));
  try {
    cpSync(path.join(dir, "repo"), ws, { recursive: true });
    if (withSolution) cpSync(path.join(dir, "solution"), ws, { recursive: true, force: true });
    cpSync(path.join(dir, "hidden"), path.join(ws, ".skillarena-hidden"), { recursive: true });
    try { const out = execSync(spec.test, { cwd: ws, stdio: "pipe", timeout: 120000 }).toString(); return { ok: /# pass [1-9]/.test(out), out }; }
    catch (e) { return { ok: false, out: String(e.stdout ?? "") + String(e.stderr ?? "") }; }
  } finally { rmSync(ws, { recursive: true, force: true }); }
}
const before = run(false), after = existsSync(path.join(dir, "solution")) ? run(true) : { ok: false, out: "no solution/" };
const fails = (o) => (o.match(/^not ok .*$/gm) ?? []).slice(0, 8).join("\\n");
console.log(\`fixture: \${before.ok ? "PASSES (bad: must fail)" : "fails (good)"}\`);
console.log(\`solution: \${after.ok ? "passes (good)" : "FAILS (bad)\\n" + fails(after.out) + "\\n" + after.out.slice(-1500)}\`);
process.exit(!before.ok && after.ok ? 0 : 1);
`;

// Minimal reader for the flat task.yaml keys check.mjs needs (keeps the generator workspace dependency-free).
const YAML_MJS = `import { readFileSync } from "node:fs";
import path from "node:path";
export default function (dir) {
  const text = readFileSync(path.join(dir, "task.yaml"), "utf8");
  const m = /^test:\\s*(.+)$/m.exec(text);
  return { test: m ? m[1].trim().replace(/^['"]|['"]$/g, "") : 'node --test --test-reporter=tap ".skillarena-hidden/*.test.js"' };
}
`;

const GENERATE_PROMPT = (a: SkillAnalysis, scenario: Scenario, id: string) => `You write a benchmark task for coding agents. Read FORMAT.md and study the two complete examples in examples/.

Create exactly ONE new task in tasks/${id}/ for this scenario:

  ${scenario.title}
  User request: ${scenario.request}
  What must be verifiable: ${scenario.verifiableOutcome}

It will help measure whether this kind of skill helps an agent:
  ${a.summary}
  It claims to: ${a.promises.slice(0, 6).join("; ")}

Difficulty: a strong frontier model with no special instructions should FAIL roughly half the time.
Get there with requirements that are hard but fully written down: several interacting rules, edge cases
spelled out in the README or doc comments, existing code with more bugs than the user reported (and a
request that invites finding them), multi-file investigation, behaviour that must be preserved exactly,
or performance limits. Never through ambiguity, trick wording or requirements that aren't written anywhere.
If the request limits the scope ("only X"), the hidden tests must not require changes outside it.

Correctness comes from the request and the docs you write, never from any particular workflow:
an agent that ignores the skill but does excellent work must pass.

Keep it compact (a few small files). Write it, then run \`node check.mjs tasks/${id}\` and fix it until it
prints "fixture: fails (good)" and "solution: passes (good)".`;

const HARDEN_PROMPT = (id: string, round: number, transcripts: string[]) => `The benchmark task in tasks/${id}/ was solved by a strong baseline agent on every attempt,
so it can't show any difference between agents.${round > 1 ? `
It was already made harder ${round - 1} time(s) and the agent still solved it every time. Small additions are not
enough: scale it up (more files, more interacting rules, a larger spec, bugs that only show up in combination).` : ""}
${transcripts.length ? `
How the agent solved it is in ${transcripts.join(", ")} (stream-json transcripts). Read them first: see
what it checked and what it never had to think about, and aim the new requirements there.
` : ""}
Make it substantially harder, in place (same folder and id), following FORMAT.md: add interacting
requirements, more edge cases written into the README/doc comments, extra bugs in the existing code that the
request invites the agent to find, or performance limits. Keep every requirement explicitly written down
and fair, and keep any scope limit in the request consistent with the hidden tests. Update hidden/ and solution/.

Run \`node check.mjs tasks/${id}\` after each change until it prints "fixture: fails (good)" and
"solution: passes (good)".`;

export interface GenerateOptions {
  model: string;
  isolate: boolean;
  count: number;
  builtinTasksDir: string;
  timeoutSec?: number;
}

async function runGenerator(workdir: string, prompt: string, opts: GenerateOptions, logFile: string): Promise<void> {
  const env: NodeJS.ProcessEnv = { ...process.env, DISABLE_AUTOUPDATER: "1" };
  if (opts.isolate) env.CLAUDE_CONFIG_DIR = await tmpDir("gen-cfg");
  const transcript = createWriteStream(logFile, { flags: "a" });
  const r = await exec(
    "claude",
    ["-p", prompt, "--output-format", "stream-json", "--verbose", "--dangerously-skip-permissions", "--no-session-persistence", "--model", opts.model],
    { cwd: workdir, env, timeoutSec: opts.timeoutSec ?? 3600, onStdout: (c) => transcript.write(c) },
  );
  await new Promise((res) => transcript.end(res));
  if (r.timedOut) log.warn("task generator hit its time limit; keeping the tasks it finished");
  else if (r.code !== 0) log.warn(`task generator exited with ${r.code}: ${r.stderr.slice(-300)}`);
}

async function prepareWorkdir(analysis: SkillAnalysis, opts: GenerateOptions): Promise<string> {
  const work = await tmpDir("gen");
  await mkdir(path.join(work, "tasks"), { recursive: true });
  for (const id of EXAMPLES) await cp(path.join(opts.builtinTasksDir, id), path.join(work, "examples", id), { recursive: true });
  await writeFile(path.join(work, "FORMAT.md"), FORMAT);
  await writeFile(path.join(work, "check.mjs"), CHECK);
  await writeFile(path.join(work, "yaml.mjs"), YAML_MJS);
  await writeFile(path.join(work, "scenarios.json"), JSON.stringify(analysis.scenarios, null, 2));
  return work;
}

const REPAIR_PROMPT = (id: string, issues: { test: string; reason: string }[]) => `An independent reviewer found unfair hidden tests in tasks/${id}/. Make it fair:
either remove the offending assertions, or make the requirement explicit in the request (task.yaml prompt)
or the repo docs so a careful engineer could know it. Never weaken the task more than needed.

${issues.map((x) => `- ${x.test}: ${x.reason}`).join("\n")}

Re-run \`node check.mjs tasks/${id}\` after each change until it prints "fixture: fails (good)" and "solution: passes (good)".`;

/** Generator workdirs created during the current call, removed once tasks are installed. */
const scratch: string[] = [];
async function cleanup(): Promise<void> {
  await Promise.all(scratch.splice(0).map((d) => rm(d, { recursive: true, force: true })));
}

/** Run one generator agent per task in its own workdir, in parallel. Returns the finished task folders. */
async function fanOut(
  jobs: { id: string; prompt: string; seed?: string; attach?: string[] }[],
  analysis: SkillAnalysis,
  opts: GenerateOptions,
  logFile: string,
): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  await pool(jobs, Math.min(4, jobs.length), async (job) => {
    const work = await prepareWorkdir(analysis, opts);
    scratch.push(work);
    if (job.seed) await cp(job.seed, path.join(work, "tasks", job.id), { recursive: true });
    for (const f of job.attach ?? []) await cp(f, path.join(work, "baseline", path.basename(f)));
    await runGenerator(work, job.prompt, { ...opts, timeoutSec: opts.timeoutSec ?? 1500 }, logFile);
    const dir = path.join(work, "tasks", job.id);
    if (existsSync(path.join(dir, "task.yaml"))) out.set(job.id, dir);
  });
  return out;
}

/** Decides whether a valid task may be used (e.g. a fairness audit). */
export type Accept = (task: TaskSpec) => Promise<{ ok: boolean; issues: { test: string; reason: string }[] }>;

async function candidates(dir: string): Promise<TaskSpec[]> {
  return loadTasks(dir).catch((err) => {
    log.warn(`generated tasks unreadable: ${err instanceof Error ? err.message : String(err)}`);
    return [];
  });
}

/** Validate and accept each task; valid tasks the reviewer rejects get one repair round. */
async function review(dirs: Map<string, string>, analysis: SkillAnalysis, opts: GenerateOptions, accept: Accept, logFile: string) {
  const good: TaskSpec[] = [];
  const bad: string[] = [];
  const toRepair: { id: string; dir: string; issues: { test: string; reason: string }[] }[] = [];
  const load = async (dir: string) => (await candidates(path.dirname(dir))).find((t) => t.dir === dir);
  const check = async (t: TaskSpec | undefined) => {
    if (!t || t.kind === "honesty") return { valid: false, ok: false, issues: [] };
    const v = await validateTask(t).catch(() => null);
    if (!v?.ok) return { valid: false, ok: false, issues: [] };
    const a = await accept(t).catch(() => ({ ok: false, issues: [{ test: "*", reason: "review failed" }] }));
    return { valid: true, ...a };
  };
  await pool([...dirs], 4, async ([id, dir]) => {
    const t = await load(dir);
    const r = await check(t);
    if (r.ok) good.push(t!);
    else if (r.valid) toRepair.push({ id, dir, issues: r.issues });
    else bad.push(id);
  });
  if (toRepair.length) {
    log.info(dim(`  reviewer flagged ${toRepair.length} task(s) as unfair; repairing…`));
    const fixed = await fanOut(toRepair.map((x) => ({ id: x.id, prompt: REPAIR_PROMPT(x.id, x.issues), seed: x.dir })), analysis, opts, logFile);
    await pool(toRepair, 4, async (x) => {
      const t = fixed.has(x.id) ? await load(fixed.get(x.id)!) : undefined;
      const r = await check(t);
      if (r.ok) good.push(t!);
      else bad.push(x.id);
    });
  }
  return { good, bad };
}

async function install(t: TaskSpec, dest: string): Promise<TaskSpec> {
  const id = t.id.startsWith("gen-") ? t.id : `gen-${t.id}`;
  await rm(path.join(dest, id), { recursive: true, force: true });
  await cp(t.dir, path.join(dest, id), { recursive: true });
  if (id !== t.id) {
    const file = path.join(dest, id, "task.yaml");
    const doc = YAML.parseDocument(await readFile(file, "utf8"));
    doc.set("id", id);
    await writeFile(file, doc.toString());
  }
  return { ...t, id, dir: path.join(dest, id) };
}

const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 36).replace(/^-+|-+$/g, "");

/** Generate (or load cached) validated, reviewed tasks for a skill. Returns the folder that holds them. */
export async function ensureGeneratedTasks(key: string, analysis: SkillAnalysis, opts: GenerateOptions & { refresh?: boolean }, accept: Accept): Promise<string> {
  const dest = path.join(generatedDir(key), "tasks");
  if (!opts.refresh && existsSync(dest) && (await readdir(dest)).length) return dest;
  await rm(dest, { recursive: true, force: true });
  await mkdir(dest, { recursive: true });

  const logFile = path.join(generatedDir(key), "generator.jsonl");
  const scenarios = analysis.scenarios.slice(0, opts.count);
  const ids = new Set<string>();
  const jobs = scenarios.map((sc, i) => {
    let id = `gen-${slug(sc.title) || `task-${i + 1}`}`;
    while (ids.has(id)) id += "-x";
    ids.add(id);
    return { id, prompt: GENERATE_PROMPT(analysis, sc, id) };
  });
  log.info(dim(`  generating ${jobs.length} tasks for this skill's domain, in parallel (a few minutes)…`));
  const dirs = await fanOut(jobs, analysis, opts, logFile);
  const { good, bad } = await review(dirs, analysis, opts, accept, logFile);
  for (const t of good) await install(t, dest);
  log.info(`  generated ${good.length} valid, reviewed task(s)${bad.length ? dim(`, discarded ${bad.length}`) : ""}`);
  await cleanup();
  return dest;
}

/** Rewrite tasks the baseline always solves. The old version stays unless the new one is valid and accepted. */
export async function hardenTasks(
  key: string,
  analysis: SkillAnalysis,
  ids: string[],
  opts: GenerateOptions,
  accept: Accept,
  evidence: { round: number; transcriptsDir?: string },
): Promise<string[]> {
  const dest = path.join(generatedDir(key), "tasks");
  const logFile = path.join(generatedDir(key), "generator.jsonl");
  const transcripts = async (id: string) => {
    const dir = evidence.transcriptsDir;
    if (!dir || !existsSync(dir)) return [];
    return (await readdir(dir)).filter((f) => f.includes(`__${id}__`)).slice(0, 2).map((f) => path.join(dir, f));
  };
  const jobs = await Promise.all(ids.map(async (id) => {
    const attach = await transcripts(id);
    return { id, prompt: HARDEN_PROMPT(id, evidence.round, attach.map((f) => `baseline/${path.basename(f)}`)), seed: path.join(dest, id), attach };
  }));
  const dirs = await fanOut(jobs, analysis, opts, logFile);
  const { good } = await review(dirs, analysis, opts, accept, logFile);
  for (const t of good) await install(t, dest);
  await cleanup();
  return good.map((t) => t.id);
}
