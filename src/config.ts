import { existsSync } from "node:fs";
import { chmod, mkdir, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import readline from "node:readline";

const CONFIG_DIR = process.env.SKILLARENA_CONFIG ?? path.join(process.env.XDG_CONFIG_HOME ?? path.join(os.homedir(), ".config"), "skillarena");
const CREDENTIALS = path.join(CONFIG_DIR, "credentials.json");

export const credentialsPath = CREDENTIALS;

/** Load saved credentials and ./.env into process.env. Real environment variables always win. */
export async function loadEnv(): Promise<void> {
  const before = { ...process.env };
  if (existsSync(CREDENTIALS)) {
    const saved = JSON.parse(await readFile(CREDENTIALS, "utf8")) as Record<string, string>;
    for (const [k, v] of Object.entries(saved)) process.env[k] = v;
  }
  if (existsSync(".env")) process.loadEnvFile(".env");
  Object.assign(process.env, before);
}

export async function saveCredential(name: string, value: string): Promise<void> {
  await mkdir(CONFIG_DIR, { recursive: true });
  const saved = existsSync(CREDENTIALS) ? (JSON.parse(await readFile(CREDENTIALS, "utf8")) as Record<string, string>) : {};
  saved[name] = value;
  await writeFile(CREDENTIALS, JSON.stringify(saved, null, 2));
  await chmod(CREDENTIALS, 0o600);
}

/** Prompt without echoing what the user types (for tokens). */
export function askSecret(question: string): Promise<string> {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    const rlAny = rl as unknown as { _writeToOutput: (s: string) => void; output: NodeJS.WriteStream };
    let prompted = false;
    rlAny._writeToOutput = (s: string) => {
      if (!prompted) {
        rlAny.output.write(s);
        prompted = true;
      } else if (s.includes("\n")) rlAny.output.write("\n");
    };
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

export function hasClaudeAuth(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY || process.env.CLAUDE_CODE_OAUTH_TOKEN || process.env.ANTHROPIC_AUTH_TOKEN);
}
