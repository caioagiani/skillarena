import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const run = ".skillarena-run";
const db = JSON.parse(readFileSync(`${run}/db.json`, "utf8"));
const initial = JSON.parse(readFileSync(new URL("./initial-db.json", import.meta.url), "utf8"));
const reply = readFileSync(`${run}/reply.md`, "utf8");
const inv = (id) => db.invoices.find((i) => i.id === id);
const before = (id) => initial.invoices.find((i) => i.id === id);

test("November invoice moved to the 20th", () => {
  assert.equal(inv("i11").due_date, "2026-11-20");
});

test("December invoice untouched (already changed once)", () => {
  assert.deepEqual(inv("i12"), before("i12"));
});

test("no other invoice changed", () => {
  for (const id of ["i10", "i21"]) assert.deepEqual(inv(id), before(id));
});

test("reply gives the new November date as DD/MM/YYYY", () => {
  assert.match(reply, /20\/11\/2026/);
});

test("reply addresses December", () => {
  assert.match(reply, /december|dezembro|12\/2026/i);
});
