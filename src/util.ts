import { spawn } from "node:child_process";
import { mkdtemp } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

export interface ExecResult {
  code: number | null;
  stdout: string;
  stderr: string;
  timedOut: boolean;
  durationMs: number;
}

export interface ExecOptions {
  cwd?: string;
  env?: NodeJS.ProcessEnv;
  timeoutSec?: number;
  input?: string;
  /** Called with each stdout chunk (used to stream transcripts to disk). */
  onStdout?: (chunk: string) => void;
}

/** Run a command without a shell. Kills the whole process group on timeout. */
export function exec(cmd: string, args: string[], opts: ExecOptions = {}): Promise<ExecResult> {
  return new Promise((resolve) => {
    const started = Date.now();
    const child = spawn(cmd, args, {
      cwd: opts.cwd,
      env: opts.env ?? process.env,
      detached: true,
      stdio: ["pipe", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    let timedOut = false;
    const timer =
      opts.timeoutSec != null
        ? setTimeout(() => {
            timedOut = true;
            try {
              process.kill(-child.pid!, "SIGKILL");
            } catch {
              child.kill("SIGKILL");
            }
          }, opts.timeoutSec * 1000)
        : null;

    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (c: string) => {
      stdout += c;
      opts.onStdout?.(c);
    });
    child.stderr.on("data", (c: string) => (stderr += c));
    child.on("error", (err) => {
      if (timer) clearTimeout(timer);
      resolve({ code: null, stdout, stderr: stderr + String(err), timedOut, durationMs: Date.now() - started });
    });
    child.on("close", (code) => {
      if (timer) clearTimeout(timer);
      resolve({ code, stdout, stderr, timedOut, durationMs: Date.now() - started });
    });
    if (opts.input != null) child.stdin.end(opts.input);
    else child.stdin.end();
  });
}

/** Run through the user's shell (for task-defined test commands). */
export function sh(command: string, opts: ExecOptions = {}): Promise<ExecResult> {
  return exec("/bin/sh", ["-c", command], opts);
}

export async function which(bin: string): Promise<boolean> {
  const r = await exec("/bin/sh", ["-c", `command -v ${bin}`]);
  return r.code === 0;
}

export function tmpDir(prefix: string): Promise<string> {
  return mkdtemp(path.join(os.tmpdir(), `skillarena-${prefix}-`));
}

export function matchesAny(file: string, globs: string[]): boolean {
  return globs.some((g) => path.matchesGlob(file, g));
}

/** Run async jobs with a fixed concurrency limit. */
export async function pool<T>(items: T[], limit: number, fn: (item: T, i: number) => Promise<void>): Promise<void> {
  let next = 0;
  const workers = Array.from({ length: Math.max(1, Math.min(limit, items.length)) }, async () => {
    while (next < items.length) {
      const i = next++;
      await fn(items[i], i);
    }
  });
  await Promise.all(workers);
}

/** Split a command-line string into arguments, honouring single and double quotes. */
/** Split a flag string like a POSIX shell: quotes group (and are removed), anywhere in a word. */
export function splitArgs(s: string): string[] {
  const out: string[] = [];
  let cur = "";
  let inWord = false;
  let quote: '"' | "'" | null = null;
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (quote) {
      if (ch === quote) quote = null;
      else if (ch === "\\" && quote === '"' && (s[i + 1] === '"' || s[i + 1] === "\\")) cur += s[++i];
      else cur += ch;
    } else if (ch === '"' || ch === "'") {
      quote = ch;
      inWord = true;
    } else if (ch === "\\" && i + 1 < s.length) {
      cur += s[++i];
      inWord = true;
    } else if (/\s/.test(ch)) {
      if (inWord) out.push(cur);
      cur = "";
      inWord = false;
    } else {
      cur += ch;
      inWord = true;
    }
  }
  if (quote) throw new Error(`Unterminated ${quote} in --agent-args`);
  if (inWord) out.push(cur);
  return out;
}

export function truncate(s: string, max: number): string {
  return s.length <= max ? s : s.slice(0, max) + `… [${s.length - max} more chars]`;
}

export const log = {
  info: (msg: string) => process.stderr.write(`${msg}\n`),
  warn: (msg: string) => process.stderr.write(`\x1b[33m! ${msg}\x1b[0m\n`),
  error: (msg: string) => process.stderr.write(`\x1b[31m✗ ${msg}\x1b[0m\n`),
};
