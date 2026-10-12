import { existsSync, readdirSync, statSync } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { askClaude, parseJsonReply } from "./llm.js";
import { validateTask } from "./tasks.js";
import type { TaskSpec } from "./types.js";
import { truncate } from "./util.js";

export interface AuditResult {
  fair: boolean;
  issues: { test: string; reason: string }[];
}

async function filesUnder(dir: string, max: number): Promise<string> {
  const out: string[] = [];
  let total = 0;
  const walk = (d: string) => {
    for (const e of readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) walk(p);
      else if (statSync(p).size < 60_000) out.push(p);
    }
  };
  if (existsSync(dir)) walk(dir);
  const parts: string[] = [];
  for (const f of out.sort()) {
    const chunk = `<file path="${path.relative(dir, f)}">\n${truncate(await readFile(f, "utf8"), 8000)}\n</file>`;
    if (total + chunk.length > max) break;
    parts.push(chunk);
    total += chunk.length;
  }
  return parts.join("\n");
}

const PROMPT = (task: TaskSpec, repo: string, hidden: string, mustChange: string[], failing?: string[]) => `You audit a benchmark task for coding agents before it is used. Be strict.

An agent receives the REQUEST and the REPO. It never sees the HIDDEN tests, which grade its work.
A task is fair only if a careful, competent engineer could pass every hidden test using only the
request and what the repo states (README, doc comments, existing tests, existing code behaviour).

Flag a hidden test as unfair if it:
- checks behaviour that is not written anywhere the agent can read,
- contradicts the request (e.g. the request says "keep everything else as is" but the test requires changing other behaviour),
- relies on trick inputs whose expected result isn't specified (prototype keys, odd unicode, exact error wording that isn't documented),
- checks how the work was done rather than the result.

These hidden tests FAIL on the untouched repo, so each one forces the agent to change that behaviour:
${mustChange.map((t) => `  - ${t}`).join("\n") || "  (none)"}
For each, ask: does the REQUEST ask for this change, or explicitly invite the agent to find and fix
problems of this kind? If the request limits the scope ("only X", "keep everything else as is",
"the rest works fine"), a test that forces changes outside that scope is unfair, even if a README
describes the desired behaviour.
${failing?.length ? `\nA strong agent failed these tests on every attempt; look at them first: ${failing.join(", ")}\n` : ""}
Reply with ONLY JSON: {"fair": boolean, "issues": [{"test": string, "reason": string}]}

<request>
${task.prompt.trim()}
</request>

<repo>
${repo}
</repo>

<hidden>
${hidden}
</hidden>`;

/** Independent fairness review of a (generated) task. */
export async function auditTask(task: TaskSpec, opts: { model: string; isolate: boolean; failing?: string[] }): Promise<AuditResult> {
  const repo = await filesUnder(path.join(task.dir, "repo"), 30_000);
  const hidden = await filesUnder(path.join(task.dir, "hidden"), 20_000);
  const mustChange = (await validateTask(task)).before.failedTests;
  const reply = await askClaude(PROMPT(task, repo, hidden, mustChange, opts.failing), { model: opts.model, isolate: opts.isolate, timeoutSec: 300 });
  const r = parseJsonReply<AuditResult>(reply);
  return { fair: Boolean(r.fair) && !(r.issues ?? []).length, issues: r.issues ?? [] };
}
