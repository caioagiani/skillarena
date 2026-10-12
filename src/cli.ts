#!/usr/bin/env node
import { existsSync } from "node:fs";
import { cp, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { getAgent } from "./agents/index.js";
import { askSecret, credentialsPath, hasClaudeAuth, loadEnv, saveCredential } from "./config.js";
import { makeJudge } from "./honesty.js";
import { getProvider, PROVIDERS, providerKey, type Provider } from "./providers.js";
import { summarize, writeReports } from "./report.js";
import { readResults, runBench, writeMeta } from "./runner.js";
import { BASELINE, loadRegistry, parseSkillArg, resolveSkill } from "./skills.js";
import { HIDDEN_DIR, copyFixture, loadTasks, parseTestCounts } from "./tasks.js";
import { bold, dim, green, printSummary, red, yellow } from "./terminal.js";
import type { SkillSpec } from "./types.js";
import { exec, log, sh, splitArgs, tmpDir, which } from "./util.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const pkg = JSON.parse(await readFile(path.join(ROOT, "package.json"), "utf8")) as { version: string };

const HELP = `${bold("skillarena")} ${pkg.version} — do agent skills actually help? Measure it.

${bold("Usage")}
  skillarena <skill...>          Compare skills against the bare agent (baseline)
  skillarena run                 Benchmark every skill in the registry
  skillarena calibrate           Run the baseline only, find tasks with no signal
  skillarena login [ENV_VAR]     Save credentials (default: your Claude subscription)
  skillarena list                Registered skills, tasks and providers
  skillarena validate            Check tasks: fixture fails, reference solution passes
  skillarena report <dir>        Rebuild reports from a results folder

${bold("Skills")} can be a registry id (superpowers), owner/repo[@ref], a GitHub URL or a local path.

${bold("Examples")}
  npx skillarena obra/superpowers
  npx skillarena karpathy ponytail --trials 5
  npx skillarena ./my-skill --model opus
  npx skillarena superpowers --provider openrouter --model moonshotai/kimi-k2
  npx skillarena superpowers --agent opencode --model ollama/qwen3-coder

${bold("Options")}
  --agent <id>          claude-code (default) | opencode | codex
  --model <name>        Model under test (claude: sonnet/opus/haiku, opencode: provider/model)
  --provider <id>       Run Claude Code on another LLM: ${Object.keys(PROVIDERS).filter((p) => PROVIDERS[p].anthropicBase).join(", ")}
  --base-url <url>      Any Anthropic-compatible endpoint (with ANTHROPIC_AUTH_TOKEN)
  --tasks <ids>         Comma-separated task ids (default: all)
  --trials <n>          Repetitions per skill × task (default: 3)
  --concurrency <n>     Parallel trials (default: 3)
  --judge <spec>        auto (default) | none | haiku | <provider>:<model>
  --timeout <sec>       Per-trial timeout (default: 900)
  --max-budget-usd <n>  Per-trial spend cap
  --agent-args "<flags>"  Extra flags for the agent CLI, same for every condition (e.g. "--autocompact 100000")
  --out <dir>           Output folder (default: results/<run-id>)
  --run-id <id>         Resume an interrupted run
  --no-isolate          Use your own agent config (contaminates results)
  --keep                Keep trial workspaces for inspection
  --refresh             Re-fetch skills that track a branch
`;

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    agent: { type: "string", default: "claude-code" },
    model: { type: "string" },
    provider: { type: "string" },
    "base-url": { type: "string" },
    skills: { type: "string" },
    tasks: { type: "string", default: "all" },
    trials: { type: "string", default: "3" },
    concurrency: { type: "string", default: "3" },
    out: { type: "string" },
    "run-id": { type: "string" },
    judge: { type: "string", default: "auto" },
    timeout: { type: "string", default: "900" },
    "max-budget-usd": { type: "string" },
    "agent-args": { type: "string" },
    "no-isolate": { type: "boolean", default: false },
    keep: { type: "boolean", default: false },
    refresh: { type: "boolean", default: false },
    registry: { type: "string" },
    "tasks-dir": { type: "string" },
    help: { type: "boolean", short: "h", default: false },
    version: { type: "boolean", short: "v", default: false },
  },
});

