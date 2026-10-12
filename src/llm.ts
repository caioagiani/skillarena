import { exec, tmpDir } from "./util.js";

export interface AskOptions {
  model: string;
  /** Fresh CLAUDE_CONFIG_DIR so the user's own setup never shapes the answer. */
  isolate: boolean;
  timeoutSec?: number;
}

/** One-shot, tool-less question to Claude through headless Claude Code. */
export async function askClaude(prompt: string, opts: AskOptions): Promise<string> {
  const cwd = await tmpDir("ask");
  const env: NodeJS.ProcessEnv = { ...process.env, DISABLE_AUTOUPDATER: "1" };
  if (opts.isolate) env.CLAUDE_CONFIG_DIR = await tmpDir("ask-cfg");
  const r = await exec(
    "claude",
    ["-p", prompt, "--output-format", "json", "--model", opts.model, "--no-session-persistence", "--tools", ""],
    { cwd, env, timeoutSec: opts.timeoutSec ?? 300 },
  );
  let out: { result?: string; is_error?: boolean };
  try {
    out = JSON.parse(r.stdout);
  } catch {
    throw new Error(`claude returned no JSON (exit ${r.code}): ${r.stderr.slice(-300) || r.stdout.slice(-300)}`);
  }
  if (out.is_error || typeof out.result !== "string") throw new Error(`claude error: ${String(out.result ?? "").slice(0, 300)}`);
  return out.result;
}

/** Pull the first JSON object out of a model reply (tolerates ```json fences and prose). */
export function parseJsonReply<T>(text: string): T {
  const fenced = /```(?:json)?\s*([\s\S]*?)```/.exec(text);
  const body = fenced ? fenced[1] : text;
  const start = body.indexOf("{");
  const end = body.lastIndexOf("}");
  if (start === -1 || end <= start) throw new Error("no JSON object in reply");
  return JSON.parse(body.slice(start, end + 1)) as T;
}
