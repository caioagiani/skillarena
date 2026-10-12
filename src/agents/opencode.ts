import { createWriteStream, existsSync } from "node:fs";
import { copyFile, mkdir } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { Agent, AgentRunInput, AgentRunResult, ResolvedSkill } from "../types.js";
import { exec, which } from "../util.js";
import { installSkill } from "./install.js";

/**
 * OpenCode: runs any model from any provider (`--model provider/model`), including local
 * ones. Isolation uses throwaway XDG dirs; only the user's provider credentials are copied in.
 */
export function opencode(opts: { isolate: boolean }): Agent {
  return {
    id: "opencode",

    async preflight() {
      if (!(await which("opencode"))) throw new Error("`opencode` not found. Install: npm i -g opencode-ai");
    },

    prepareWorkspace(workspace: string, skill: ResolvedSkill) {
      return installSkill(workspace, skill, { instructionsFile: "AGENTS.md", skillsDir: ".opencode/skills", plugins: "copy" });
    },

    async run(input: AgentRunInput): Promise<AgentRunResult> {
      if (!input.model) throw new Error("--model provider/model is required for opencode (see `opencode models`)");
      const args = ["run", "--format", "json", "--dangerously-skip-permissions", "--dir", input.workspace, "--model", input.model, input.prompt];

      const env: NodeJS.ProcessEnv = { ...process.env };
      if (opts.isolate) {
        const x = input.configDir;
        Object.assign(env, {
          XDG_CONFIG_HOME: path.join(x, "config"),
          XDG_DATA_HOME: path.join(x, "data"),
          XDG_STATE_HOME: path.join(x, "state"),
          XDG_CACHE_HOME: path.join(x, "cache"),
        });
        const auth = path.join(process.env.XDG_DATA_HOME ?? path.join(os.homedir(), ".local", "share"), "opencode", "auth.json");
        if (existsSync(auth)) {
          await mkdir(path.join(x, "data", "opencode"), { recursive: true });
          await copyFile(auth, path.join(x, "data", "opencode", "auth.json"));
        }
      }

      const transcript = createWriteStream(input.transcriptPath);
      const r = await exec("opencode", args, {
        cwd: input.workspace,
        env,
        timeoutSec: input.timeoutSec,
        onStdout: (c) => transcript.write(c),
      });
      await new Promise((res) => transcript.end(res));

      const out = parseOpencode(r.stdout);
      out.durationMs = r.durationMs;
      out.timedOut = r.timedOut;
      out.exitCode = r.code;
      out.model = input.model;
      if (r.timedOut) out.error = "timeout";
      else if (!out.error && r.code !== 0) out.error = `exit ${r.code}: ${r.stderr.slice(-500)}`;
      return out;
    },
  };
}

export function parseOpencode(stdout: string): AgentRunResult {
  const out: AgentRunResult = {
    finalMessage: "",
    costUsd: null,
    inputTokens: 0,
    outputTokens: 0,
    cacheReadTokens: 0,
    cacheWriteTokens: 0,
    turns: 0,
    durationMs: 0,
    timedOut: false,
    exitCode: null,
    commands: [],
  };
  let lastText = "";
  let cost = 0;
  let sawCost = false;
  for (const line of stdout.split("\n")) {
    if (!line.startsWith("{")) continue;
    let ev: any;
    try {
      ev = JSON.parse(line);
    } catch {
      continue;
    }
    const part = ev.part ?? {};
    if (ev.type === "error") {
      out.error = String(ev.error?.data?.message ?? ev.error?.name ?? "error").slice(0, 500);
      continue;
    }
    if (part.type === "text" && typeof part.text === "string" && part.text.trim()) lastText = part.text;
    if (part.type === "tool" && part.tool === "bash" && typeof part.state?.input?.command === "string") out.commands.push(part.state.input.command);
    if (part.type === "step-finish" || ev.type === "step_finish") {
      out.turns++;
      const t = part.tokens ?? {};
      out.inputTokens += t.input ?? 0;
      out.outputTokens += (t.output ?? 0) + (t.reasoning ?? 0);
      out.cacheReadTokens += t.cache?.read ?? 0;
      out.cacheWriteTokens += t.cache?.write ?? 0;
      if (typeof part.cost === "number") {
        cost += part.cost;
        sawCost = true;
      }
    }
  }
  out.finalMessage = lastText;
  out.costUsd = sawCost ? cost : null;
  return out;
}
