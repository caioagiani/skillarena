/**
 * Minimal MCP stdio server for workflow tasks: `node mock-mcp.js <mockDir> <runDir>`.
 * Serves the tools in <mockDir>/tools.mjs over the state in <runDir>/db.json and logs every call.
 */
import { createInterface } from "node:readline";
import { callTool, loadMock } from "./workflow.js";

const [mockDir, runDir] = process.argv.slice(2);
if (!mockDir || !runDir) {
  process.stderr.write("usage: mock-mcp <mockDir> <runDir>\n");
  process.exit(2);
}
const mock = await loadMock(mockDir);

const send = (msg: unknown) => process.stdout.write(JSON.stringify(msg) + "\n");

async function handle(method: string, params: Record<string, unknown> | undefined): Promise<unknown> {
  switch (method) {
    case "initialize":
      return {
        protocolVersion: (params?.protocolVersion as string) ?? "2025-06-18",
        capabilities: { tools: {} },
        serverInfo: { name: mock.server, version: "1.0.0" },
      };
    case "ping":
      return {};
    case "tools/list":
      return { tools: mock.tools.map(({ name, description, inputSchema }) => ({ name, description, inputSchema })) };
    case "tools/call": {
      const rec = await callTool(mock, runDir, String(params?.name), (params?.arguments as Record<string, unknown>) ?? {});
      const text = typeof rec.result === "string" ? rec.result : JSON.stringify(rec.result ?? null, null, 2);
      return { content: [{ type: "text", text }], isError: !rec.ok };
    }
    default:
      throw Object.assign(new Error(`method not found: ${method}`), { code: -32601 });
  }
}

// Calls are handled one at a time so the shared db.json never sees concurrent writes.
let queue = Promise.resolve();
createInterface({ input: process.stdin }).on("line", (line) => {
  if (!line.trim()) return;
  let msg: { id?: number | string; method?: string; params?: Record<string, unknown> };
  try {
    msg = JSON.parse(line);
  } catch {
    return send({ jsonrpc: "2.0", id: null, error: { code: -32700, message: "parse error" } });
  }
  if (!msg.method) return;
  queue = queue.then(async () => {
    if (msg.id === undefined) return; // notification
    try {
      send({ jsonrpc: "2.0", id: msg.id, result: await handle(msg.method!, msg.params) });
    } catch (err) {
      const e = err as { code?: number; message?: string };
      send({ jsonrpc: "2.0", id: msg.id, error: { code: e.code ?? -32603, message: e.message ?? String(err) } });
    }
  });
});
