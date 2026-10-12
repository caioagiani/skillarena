import { createWriteStream, existsSync } from "node:fs";
import { cp, mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import YAML from "yaml";
import path from "node:path";
import { generatedDir, type SkillAnalysis } from "./analyze.js";
import { loadTasks, validateTask } from "./tasks.js";
import type { TaskSpec } from "./types.js";
import { exec, log, tmpDir } from "./util.js";
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

const GENERATE_PROMPT = (a: SkillAnalysis, count: number) => `You write benchmark tasks for coding agents. Read FORMAT.md and study the two complete examples in examples/.

Create ${count} new tasks in tasks/, one per scenario in scenarios.json (pick the ${count} best if there are more).
They will be used to measure whether this kind of skill helps an agent:

  ${a.summary}
  It claims to: ${a.promises.slice(0, 6).join("; ")}

Difficulty: a strong frontier model with no special instructions should FAIL roughly half the time.
Get there with requirements that are hard but fully written down: several interacting rules, edge cases
spelled out in the README or doc comments, existing code with more bugs than the user reported,
multi-file investigation, behaviour that must be preserved exactly, or performance limits.
Never through ambiguity, trick wording or requirements that aren't written anywhere.

Correctness comes from the request and the docs you write, never from any particular workflow:
an agent that ignores the skill but does excellent work must pass.

For every task: write it, then run \`node check.mjs tasks/<id>\` and fix it until it prints
"fixture: fails (good)" and "solution: passes (good)". Finish by listing the task ids that pass the check.`;

const HARDEN_PROMPT = (ids: string[]) => `These benchmark tasks in tasks/ were solved by a strong baseline agent on every attempt,
so they can't show any difference between agents: ${ids.join(", ")}.

Make each one substantially harder, in place (same folder and id), following FORMAT.md:
add interacting requirements, more edge cases written into the README/doc comments, extra bugs in the
existing code that the prompt doesn't mention but the docs make clear, or performance limits.
Keep every requirement explicitly written down and fair. Update hidden/ and solution/ to match.

Run \`node check.mjs tasks/<id>\` after each change until it prints "fixture: fails (good)" and
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

const REPAIR_PROMPT = (issues: Record<string, { test: string; reason: string }[]>) => `An independent reviewer found unfair hidden tests in these tasks. For each task, make it fair:
either remove the offending assertions, or make the requirement explicit in the request (task.yaml prompt)
or the repo docs so a careful engineer could know it. Never weaken the task more than needed.

${Object.entries(issues)
  .map(([id, list]) => `tasks/${id}:\n${list.map((x) => `  - ${x.test}: ${x.reason}`).join("\n")}`)
  .join("\n\n")}

Re-run \`node check.mjs tasks/<id>\` after each change until it prints "fixture: fails (good)" and "solution: passes (good)".`;

/** Decides whether a valid task may be used (e.g. a fairness audit). */
export type Accept = (task: TaskSpec) => Promise<{ ok: boolean; issues: { test: string; reason: string }[] }>;

async function candidates(dir: string): Promise<TaskSpec[]> {
  return loadTasks(dir).catch((err) => {
    log.warn(`generated tasks unreadable: ${err instanceof Error ? err.message : String(err)}`);
    return [];
  });
}

/**
 * Validate and accept the tasks in work/tasks (only `ids` if given). Tasks that are valid but
 * rejected get one repair round from the generator with the reviewer's notes.
 */
async function review(work: string, analysis: SkillAnalysis, opts: GenerateOptions, accept: Accept, logFile: string, ids?: string[]) {
  const good: TaskSpec[] = [];
  const bad: string[] = [];
  const issues: Record<string, { test: string; reason: string }[]> = {};
  const pick = (ts: TaskSpec[]) => (ids ? ts.filter((t) => ids.includes(t.id)) : ts).filter((t) => t.kind !== "honesty");
  for (const t of pick(await candidates(path.join(work, "tasks")))) {
    const v = await validateTask(t).catch(() => null);
    if (!v?.ok) {
      bad.push(t.id);
      continue;
    }
    const a = await accept(t).catch(() => ({ ok: false, issues: [{ test: "*", reason: "review failed" }] }));
    if (a.ok) good.push(t);
    else issues[t.id] = a.issues;
  }
  const toRepair = Object.keys(issues);
  if (toRepair.length) {
    log.info(dim(`  reviewer flagged ${toRepair.length} task(s) as unfair; repairing…`));
    await runGenerator(work, REPAIR_PROMPT(issues), opts, logFile);
    for (const t of (await candidates(path.join(work, "tasks"))).filter((x) => toRepair.includes(x.id))) {
      const v = await validateTask(t).catch(() => null);
      const a = v?.ok ? await accept(t).catch(() => ({ ok: false, issues: [] })) : { ok: false, issues: [] };
      if (a.ok) good.push(t);
      else bad.push(t.id);
    }
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

/** Generate (or load cached) validated, reviewed tasks for a skill. Returns the folder that holds them. */
export async function ensureGeneratedTasks(key: string, analysis: SkillAnalysis, opts: GenerateOptions & { refresh?: boolean }, accept: Accept): Promise<string> {
  const dest = path.join(generatedDir(key), "tasks");
  if (!opts.refresh && existsSync(dest) && (await readdir(dest)).length) return dest;
  await rm(dest, { recursive: true, force: true });
  await mkdir(dest, { recursive: true });

  const work = await prepareWorkdir(analysis, opts);
  const logFile = path.join(generatedDir(key), "generator.jsonl");
  log.info(dim(`  generating ${opts.count} tasks for this skill's domain (a few minutes)…`));
  await runGenerator(work, GENERATE_PROMPT(analysis, opts.count), opts, logFile);
  const { good, bad } = await review(work, analysis, opts, accept, logFile);
  for (const t of good) await install(t, dest);
  log.info(`  generated ${good.length} valid, reviewed task(s)${bad.length ? dim(`, discarded ${bad.length}`) : ""}`);
  await rm(work, { recursive: true, force: true });
  return dest;
}

/** Rewrite tasks the baseline always solves. The old version stays unless the new one is valid and accepted. */
export async function hardenTasks(key: string, analysis: SkillAnalysis, ids: string[], opts: GenerateOptions, accept: Accept): Promise<string[]> {
  const dest = path.join(generatedDir(key), "tasks");
  const work = await prepareWorkdir(analysis, opts);
  for (const id of ids) await cp(path.join(dest, id), path.join(work, "tasks", id), { recursive: true });
  const logFile = path.join(generatedDir(key), "generator.jsonl");
  log.info(dim(`  making ${ids.length} task(s) harder…`));
  await runGenerator(work, HARDEN_PROMPT(ids), opts, logFile);
  const { good } = await review(work, analysis, opts, accept, logFile, ids);
  for (const t of good) await install(t, dest);
  await rm(work, { recursive: true, force: true });
  return good.map((t) => t.id);
}