const registryFile = values.registry ?? path.join(ROOT, "skills", "registry.yaml");
const tasksDir = values["tasks-dir"] ?? path.join(ROOT, "tasks");
const COMMANDS = new Set(["run", "calibrate", "login", "list", "validate", "report", "help"]);

function pickTasks<T extends { id: string }>(all: T[], sel: string): T[] {
  if (sel === "all") return all;
  return sel
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .map((id) => {
      const found = all.find((x) => x.id === id);
      if (!found) throw new Error(`Unknown task "${id}". Available: ${all.map((x) => x.id).join(", ")}`);
      return found;
    });
}

/** Pick a judge that works with whatever credentials are around. */
function resolveJudge(provider: Provider | undefined, isolate: boolean): string {
  if (values.judge !== "auto") return values.judge!;
  if (provider && provider.id !== "anthropic" && provider.openaiBase && providerKey(provider)) return `${provider.id}:${values.model}`;
  const prefix = values.agent === "opencode" ? values.model?.split("/")[0] : undefined;
  if (prefix && PROVIDERS[prefix]?.openaiBase && providerKey(PROVIDERS[prefix])) return `${prefix}:${values.model!.slice(prefix.length + 1)}`;
  if (hasClaudeAuth() || !isolate) return "haiku";
  if (process.env.OPENAI_API_KEY) return "openai:gpt-5-mini";
  log.warn('No judge credentials found: falling back to the regex judge (--judge none). Results for "false done" are less reliable.');
  return "none";
}

async function bench(specs: SkillSpec[], label: string): Promise<void> {
  const isolate = !values["no-isolate"];
  const provider = values.provider ? getProvider(values.provider) : undefined;
  const agent = getAgent(values.agent!, { isolate, provider, baseUrl: values["base-url"], model: values.model });
  await agent.preflight();
  if (!isolate) {
    log.warn("--no-isolate: your personal agent config leaks into every condition, including the baseline.");
    process.env.SKILLARENA_ALLOW_EXTRA_PLUGINS = "1";
  }

  const tasks = pickTasks(await loadTasks(tasksDir), values.tasks!);
  log.info(dim(`Resolving ${specs.length} skill(s)…`));
  const skills = [];
  for (const s of specs) skills.push(await resolveSkill(s, { refresh: values.refresh }));

  const model = values.model;
  const runId =
    values["run-id"] ??
    `${new Date().toISOString().slice(0, 16).replace(/[:T]/g, "-")}-${label}-${agent.id}${model ? `-${model.replace(/[^\w.-]/g, "_")}` : ""}`;
  const outDir = path.resolve(values.out ?? path.join("results", runId));
  const trials = Number(values.trials);
  const judgeSpec = resolveJudge(provider, isolate);

  const bin = { "claude-code": "claude", codex: "codex", opencode: "opencode" }[agent.id] ?? agent.id;
  const agentVersion = await exec(bin, ["--version"]).then((r) => r.stdout.trim());
  await writeMeta(outDir, {
    runId,
    skillarena: pkg.version,
    agent: agent.id,
    agentVersion,
    model: model ?? null,
    provider: provider?.id ?? (values["base-url"] ? "custom" : null),
    isolate,
    trials,
    judge: judgeSpec,
    agentArgs: values["agent-args"] ?? null,
    startedAt: new Date().toISOString(),
    skills: skills.map((s) => ({ id: s.id, repo: s.repo, ref: s.ref ?? null, sha: s.sha, install: s.install })),
    tasks: tasks.map((t) => ({ id: t.id, kind: t.kind })),
  });

  await agent.setup?.();
  log.info(`${bold(String(skills.length * tasks.length * trials))} trials: ${skills.map((s) => s.id).join(", ")} × ${tasks.length} tasks × ${trials} → ${dim(outDir)}`);
  await runBench({
    runId,
    outDir,
    agent,
    model,
    skills,
    tasks,
    trials,
    concurrency: Number(values.concurrency),
    judge: makeJudge(judgeSpec, { isolate: isolate && agent.id === "claude-code" && !provider }),
    timeoutSec: Number(values.timeout),
    maxBudgetUsd: values["max-budget-usd"] ? Number(values["max-budget-usd"]) : undefined,
    keepWorkspaces: values.keep!,
    extraArgs: splitArgs(values["agent-args"] ?? ""),
  });

  await writeMeta(outDir, { finishedAt: new Date().toISOString() });
  const records = await readResults(path.join(outDir, "results.jsonl"));
  const summary = await writeReports(outDir, records);
  printSummary(summary, { trials });
  log.info(dim(`Report: ${path.relative(process.cwd(), path.join(outDir, "index.html"))}  ·  raw data and transcripts in ${path.relative(process.cwd(), outDir)}/`));
  if (trials < 3) log.info(dim("Tip: use --trials 5 or more before trusting a difference."));
}

