import { existsSync } from "node:fs";
import { readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { analyzeSkill, generatedDir, type SkillAnalysis } from "./analyze.js";
import { auditTask } from "./audit.js";
import { ensureGeneratedTasks, hardenTasks, type Accept } from "./generate.js";
import { heuristicJudge } from "./honesty.js";
import { summarize } from "./report.js";
import { readResults, runBench } from "./runner.js";
import { loadTasks } from "./tasks.js";
import { bold, dim, green, yellow } from "./terminal.js";
import type { Agent, ResolvedSkill, TaskSpec } from "./types.js";
import { log } from "./util.js";

export type SuiteMode = "auto" | "builtin" | "generated";

export interface SuiteOptions {
  mode: SuiteMode;
  builtin: TaskSpec[];
  builtinTasksDir: string;
  agent: Agent;
  model?: string;
  isolate: boolean;
  generatorModel: string;
  count: number;
  calibrate: boolean;
  concurrency: number;
  refresh: boolean;
}

/** An independent reviewer rejects tasks whose hidden tests a careful engineer couldn't anticipate. */
const fairness = (o: SuiteOptions): Accept => async (t) => {
  const r = await auditTask(t, { model: o.generatorModel, isolate: o.isolate });
  return { ok: r.fair, issues: r.issues };
};

/** Built-in tasks kept next to generated ones: the honesty check applies to every skill. */
const ALWAYS = ["slugify-conflict"];

const CALIBRATION_TRIALS = 2;
/** Rounds of "make it harder" for tasks the baseline always solves. */
const HARDEN_ROUNDS = 2;

interface Calibration {
  perTask: Record<string, number>;
  hardened: string[];
}

/** Baseline pass rate per generated task for this agent and model; harden tasks it always solves. */
async function calibrate(key: string, analysis: SkillAnalysis, tasksDir: string, o: SuiteOptions, baseline: ResolvedSkill): Promise<Calibration> {
  const tag = `${o.agent.id}-${(o.model ?? "default").replace(/[^\w.-]/g, "_")}`;
  const file = path.join(generatedDir(key), `calibration-${tag}.json`);
  if (!o.refresh && existsSync(file)) return JSON.parse(await readFile(file, "utf8"));

  const measure = async (tasks: TaskSpec[], round: number) => {
    const outDir = path.join(generatedDir(key), `calibration-${tag}-r${round}`);
    await rm(outDir, { recursive: true, force: true });
    await runBench({
      runId: `calibrate-${key}-r${round}`,
      outDir,
      agent: o.agent,
      model: o.model,
      skills: [baseline],
      tasks,
      trials: CALIBRATION_TRIALS,
      concurrency: o.concurrency,
      judge: heuristicJudge,
      timeoutSec: 900,
      keepWorkspaces: false,
      extraArgs: [],
    });
    return summarize(await readResults(path.join(outDir, "results.jsonl"))).skills[0]?.perTask ?? {};
  };

  log.info(dim(`  calibrating on the bare agent (${CALIBRATION_TRIALS} trials per task)…`));
  const perTask = await measure(await loadTasks(tasksDir), 1);
  const hardened = new Set<string>();
  for (let round = 1; round <= HARDEN_ROUNDS; round++) {
    const tooEasy = Object.entries(perTask).filter(([, v]) => v >= 1).map(([id]) => id);
    if (!tooEasy.length) break;
    log.info(dim(`  round ${round}: the bare agent always solved ${tooEasy.length} task(s); making them harder…`));
    const done = await hardenTasks(key, analysis, tooEasy, {
      model: o.generatorModel,
      isolate: o.isolate,
      count: o.count,
      builtinTasksDir: o.builtinTasksDir,
    }, fairness(o), { round, transcriptsDir: path.join(generatedDir(key), `calibration-${tag}-r${round}`, "transcripts") });
    if (!done.length) break;
    done.forEach((id) => hardened.add(id));
    const tasks = (await loadTasks(tasksDir)).filter((t) => done.includes(t.id));
    Object.assign(perTask, await measure(tasks, round + 1));
  }
  const cal = { perTask, hardened: [...hardened] };
  await writeFile(file, JSON.stringify(cal, null, 2));
  return cal;
}

function describe(skill: ResolvedSkill, a: SkillAnalysis): void {
  log.info(`${bold(skill.id)} ${dim(`· ${skill.install?.type ?? ""}`)}  ${a.summary}`);
  log.info(dim(`  domain ${a.domain}${a.languages.length ? ` · ${a.languages.join(", ")}` : ""} · ${a.scenarios.length} scenarios`));
}

/**
 * Decide which tasks to run. "auto": understand each skill, generate validated tasks for its
 * domain, calibrate them on the bare agent, and add the built-in honesty task. Falls back to
 * the built-in suite when a skill can't be analysed or isn't about coding.
 */
export async function buildSuite(skills: ResolvedSkill[], o: SuiteOptions): Promise<TaskSpec[]> {
  if (o.mode === "builtin") return o.builtin;
  const under = skills.filter((s) => s.install);
  const baseline = skills.find((s) => !s.install);
  if (!under.length || !baseline) return o.builtin;

  const generated: TaskSpec[] = [];
  for (const skill of under) {
    let analysis: SkillAnalysis;
    let key: string;
    try {
      ({ analysis, key } = await analyzeSkill(skill, { model: o.generatorModel, isolate: o.isolate, refresh: o.refresh }));
    } catch (err) {
      log.warn(`${skill.id}: ${err instanceof Error ? err.message : String(err)}. Using the built-in suite for it.`);
      continue;
    }
    describe(skill, analysis);
    if (analysis.domain !== "coding") {
      log.warn(`${skill.id} is a ${analysis.domain} skill. Generated tasks cover coding skills for now; using the built-in suite for it.`);
      continue;
    }
    const dir = await ensureGeneratedTasks(key, analysis, {
      model: o.generatorModel,
      isolate: o.isolate,
      count: o.count,
      builtinTasksDir: o.builtinTasksDir,
      refresh: o.refresh,
    }, fairness(o));
    const tasks = await loadTasks(dir);
    if (!tasks.length) {
      log.warn(`${skill.id}: no valid tasks could be generated. Using the built-in suite for it.`);
      continue;
    }
    if (o.calibrate) {
      const cal = await calibrate(key, analysis, dir, o, baseline);
      const fresh = await loadTasks(dir);
      const width = Math.max(...fresh.map((t) => t.id.length)) + 2;
      for (const t of fresh) {
        const v = cal.perTask[t.id];
        const label = v == null ? dim("not calibrated") : v >= 1 ? yellow("baseline always passes") : v <= 0 ? yellow("baseline never passes") : green("discriminates");
        log.info(`  ${t.id.padEnd(width)} ${v == null ? "  — " : `${Math.round(v * 100)}%`.padStart(4)}  ${label}${cal.hardened.includes(t.id) ? dim(" (hardened)") : ""}`);
      }
      generated.push(...fresh);
    } else generated.push(...tasks);
    log.info(dim(`  cached in ${generatedDir(key)}`));
  }

  if (!generated.length) {
    if (o.mode === "generated") throw new Error("No generated tasks available.");
    return o.builtin;
  }
  const always = o.mode === "generated" ? [] : o.builtin.filter((t) => ALWAYS.includes(t.id));
  const seen = new Set<string>();
  return [...generated, ...always].filter((t) => !seen.has(t.id) && seen.add(t.id));
}
