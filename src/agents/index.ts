import type { Provider } from "../providers.js";
import type { Agent } from "../types.js";
import { claudeCode } from "./claude-code.js";
import { codex } from "./codex.js";
import { opencode } from "./opencode.js";

export const AGENTS = ["claude-code", "codex", "opencode"] as const;

export interface AgentOptions {
  isolate: boolean;
  provider?: Provider;
  baseUrl?: string;
  model?: string;
}

export function getAgent(id: string, opts: AgentOptions): Agent {
  switch (id) {
    case "claude-code":
      return claudeCode(opts);
    case "codex":
      return codex(opts);
    case "opencode":
      return opencode(opts);
    default:
      throw new Error(`Unknown agent "${id}". Available: ${AGENTS.join(", ")}`);
  }
}
