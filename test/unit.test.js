import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { parseStream } from "../dist/agents/claude-code.js";
import { parseOpencode } from "../dist/agents/opencode.js";
import { heuristicClaims, ranTests } from "../dist/honesty.js";
import { detectInstall, parseSkillArg } from "../dist/skills.js";
import { bootstrapDelta, wilson } from "../dist/stats.js";
import { parseTestCounts } from "../dist/tasks.js";

const meta = { timedOut: false, exitCode: 0, durationMs: 1000, stderr: "" };

test("parses Claude Code stream-json", () => {
  const lines = [
    { type: "system", subtype: "init", model: "claude-sonnet", plugins: [{ name: "x", path: "/p/x" }, { name: "b", path: "builtin" }] },
    { type: "assistant", message: { content: [{ type: "tool_use", name: "Bash", input: { command: "npm test" } }] } },
    { type: "assistant", message: { content: [{ type: "text", text: "Done." }] } },
    { type: "result", result: "All tests pass.", total_cost_usd: 0.12, num_turns: 4, usage: { input_tokens: 10, output_tokens: 20, cache_read_input_tokens: 30, cache_creation_input_tokens: 40 } },
  ];
  const r = parseStream(lines.map((l) => JSON.stringify(l)).join("\n"), meta);
  assert.equal(r.finalMessage, "All tests pass.");
  assert.equal(r.costUsd, 0.12);
  assert.equal(r.turns, 4);
  assert.deepEqual([r.inputTokens, r.outputTokens, r.cacheReadTokens, r.cacheWriteTokens], [10, 20, 30, 40]);
  assert.deepEqual(r.commands, ["npm test"]);
  assert.deepEqual(r.loadedPlugins, [{ name: "x", path: "/p/x" }]);
  assert.equal(r.error, undefined);
});

test("flags a missing result event", () => {
  assert.match(parseStream("", { ...meta, exitCode: 1, stderr: "boom" }).error, /no result event/);
});

test("parses OpenCode json events", () => {
  const lines = [
    { type: "tool_use", part: { type: "tool", tool: "bash", state: { input: { command: "node --test" } } } },
    { type: "text", part: { type: "text", text: "Fixed it." } },
    { type: "step_finish", part: { type: "step-finish", cost: 0.01, tokens: { input: 5, output: 6, reasoning: 1, cache: { read: 2, write: 3 } } } },
  ];
  const r = parseOpencode(lines.map((l) => JSON.stringify(l)).join("\n"));
  assert.equal(r.finalMessage, "Fixed it.");
  assert.deepEqual(r.commands, ["node --test"]);
  assert.equal(r.costUsd, 0.01);
  assert.deepEqual([r.inputTokens, r.outputTokens, r.cacheReadTokens, r.cacheWriteTokens, r.turns], [5, 7, 2, 3, 1]);
});

test("heuristic claims", () => {
  assert.equal(heuristicClaims("Fixed. All tests pass.").claimedDone, true);
  assert.equal(heuristicClaims("I couldn't make the last test pass.").claimedDone, false);
  assert.equal(heuristicClaims("The tests contradict each other.", "x").metExpectation, true);
});

test("detects test commands", () => {
  assert.equal(ranTests(["cd x && npm test"]), true);
  assert.equal(ranTests(["node --test-reporter=tap --test test/"]), true);
  assert.equal(ranTests(["cat src/a.js"]), false);
});

test("parses node test counts and failures", async () => {
  const { parseFailedTests } = await import("../dist/tasks.js");
  assert.deepEqual(parseTestCounts("# tests 3\n# pass 2\n# fail 1\n"), { passed: 2, failed: 1 });
  assert.deepEqual(parseFailedTests("ok 1 - a\nnot ok 2 - pointer escaping\n  ---\nnot ok 3 - b # TODO\n    not ok 1 - nested"), ["pointer escaping", "b"]);
});

test("parses skill arguments", () => {
  const reg = [{ id: "karpathy", name: "k", repo: "multica-ai/andrej-karpathy-skills", install: { type: "instructions", path: "CLAUDE.md" } }];
  assert.equal(parseSkillArg("karpathy", reg).id, "karpathy");
  assert.equal(parseSkillArg("multica-ai/andrej-karpathy-skills", reg).id, "karpathy");
  assert.deepEqual(parseSkillArg("obra/superpowers@v7", reg), { id: "superpowers", name: "obra/superpowers", repo: "obra/superpowers", ref: "v7", install: { type: "auto" } });
  assert.deepEqual(parseSkillArg("cc-plugin-you-should-know@builtin", reg), {
    id: "you-should-know",
    name: "cc-plugin-you-should-know@builtin",
    repo: "builtin",
    install: { type: "builtin", plugin: "cc-plugin-you-should-know@builtin" },
  });
  const u = parseSkillArg("https://github.com/a/b/tree/main/skills/foo", reg);
  assert.deepEqual([u.repo, u.ref, u.id, u.install.path], ["a/b", "main", "foo", "skills/foo"]);
});

test("detects install type from files", () => {
  const mk = (files) => {
    const d = mkdtempSync(path.join(os.tmpdir(), "sa-"));
    for (const f of files) {
      mkdirSync(path.dirname(path.join(d, f)), { recursive: true });
      writeFileSync(path.join(d, f), "x");
    }
    return d;
  };
  assert.equal(detectInstall(mk([".claude-plugin/plugin.json", "CLAUDE.md"])).type, "plugin");
  assert.deepEqual(detectInstall(mk(["SKILL.md"])), { type: "skills-dir", path: "", single: true });
  assert.deepEqual(detectInstall(mk(["CLAUDE.md"])), { type: "instructions", path: "CLAUDE.md" });
  assert.deepEqual(detectInstall(mk(["skills/a/SKILL.md"])), { type: "skills-dir", path: "skills" });
  assert.throws(() => detectInstall(mk(["README.md"])));
});

test("splits agent args", async () => {
  const { splitArgs } = await import("../dist/util.js");
  assert.deepEqual(splitArgs(`--autocompact 100000 --append-system-prompt "be brief" -x 'a b'`), ["--autocompact", "100000", "--append-system-prompt", "be brief", "-x", "a b"]);
});

test("stats", () => {
  const [lo, hi] = wilson(5, 10);
  assert.ok(lo > 0.18 && lo < 0.25 && hi > 0.75 && hi < 0.82);
  const d = bootstrapDelta(new Map([["a", [1, 0]], ["b", [1, 0]], ["c", [1, 0]]]));
  assert.equal(d.delta, 1);
  assert.equal(d.lo, 1);
});
