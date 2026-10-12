import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { dedupeContacts } from "../src/dedupe.js";
import { dedupeContacts as reference } from "./reference-dedupe.js";
import { generate } from "./gen.js";

const same = (input, label) => assert.deepEqual(dedupeContacts(structuredClone(input)), reference(structuredClone(input)), label);

test("hand-picked edge cases match the original", () => {
  same([], "empty");
  same([{ id: "x", createdAt: 1 }], "no emails, phones or name");
  same([
    { id: "a", name: "  ", emails: ["J.Doe+work@GoogleMail.com"], createdAt: 5 },
    { id: "b", name: " Jo ", emails: ["jdoe@gmail.com"], createdAt: 5 },
    { id: "c", name: "Z", phones: [15551234567], createdAt: 1 },
    { id: "d", phones: ["(555) 123-4567"], emails: ["jdoe@GMAIL.com"], createdAt: 9 },
  ], "gmail canonicalisation + phone link chain");
  same([
    { id: "c10", name: "", emails: ["+x@gmail.com", "...@gmail.com", "a@b.co"], createdAt: 2 },
    { id: "c9", name: "Nine", emails: ["A@B.CO"], createdAt: 2 },
    { id: "c1", name: "One", phones: ["123", 12], createdAt: 2 },
    { id: "c2", name: "Two", phones: ["123"], createdAt: 2 },
  ], "string id ordering, invalid emails and short phones never link");
  same([
    { id: "p", emails: ["a@x.io"], createdAt: 3 },
    { id: "q", emails: ["b@x.io"], phones: ["5550001111"], createdAt: 1 },
    { id: "r", emails: ["a@x.io", "b@x.io"], createdAt: 2 },
    { id: "s", phones: ["1-555-000-1111"], emails: ["c@x.io"], createdAt: 4 },
  ], "transitive merge through a bridge contact");
});

test("random datasets match the original exactly", () => {
  for (let seed = 1; seed <= 40; seed++) same(generate(150 + (seed % 5) * 30, seed), `seed ${seed}`);
});

test("dense duplicates match the original", () => {
  for (let seed = 100; seed < 110; seed++) same(generate(200, seed, { uniqueRatio: 0.15, timeBuckets: 3 }), `seed ${seed}`);
});

test("does not mutate its input", () => {
  const input = generate(300, 7);
  const before = structuredClone(input);
  dedupeContacts(input);
  assert.deepEqual(input, before);
});

test("100k contacts with a shared switchboard number in under 4s", () => {
  // Runs in a child process so a slow implementation fails fast instead of hanging the suite.
  const script = `
    import { dedupeContacts } from ${JSON.stringify(new URL("../src/dedupe.js", import.meta.url).href)};
    import { generate } from ${JSON.stringify(new URL("./gen.js", import.meta.url).href)};
    const input = generate(100_000, 2024, { switchboard: 0.05 });
    const t = process.hrtime.bigint();
    const out = dedupeContacts(input);
    const ms = Number(process.hrtime.bigint() - t) / 1e6;
    const members = out.reduce((n, g) => n + g.memberIds.length, 0);
    const biggest = Math.max(...out.map((g) => g.memberIds.length));
    console.log(JSON.stringify({ ms, members, biggest }));
  `;
  const r = spawnSync(process.execPath, ["--input-type=module", "-e", script], { encoding: "utf8", timeout: 10_000 });
  assert.ok(!r.error && r.status === 0, `did not finish within 10s (${r.error?.code ?? r.stderr.slice(-300)})`);
  const { ms, members, biggest } = JSON.parse(r.stdout.trim().split("\n").pop());
  assert.ok(ms < 4000, `took ${Math.round(ms)}ms`);
  assert.equal(members, 100_000, "every contact must appear exactly once");
  assert.ok(biggest > 4000, "switchboard contacts must be merged into one group");
});

test("100k: spot-check a sample of groups against the original", () => {
  // The original is too slow for 100k, so compare on a subset that shares no keys with the rest.
  const input = generate(100_000, 77).slice(0, 400);
  same(input, "first 400 of a large dataset");
});
