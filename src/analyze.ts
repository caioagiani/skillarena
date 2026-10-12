import { existsSync, readdirSync, statSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import os from "node:os";
import path from "node:path";
import { askClaude, parseJsonReply } from "./llm.js";
import type { ResolvedSkill } from "./types.js";
import { truncate } from "./util.js";

export type SkillDomain = "coding" | "tool-workflow" | "writing" | "other";

export interface Scenario {
  title: string;
  /** What the user asks for, in the user's words. */
  request: string;
  /** Why an agent with this skill should handle it better than one without. */
  whySkillMatters: string;
  /** What a script can check afterwards, independent of how the work was done. */
  verifiableOutcome: string;
}

export interface SkillAnalysis {
  name: string;
  summary: string;
  domain: SkillDomain;
  languages: string[];
  triggers: string[];
  promises: string[];
  scenarios: Scenario[];
}

const MAX_FILE = 6_000;
const MAX_TOTAL = 45_000;

/** The files that define what a skill does, most important first. */
function skillFiles(skill: ResolvedSkill): string[] {
  if (!skill.dir || !skill.install) return [];
  const root = path.join(skill.dir, skill.install.path ?? "");
  if (existsSync(root) && statSync(root).isFile()) return [root];
  const out: string[] = [];
  const walk = (dir: string, depth: number) => {
    if (depth > 5 || !existsSync(dir)) return;
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      if (e.name === ".git" || e.name === "node_modules" || e.name === "docs" || e.name === "test" || e.name === "tests") continue;
      const p = path.join(dir, e.name);
      if (e.isDirectory()) walk(p, depth + 1);
      else if (/\.(md|json|ya?ml|sh)$/i.test(e.name)) out.push(p);
    }
  };
  walk(root, 0);
  const rank = (f: string) => {
    const b = path.basename(f);
    if (b === "SKILL.md") return 0;
    if (/^(CLAUDE|AGENTS)\.md$/.test(b)) return 1;
    if (f.includes(`${path.sep}agents${path.sep}`) || f.includes(`${path.sep}commands${path.sep}`)) return 2;
    if (b === "plugin.json" || b === "hooks.json" || b === "settings.json") return 3;
    if (b === "README.md") return 4;
    return 5;
  };
  return out.sort((a, b) => rank(a) - rank(b) || a.localeCompare(b));
}

export async function skillText(skill: ResolvedSkill): Promise<string> {
  if (skill.install?.type === "builtin") return `Claude Code builtin plugin "${skill.install.plugin}". Its source is not available; infer from the name.`;
  const root = skill.dir ? path.join(skill.dir, skill.install?.path ?? "") : "";
  const parts: string[] = [];
  let total = 0;
  for (const f of skillFiles(skill)) {
    const body = truncate(await readFile(f, "utf8"), MAX_FILE);
    const rel = path.relative(statSync(root).isFile() ? path.dirname(root) : root, f) || path.basename(f);
    const chunk = `<file path="${rel}">\n${body}\n</file>`;
    if (total + chunk.length > MAX_TOTAL) break;
    parts.push(chunk);
    total += chunk.length;
  }
  return parts.join("\n\n");
}

const PROMPT = (text: string) => `You are analysing an AI coding-agent skill (a plugin, SKILL.md, CLAUDE.md or project setup) so it can be benchmarked fairly.

Read the skill files below and reply with ONLY a JSON object:
{
  "name": string,
  "summary": string,              // one or two sentences: what it changes about the agent
  "domain": "coding" | "tool-workflow" | "writing" | "other",
                                  // coding: writes or changes code in a repo
                                  // tool-workflow: drives tools/APIs/conversations (support, ops, data lookups)
  "languages": string[],          // programming languages or stacks it targets, [] if generic
  "triggers": string[],           // situations in which it is supposed to activate
  "promises": string[],           // concrete improvements it claims (fewer bugs, verification, smaller diffs...)
  "scenarios": [                  // 8 realistic requests in this skill's domain
    { "title": string, "request": string, "whySkillMatters": string, "verifiableOutcome": string }
  ]
}

Rules for scenarios:
- Write each "request" the way a real user would ask, without mentioning the skill.
- Pick situations where the skill's promises should make a measurable difference.
- "verifiableOutcome" must be checkable by a script from the end result (tests, files, output values),
  NOT by whether the agent followed the skill's procedure. Correctness comes from the request itself.
- For coding skills, scenarios must be doable in a small self-contained Node.js (ESM, no dependencies)
  repository, whatever stack the skill targets, so they can run anywhere.

<skill>
${text}
</skill>`;

function cacheDir(): string {
  return path.join(process.env.SKILLARENA_CACHE ?? path.join(os.homedir(), ".cache", "skillarena"), "generated");
}

/** Stable key for everything derived from a skill: its id plus commit (or content hash for local skills). */
export function skillKey(skill: ResolvedSkill, text: string): string {
  // Local folders change without commits: key them by content. Fetched repos are pinned by commit.
  const remote = skill.sha && skill.sha !== "local" && !path.isAbsolute(skill.repo ?? "");
  const version = remote ? skill.sha!.slice(0, 12) : createHash("sha256").update(text).digest("hex").slice(0, 12);
  return `${skill.id.replace(/[^\w.-]/g, "_")}@${version}`;
}

export function generatedDir(key: string): string {
  return path.join(cacheDir(), key);
}

export async function analyzeSkill(skill: ResolvedSkill, opts: { model: string; isolate: boolean; refresh?: boolean }): Promise<{ analysis: SkillAnalysis; key: string }> {
  const text = await skillText(skill);
  const key = skillKey(skill, text);
  const file = path.join(generatedDir(key), "analysis.json");
  if (!opts.refresh && existsSync(file)) return { analysis: JSON.parse(await readFile(file, "utf8")), key };

  let analysis: SkillAnalysis | null = null;
  let lastErr: unknown;
  for (let attempt = 0; attempt < 2 && !analysis; attempt++) {
    try {
      analysis = parseJsonReply<SkillAnalysis>(await askClaude(PROMPT(text), { model: opts.model, isolate: opts.isolate, timeoutSec: 300 }));
    } catch (err) {
      lastErr = err;
    }
  }
  if (!analysis) throw new Error(`Couldn't analyse ${skill.id}: ${lastErr instanceof Error ? lastErr.message : String(lastErr)}`);
  analysis.scenarios ??= [];
  await mkdir(generatedDir(key), { recursive: true });
  await writeFile(file, JSON.stringify(analysis, null, 2));
  return { analysis, key };
}
