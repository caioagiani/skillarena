import { createWriteStream } from "node:fs";
import type { Agent, AgentRunInput, AgentRunResult, ResolvedSkill } from "../types.js";
import { exec, which } from "../util.js";
import { installSkill } from "./install.js";

/**
 * OpenAI Codex CLI (experimental). Skills are installed the way Codex discovers them:
 * instructions as AGENTS.md, skill folders under .agents/skills. Plugins are approximated
 * by copying the plugin's `skills/` folder and root AGENTS.md when present.
 */
export function codex(opts: { isolate: boolean; extraArgs?: string[] }): Agent {
  const local = (opts.extraArgs ?? []).includes("--oss");
  return {
    id: "codex",

    async preflight() {
      if (!(await which("codex"))) throw new Error("`codex` not found. Install: npm i -g @openai/codex");
      if (opts.isolate && !local && !process.env.OPENAI_API_KEY && !process.env.CODEX_API_KEY) {
        throw new Error(
          'Isolated Codex runs need OPENAI_API_KEY (run `npx skillarena login OPENAI_API_KEY`), a local model (--agent-args "--oss"), or --no-isolate.',
        );
      }
    },

    prepareWorkspace(workspace: string, skill: ResolvedSkill) {
      return installSkill(workspace, skill, { instructionsFile: "AGENTS.md", skillsDir: ".agents/skills", plugins: "copy" });
    },

    async run(input: AgentRunInput): Promise<AgentRunResult> {
      const args = [
        "exec",
        "--json",
        "--dangerously-bypass-approvals-and-sandbox",
        "--skip-git-repo-check",
        "--ephemeral",
        "-C",
        input.workspace,
      ];
      if (input.model) args.push("-m", input.model);
      args.push(...input.extraArgs);
      args.push(input.prompt);

      const env: NodeJS.ProcessEnv = { ...process.env };
      if (opts.isolate) {
        env.CODEX_HOME = input.configDir;
        if (!env.CODEX_API_KEY && process.env.OPENAI_API_KEY) env.CODEX_API_KEY = process.env.OPENAI_API_KEY;
      }

      const transcript = createWriteStream(input.transcriptPath);
      const r = await exec("codex", args, {
        cwd: input.workspace,
        env,
        timeoutSec: input.timeoutSec,
        onStdout: (c) => transcript.write(c),
      });
      await new Promise((res) => transcript.end(res));

      const out: AgentRunResult = {
        finalMessage: "",
        costUsd: null,
        inputTokens: 0,
        outputTokens: 0,
        cacheReadTokens: 0,
        cacheWriteTokens: 0,
        turns: 0,
        durationMs: r.durationMs,
        timedOut: r.timedOut,
        exitCode: r.code,
        commands: [],
        model: input.model,
      };
      for (const line of r.stdout.split("\n")) {
        if (!line.startsWith("{")) continue;
        let ev: any;
        try {
          ev = JSON.parse(line);
        } catch {
          continue;
        }
        const item = ev.item;
        if (ev.type === "item.completed" && item?.type === "agent_message" && item.text) out.finalMessage = item.text;
        if (ev.type === "item.completed" && item?.type === "command_execution" && item.command) out.commands.push(item.command);
        if (ev.type === "turn.completed" && ev.usage) {
          out.turns++;
          out.inputTokens += ev.usage.input_tokens ?? 0;
          out.cacheReadTokens += ev.usage.cached_input_tokens ?? 0;
          out.outputTokens += ev.usage.output_tokens ?? 0;
        }
        if (ev.type === "error" || ev.type === "turn.failed") out.error = JSON.stringify(ev.error ?? ev.message ?? ev).slice(0, 500);
      }
      if (r.timedOut) out.error = "timeout";
      else if (r.code !== 0 && !out.error) out.error = `exit ${r.code}: ${r.stderr.slice(-500)}`;
      return out;
    },
  };
}
