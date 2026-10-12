/**
 * LLM providers. Claude Code talks to any Anthropic-compatible endpoint (`anthropicBase`);
 * the judge talks to any OpenAI-compatible endpoint (`openaiBase`). OpenCode reaches every
 * provider on its own via `--model provider/model`.
 */
export interface Provider {
  id: string;
  /** Env var holding the API key. */
  keyEnv: string;
  /** Anthropic Messages API base URL, for running Claude Code against this provider. */
  anthropicBase?: string;
  /** OpenAI Chat Completions base URL, for the judge. */
  openaiBase?: string;
  /** Key used when the provider needs none (local servers). */
  defaultKey?: string;
}

export const PROVIDERS: Record<string, Provider> = {
  anthropic: { id: "anthropic", keyEnv: "ANTHROPIC_API_KEY" },
  openai: { id: "openai", keyEnv: "OPENAI_API_KEY", openaiBase: "https://api.openai.com/v1" },
  openrouter: {
    id: "openrouter",
    keyEnv: "OPENROUTER_API_KEY",
    anthropicBase: "https://openrouter.ai/api",
    openaiBase: "https://openrouter.ai/api/v1",
  },
  deepseek: {
    id: "deepseek",
    keyEnv: "DEEPSEEK_API_KEY",
    anthropicBase: "https://api.deepseek.com/anthropic",
    openaiBase: "https://api.deepseek.com/v1",
  },
  zai: {
    id: "zai",
    keyEnv: "ZAI_API_KEY",
    anthropicBase: "https://api.z.ai/api/anthropic",
    openaiBase: "https://api.z.ai/api/paas/v4",
  },
  moonshot: {
    id: "moonshot",
    keyEnv: "MOONSHOT_API_KEY",
    anthropicBase: "https://api.moonshot.ai/anthropic",
    openaiBase: "https://api.moonshot.ai/v1",
  },
  groq: { id: "groq", keyEnv: "GROQ_API_KEY", openaiBase: "https://api.groq.com/openai/v1" },
  gemini: { id: "gemini", keyEnv: "GEMINI_API_KEY", openaiBase: "https://generativelanguage.googleapis.com/v1beta/openai" },
  ollama: {
    id: "ollama",
    keyEnv: "OLLAMA_API_KEY",
    anthropicBase: "http://localhost:11434",
    openaiBase: "http://localhost:11434/v1",
    defaultKey: "ollama",
  },
};

export function getProvider(id: string): Provider {
  const p = PROVIDERS[id];
  if (!p) throw new Error(`Unknown provider "${id}". Available: ${Object.keys(PROVIDERS).join(", ")}`);
  return p;
}

export function providerKey(p: Provider): string | undefined {
  return process.env[p.keyEnv] || p.defaultKey;
}

/**
 * Environment that points Claude Code at a non-Anthropic endpoint and keeps every internal
 * call (subagents, background "small/fast" calls) on the model under test.
 */
export function claudeCodeProviderEnv(p: Provider, model: string, baseUrl?: string): NodeJS.ProcessEnv {
  const base = baseUrl ?? p.anthropicBase;
  if (!base) throw new Error(`Provider "${p.id}" has no Anthropic-compatible endpoint. Use --agent opencode, or pass --base-url.`);
  const key = providerKey(p) ?? process.env.ANTHROPIC_AUTH_TOKEN;
  if (!key) throw new Error(`Set ${p.keyEnv} (or run: skillarena login ${p.keyEnv}).`);
  return {
    ANTHROPIC_BASE_URL: base,
    ANTHROPIC_AUTH_TOKEN: key,
    ANTHROPIC_API_KEY: "",
    ANTHROPIC_MODEL: model,
    ANTHROPIC_DEFAULT_OPUS_MODEL: model,
    ANTHROPIC_DEFAULT_SONNET_MODEL: model,
    ANTHROPIC_DEFAULT_HAIKU_MODEL: model,
    ANTHROPIC_SMALL_FAST_MODEL: model,
    CLAUDE_CODE_SUBAGENT_MODEL: model,
  };
}