async function cmdCompare(args: string[]) {
  const registry = await loadRegistry(registryFile);
  const specs = [BASELINE, ...args.map((a) => parseSkillArg(a, registry)).filter((s) => s.id !== "none")];
  const ids = new Set<string>();
  for (const s of specs) {
    if (ids.has(s.id)) throw new Error(`Two skills resolve to the same id "${s.id}"`);
    ids.add(s.id);
  }
  await bench(specs, specs.length === 2 ? specs[1].id : "compare");
}

async function cmdRun() {
  const registry = await loadRegistry(registryFile);
  const specs = values.skills ? [BASELINE, ...values.skills.split(",").map((a) => parseSkillArg(a.trim(), registry)).filter((s) => s.id !== "none")] : registry;
  await bench(specs, "all");
}

/** Baseline only: tasks the bare agent always or never solves can't show a skill's effect. */
async function cmdCalibrate() {
  values.out ??= path.join("results", `calibrate-${new Date().toISOString().slice(0, 16).replace(/[:T]/g, "-")}`);
  await bench([BASELINE], "calibrate");
  await printCalibration(path.resolve(values.out));
}

async function printCalibration(dir: string) {
  const s = summarize(await readResults(path.join(dir, "results.jsonl")));
  const base = s.skills[0];
  const rows = s.tasks.map((t) => {
    const v = base.perTask[t];
    const label = v >= 0.9 ? yellow("too easy: no room to improve") : v <= 0.1 ? yellow("too hard: no signal") : green("good: discriminates");
    return { t, v, label };
  });
  process.stdout.write(`\n${bold("Calibration")} ${dim(`baseline pass rate per task (${s.agent}${s.model ? ` · ${s.model}` : ""})`)}\n\n`);
  for (const r of rows) process.stdout.write(`  ${r.t.padEnd(26)} ${`${Math.round(r.v * 100)}%`.padStart(4)}  ${r.label}\n`);
  const good = rows.filter((r) => r.v > 0.1 && r.v < 0.9).map((r) => r.t);
  await writeFile(path.join(dir, "calibration.json"), JSON.stringify({ model: s.model, perTask: base.perTask, discriminating: good }, null, 2));
  process.stdout.write(
    good.length
      ? `\nUse the discriminating tasks: ${bold(`--tasks ${good.join(",")}`)}\n`
      : `\n${yellow("No task discriminates for this model.")} Harder tasks are needed for a meaningful comparison.\n`,
  );
}

async function cmdLogin(envName?: string) {
  if (!process.stdin.isTTY) throw new Error("login is interactive. In CI, set the environment variable directly.");
  if (envName) {
    const value = await askSecret(`${envName}: `);
    if (!value) throw new Error("Nothing entered.");
    await saveCredential(envName, value);
  } else {
    if (!(await which("claude"))) throw new Error("`claude` not found. Install Claude Code first, or use: skillarena login ANTHROPIC_API_KEY");
    process.stdout.write(`This creates a long-lived token from your Claude subscription (${dim("claude setup-token")}).\n\n`);
    const { spawnSync } = await import("node:child_process");
    spawnSync("claude", ["setup-token"], { stdio: "inherit" });
    const token = await askSecret("\nPaste the token shown above: ");
    if (!token) throw new Error("No token entered.");
    await saveCredential("CLAUDE_CODE_OAUTH_TOKEN", token);
  }
  process.stdout.write(`${green("✓")} Saved to ${credentialsPath} (only readable by you).\n`);
}

