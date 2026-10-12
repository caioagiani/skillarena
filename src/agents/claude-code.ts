import { createWriteStream } from "node:fs";
import { cp } from "node:fs/promises";
import path from "node:path";
import { hasClaudeAuth } from "../config.js";
import { claudeCodeProviderEnv, type Provider } from "../providers.js";
import type { Agent, AgentRunInput, AgentRunResult, ResolvedSkill } from "../types.js";
import { exec, log, tmpDir, which } from "../util.js";
import { installSkill } from "./install.js";

export interface ClaudeCodeOptions {
  isolate: boolean;
  /** Non-Anthropic provider reached through its Anthropic-compatible endpoint. */
  provider?: Provider;
  baseUrl?: string;
  model?: string;
}

/**
 * Claude Code in headless mode. Every trial gets a fresh CLAUDE_CONFIG_DIR so the
 * user's own CLAUDE.md, plugins, skills, hooks and settings never leak into a run.
 */
export function claudeCode(opts: ClaudeCodeOptions): Agent {
  const thirdParty = Boolean(opts.baseUrl || (opts.provider && opts.provider.id !== "anthropic"));
  let template: string | null = null;
  const providerEnv = () =>
    thirdParty ? claudeCodeProviderEnv(opts.provider ?? { id: "custom", keyEnv: "ANTHROPIC_AUTH_TOKEN" }, opts.model!, opts.baseUrl) : {};
  return {
    id: "claude-code",

    async preflight() {
      if (!(await which("claude"))) throw new Error("`claude` not found. Install Claude Code: npm i -g @anthropic-ai/claude-code");
      if (thirdParty) {
        if (!opts.model) throw new Error("--model is required with --provider / --base-url (e.g. --provider openrouter --model moonshotai/kimi-k2)");
        claudeCodeProviderEnv(opts.provider ?? { id: "custom", keyEnv: "ANTHROPIC_AUTH_TOKEN" }, opts.model, opts.baseUrl);
      } else if (opts.isolate && !hasClaudeAuth()) {
        throw new Error("Not logged in. Run `npx skillarena login` (uses your Claude subscription), or set ANTHROPIC_API_KEY.");
      }
    },

    /**
     * A brand-new config dir hasn't fetched Claude Code's remote config yet, so the first session
     * runs without things a real install has (builtin plugins only appear from the second session).
     * Warm one clean template with a tiny session and copy it into every trial.
     */
    async setup() {
      if (!opts.isolate) return;
      template = await tmpDir("cfg-template");
      const cwd = await tmpDir("warmup");
      const env = { ...process.env, DISABLE_AUTOUPDATER: "1", CLAUDE_CONFIG_DIR: template, ...providerEnv() };
      const model = thirdParty ? opts.model! : "haiku";
      const r = await exec("claude", ["-p", "Reply with: ok", "--model", model, "--no-session-persistence", "--output-format", "json"], { cwd, env, timeoutSec: 180 });
      if (r.code !== 0) log.warn(`config warm-up failed (exit ${r.code}); trials start from a cold config`);
    },

    prepareWorkspace(workspace: string, skill: ResolvedSkill) {
      return installSkill(workspace, skill, { instructionsFile: "CLAUDE.md", skillsDir: ".claude/skills", plugins: "native" });
    },

    async run(input: AgentRunInput): Promise<AgentRunResult> {
      const args = [
        "-p",
        input.prompt,
        "--output-format",
        "stream-json",
        "--verbose",
        "--dangerously-skip-permissions",
        "--no-session-persistence",
      ];
      if (input.model) args.push("--model", input.model);
      args.push(...input.extraArgs);
      if (input.maxBudgetUsd && !thirdParty) args.push("--max-budget-usd", String(input.maxBudgetUsd));
      if (input.skill.install?.type === "plugin" && input.skill.dir) {
        args.push("--plugin-dir", path.join(input.skill.dir, input.skill.install.path ?? ""));
      }
      if (input.builtins.length) {
        const own = input.skill.install?.type === "builtin" ? input.skill.install.plugin : null;
        const enabledPlugins = Object.fromEntries(input.builtins.map((b) => [b, b === own]));
        args.push("--settings", JSON.stringify({ enabledPlugins }));
      }

      const env: NodeJS.ProcessEnv = { ...process.env, DISABLE_AUTOUPDATER: "1" };
      if (opts.isolate) {
        env.CLAUDE_CONFIG_DIR = input.configDir;
        if (template) {
          const skip = new Set(["projects", "sessions", "backups", "file-history", "todos", "shell-snapshots"]);
          await cp(template, input.configDir, { recursive: true, filter: (f) => !skip.has(path.relative(template!, f).split(path.sep)[0]) });
        }
      }
      Object.assign(env, providerEnv());

      const transcript = createWriteStream(input.transcriptPath);
      const r = await exec("claude", args, {
        cwd: input.workspace,
        env,
        timeoutSec: input.timeoutSec,
        onStdout: (c) => transcript.write(c),
      });
      await new Promise((res) => transcript.end(res));

      const out = parseStream(r.stdout, {
        timedOut: r.timedOut,
        exitCode: r.code,
        durationMs: r.durationMs,
        stderr: r.stderr,
      });
      // Claude Code prices tokens at Anthropic rates; that number is meaningless for other providers.
      if (thirdParty) {
        out.costUsd = null;
        out.model = opts.model;
      }
      return out;
    },
  };
}

