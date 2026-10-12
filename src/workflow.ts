import { existsSync } from "node:fs";
import { appendFile, cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import type { TaskSpec } from "./types.js";
import { tmpDir } from "./util.js";
import type { Turn } from "./customer.js";

/**
 * Workflow tasks: the agent handles a request (a customer message, an ops ticket) with mock tools
 * served over MCP. The task folder has:
 *
 *   mock/tools.mjs     export const server = "<mcp server name>"; export const tools = [{ name, description, inputSchema, run(args, db) }]
 *   mock/db.json       initial data the tools read and change
 *   solution/calls.json  reference tool calls [{ tool, args }], replayed by `validate`
 *   solution/reply.md    reference reply (all agent messages, for conversations)
 *
 * Hidden tests read what happened from RUN_DIR in the workspace: calls.jsonl, db.json, reply.md.
 */
export const RUN_DIR = ".skillarena-run";

export interface MockTool {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  run(args: Record<string, unknown>, db: Record<string, unknown>): unknown;
}

export interface MockModule {
  server: string;
  tools: MockTool[];
}

export interface CallRecord {
  tool: string;
  args: Record<string, unknown>;
  ok: boolean;
  result: unknown;
}

export async function loadMock(mockDir: string): Promise<MockModule> {
  // A query string defeats the module cache, so edits made while generating are picked up.
  const mod = (await import(`${pathToFileURL(path.join(mockDir, "tools.mjs")).href}?t=${Date.now()}`)) as Partial<MockModule>;
  if (!Array.isArray(mod.tools)) throw new Error(`${mockDir}/tools.mjs must export a tools array`);
  return { server: mod.server ?? "tools", tools: mod.tools };
}

/** Run one tool call against the mock and record it, like the MCP server does. */
export async function callTool(mock: MockModule, runDir: string, tool: string, args: Record<string, unknown>): Promise<CallRecord> {
  const dbFile = path.join(runDir, "db.json");
  const db = JSON.parse(await readFile(dbFile, "utf8"));
  const t = mock.tools.find((x) => x.name === tool);
  let rec: CallRecord;
  try {
    if (!t) throw new Error(`unknown tool: ${tool}`);
    rec = { tool, args, ok: true, result: await t.run(structuredClone(args ?? {}), db) };
    await writeFile(dbFile, JSON.stringify(db, null, 2));
  } catch (err) {
    rec = { tool, args, ok: false, result: err instanceof Error ? err.message : String(err) };
  }
  await appendFile(path.join(runDir, "calls.jsonl"), JSON.stringify(rec) + "\n");
  return rec;
}

async function freshRunDir(task: TaskSpec, runDir: string): Promise<void> {
  await rm(runDir, { recursive: true, force: true });
  await mkdir(runDir, { recursive: true });
  await cp(path.join(task.dir, "mock", "db.json"), path.join(runDir, "db.json"));
  await writeFile(path.join(runDir, "calls.jsonl"), "");
}

export interface MockSession {
  runDir: string;
  /** Claude Code --mcp-config file. */
  config: string;
  dispose(): Promise<void>;
}

/** Start state for one trial: a run dir outside the workspace and an MCP config pointing at it. */
export async function startMock(task: TaskSpec): Promise<MockSession> {
  const root = await tmpDir("mock");
  const runDir = path.join(root, "run");
  const mockDir = path.join(root, "mock");
  await cp(path.join(task.dir, "mock"), mockDir, { recursive: true });
  await freshRunDir(task, runDir);
  const { server } = await loadMock(mockDir);
  const config = path.join(root, "mcp.json");
  const script = fileURLToPath(new URL("./mock-mcp.js", import.meta.url));
  await writeFile(config, JSON.stringify({ mcpServers: { [server]: { command: process.execPath, args: [script, mockDir, runDir] } } }, null, 2));
  return { runDir, config, dispose: () => rm(root, { recursive: true, force: true }) };
}

/** Every agent message of the conversation, in order: what the customer was told. */
export const replyText = (turns: Turn[]) => turns.filter((t) => t.role === "agent").map((t) => t.text.trim()).join("\n\n---\n\n");

/**
 * Put what happened into the workspace for the hidden tests: data, calls, reply.md (all agent
 * messages) and conversation.json. Anything the agent wrote there is replaced.
 */
export async function collectRun(runDir: string, workspace: string, turns: Turn[]): Promise<void> {
  const dest = path.join(workspace, RUN_DIR);
  await rm(dest, { recursive: true, force: true });
  await cp(runDir, dest, { recursive: true });
  await writeFile(path.join(dest, "reply.md"), replyText(turns));
  await writeFile(path.join(dest, "conversation.json"), JSON.stringify(turns, null, 2));
}

/** Validation: replay the reference calls (or none, for the untouched fixture) into the workspace. */
export async function replayInto(task: TaskSpec, workspace: string, withSolution: boolean): Promise<void> {
  const runDir = await tmpDir("replay");
  try {
    await freshRunDir(task, runDir);
    let reply = "";
    if (withSolution) {
      const mock = await loadMock(path.join(task.dir, "mock"));
      const calls = JSON.parse(await readFile(path.join(task.dir, "solution", "calls.json"), "utf8")) as { tool: string; args: Record<string, unknown> }[];
      for (const c of calls) await callTool(mock, runDir, c.tool, c.args ?? {});
      const replyFile = path.join(task.dir, "solution", "reply.md");
      reply = existsSync(replyFile) ? await readFile(replyFile, "utf8") : "";
    }
    await collectRun(runDir, workspace, reply ? [{ role: "agent", text: reply }] : []);
  } finally {
    await rm(runDir, { recursive: true, force: true });
  }
}