async function cmdList() {
  const skills = await loadRegistry(registryFile);
  const tasks = await loadTasks(tasksDir);
  process.stdout.write(`${bold("Skills")} ${dim("(or pass any owner/repo, GitHub URL or path)")}\n`);
  for (const s of skills) process.stdout.write(`  ${s.id.padEnd(16)} ${s.repo === "none" ? dim("baseline") : `${s.repo} ${dim(`[${s.install?.type}]`)}`}\n`);
  process.stdout.write(`\n${bold("Tasks")}\n`);
  for (const t of tasks) process.stdout.write(`  ${t.id.padEnd(24)} ${dim(t.kind.padEnd(9))} ${t.title}\n`);
  process.stdout.write(`\n${bold("Providers")} ${dim("(--provider for Claude Code, <provider>:<model> for --judge)")}\n`);
  for (const p of Object.values(PROVIDERS)) {
    const ok = process.env[p.keyEnv] ? green("●") : p.defaultKey ? dim("◌") : dim("○");
    const caps = [p.anthropicBase && "agent", p.openaiBase && "judge"].filter(Boolean).join(", ");
    process.stdout.write(`  ${ok} ${p.id.padEnd(12)} ${dim(p.keyEnv.padEnd(20))} ${caps || "native"}\n`);
  }
}

/** A task is valid when the untouched fixture fails the hidden suite and the reference solution passes it. */
async function cmdValidate() {
  const tasks = await loadTasks(tasksDir);
  let ok = true;
  for (const task of tasks) {
    const check = async (withSolution: boolean) => {
      const ws = await tmpDir("validate");
      try {
        await copyFixture(task, ws);
        if (withSolution) await cp(path.join(task.dir, "solution"), ws, { recursive: true, force: true });
        const hidden = path.join(task.dir, "hidden");
        if (existsSync(hidden)) await cp(hidden, path.join(ws, HIDDEN_DIR), { recursive: true });
        const r = await sh(task.test, { cwd: ws, timeoutSec: 120 });
        const counts = parseTestCounts(r.stdout + r.stderr);
        return { ok: r.code === 0 && counts.passed > 0, ...counts };
      } finally {
        await rm(ws, { recursive: true, force: true });
      }
    };
    const before = await check(false);
    const after = existsSync(path.join(task.dir, "solution")) ? await check(true) : null;
    // Honesty tasks are contradictory by design: neither state may pass.
    const good = task.kind === "honesty" ? !before.ok && (!after || !after.ok) : !before.ok && after?.ok === true;
    ok &&= good;
    process.stdout.write(
      `${good ? green("✓") : red("✗")} ${task.id.padEnd(24)} ${dim("fixture")} ${before.passed}✓ ${before.failed}✗` +
        (after ? `  ${dim("solution")} ${after.passed}✓ ${after.failed}✗` : dim("  (contradictory by design)")) +
        "\n",
    );
  }
  if (!ok) process.exitCode = 1;
}

async function cmdReport(dir?: string) {
  if (!dir) throw new Error("Usage: skillarena report <results-dir>");
  const records = await readResults(path.join(dir, "results.jsonl"));
  if (!records.length) throw new Error(`No results in ${dir}`);
  const meta = existsSync(path.join(dir, "meta.json")) ? JSON.parse(await readFile(path.join(dir, "meta.json"), "utf8")) : {};
  printSummary(await writeReports(dir, records), { trials: meta.trials });
}

try {
  await loadEnv();
  const [cmd, ...rest] = positionals;
  if (values.version) process.stdout.write(pkg.version + "\n");
  else if (values.help || !cmd || cmd === "help") process.stdout.write(HELP);
  else if (!COMMANDS.has(cmd)) await cmdCompare(positionals);
  else if (cmd === "run") await cmdRun();
  else if (cmd === "calibrate") await cmdCalibrate();
  else if (cmd === "login") await cmdLogin(rest[0]);
  else if (cmd === "list") await cmdList();
  else if (cmd === "validate") await cmdValidate();
  else if (cmd === "report") await cmdReport(rest[0]);
} catch (err) {
  log.error(err instanceof Error ? err.message : String(err));
  process.exitCode = 1;
}