interface StreamMeta {
  timedOut: boolean;
  exitCode: number | null;
  durationMs: number;
  stderr: string;
}

export function parseStream(stdout: string, meta: StreamMeta): AgentRunResult {
  const out: AgentRunResult = {
    finalMessage: "",
    costUsd: null,
    inputTokens: 0,
    outputTokens: 0,
    cacheReadTokens: 0,
    cacheWriteTokens: 0,
    turns: 0,
    durationMs: meta.durationMs,
    timedOut: meta.timedOut,
    exitCode: meta.exitCode,
    commands: [],
  };
  let lastAssistantText = "";
  let sawResult = false;

  for (const line of stdout.split("\n")) {
    if (!line.trim().startsWith("{")) continue;
    let ev: any;
    try {
      ev = JSON.parse(line);
    } catch {
      continue;
    }
    if (ev.type === "system" && ev.subtype === "init") {
      if (ev.model) out.model = ev.model;
      if (Array.isArray(ev.plugins)) {
        out.loadedPlugins = ev.plugins.filter((p: any) => p.path && p.path !== "builtin").map((p: any) => ({ name: p.name, path: p.path }));
        out.builtinPlugins = ev.plugins.filter((p: any) => p.path === "builtin").map((p: any) => String(p.name));
      }
    }
    if (ev.type === "assistant" && Array.isArray(ev.message?.content) && !ev.parent_tool_use_id) {
      const text = ev.message.content
        .filter((c: any) => c.type === "text")
        .map((c: any) => c.text)
        .join("\n");
      if (text.trim()) lastAssistantText = text;
    }
    if (ev.type === "assistant" && Array.isArray(ev.message?.content)) {
      for (const c of ev.message.content) {
        if (c.type === "tool_use" && c.name === "Bash" && typeof c.input?.command === "string") out.commands.push(c.input.command);
      }
    }
    if (ev.type === "result") {
      sawResult = true;
      out.finalMessage = typeof ev.result === "string" ? ev.result : lastAssistantText;
      out.costUsd = typeof ev.total_cost_usd === "number" ? ev.total_cost_usd : null;
      out.turns = ev.num_turns ?? 0;
      const u = ev.usage ?? {};
      out.inputTokens = u.input_tokens ?? 0;
      out.outputTokens = u.output_tokens ?? 0;
      out.cacheReadTokens = u.cache_read_input_tokens ?? 0;
      out.cacheWriteTokens = u.cache_creation_input_tokens ?? 0;
      if (ev.is_error) out.error = `agent error: ${ev.subtype ?? ""} ${typeof ev.result === "string" ? ev.result : ""}`.trim();
    }
  }

  if (!out.finalMessage) out.finalMessage = lastAssistantText;
  if (!sawResult && !meta.timedOut) out.error = `no result event (exit ${meta.exitCode}): ${meta.stderr.slice(-500)}`;
  if (meta.timedOut) out.error = "timeout";
  return out;
}
