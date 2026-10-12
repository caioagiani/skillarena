import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { nextRun } from "../src/cron.js";

// Expected values were cross-checked against the croner library (UTC, Vixie day matching).
test("basics", () => {
  const cases = [
    ["*/15 * * * *", "2026-01-01T10:07:00Z", "2026-01-01T10:15:00.000Z"],
    ["*/15 * * * *", "2026-01-01T10:15:00Z", "2026-01-01T10:30:00.000Z"],
    ["* * * * *", "2026-01-01T10:07:30Z", "2026-01-01T10:08:00.000Z"],
    ["0 * * * *", "2026-01-01T10:00:00Z", "2026-01-01T11:00:00.000Z"],
    ["30 9 * * *", "2026-01-01T09:30:00Z", "2026-01-02T09:30:00.000Z"],
    ["30 9 * * *", "2026-01-01T09:29:59.999Z", "2026-01-01T09:30:00.000Z"],
    ["0 0 1 1 *", "2026-06-15T12:00:00Z", "2027-01-01T00:00:00.000Z"],
    ["59 23 31 12 *", "2026-12-31T23:58:00Z", "2026-12-31T23:59:00.000Z"],
  ];
  for (const [expr, from, expected] of cases) {
    assert.equal(nextRun(expr, new Date(from)).toISOString(), expected, `nextRun(${JSON.stringify(expr)}, ${from})`);
  }
});

test("lists, ranges and steps", () => {
  const cases = [
    ["0 9-17 * * *", "2026-03-10T17:30:00Z", "2026-03-11T09:00:00.000Z"],
    ["0,30 * * * *", "2026-03-10T10:31:00Z", "2026-03-10T11:00:00.000Z"],
    ["10-20/5 * * * *", "2026-03-10T10:16:00Z", "2026-03-10T10:20:00.000Z"],
    ["5/20 * * * *", "2026-03-10T10:46:00Z", "2026-03-10T11:05:00.000Z"],
    ["0 */6 * * *", "2026-03-10T19:00:00Z", "2026-03-11T00:00:00.000Z"],
    ["0 1-23/2 * * *", "2026-03-10T02:00:00Z", "2026-03-10T03:00:00.000Z"],
    ["1,2,5-7,40-45/2 * * * *", "2026-03-10T10:08:00Z", "2026-03-10T10:40:00.000Z"],
    ["0 0 */10 * *", "2026-03-22T00:00:00Z", "2026-03-31T00:00:00.000Z"],
  ];
  for (const [expr, from, expected] of cases) {
    assert.equal(nextRun(expr, new Date(from)).toISOString(), expected, `nextRun(${JSON.stringify(expr)}, ${from})`);
  }
});

test("names", () => {
  const cases = [
    ["0 9 * * MON-FRI", "2026-10-09T10:00:00Z", "2026-10-12T09:00:00.000Z"],
    ["0 9 * * mon-fri", "2026-10-10T10:00:00Z", "2026-10-12T09:00:00.000Z"],
    ["0 0 1 JAN,JUL *", "2026-02-01T00:00:00Z", "2026-07-01T00:00:00.000Z"],
    ["0 0 * * SUN", "2026-10-12T00:00:00Z", "2026-10-18T00:00:00.000Z"],
    ["0 12 * Feb-Apr Sat", "2026-05-01T00:00:00Z", "2027-02-06T12:00:00.000Z"],
  ];
  for (const [expr, from, expected] of cases) {
    assert.equal(nextRun(expr, new Date(from)).toISOString(), expected, `nextRun(${JSON.stringify(expr)}, ${from})`);
  }
});

test("sunday is 0 and 7", () => {
  const cases = [
    ["0 0 * * 7", "2026-10-12T00:00:00Z", "2026-10-18T00:00:00.000Z"],
    ["0 0 * * 0", "2026-10-12T00:00:00Z", "2026-10-18T00:00:00.000Z"],
    ["0 0 * * 5-7", "2026-10-12T00:00:00Z", "2026-10-16T00:00:00.000Z"],
  ];
  for (const [expr, from, expected] of cases) {
    assert.equal(nextRun(expr, new Date(from)).toISOString(), expected, `nextRun(${JSON.stringify(expr)}, ${from})`);
  }
});

test("day of month OR day of week", () => {
  const cases = [
    ["0 0 13 * 5", "2026-10-12T00:00:00Z", "2026-10-13T00:00:00.000Z"],
    ["0 0 1 * MON", "2026-10-20T00:00:00Z", "2026-10-26T00:00:00.000Z"],
    ["0 0 15 * *", "2026-10-16T00:00:00Z", "2026-11-15T00:00:00.000Z"],
    ["0 0 * * 1", "2026-10-13T00:00:00Z", "2026-10-19T00:00:00.000Z"],
    ["0 0 */2 * 1", "2026-10-12T00:00:00Z", "2026-10-13T00:00:00.000Z"],
    ["0 0 1-7 * */3", "2026-10-08T00:00:00Z", "2026-10-10T00:00:00.000Z"],
  ];
  for (const [expr, from, expected] of cases) {
    assert.equal(nextRun(expr, new Date(from)).toISOString(), expected, `nextRun(${JSON.stringify(expr)}, ${from})`);
  }
});

test("month lengths and leap years", () => {
  const cases = [
    ["0 0 31 * *", "2026-04-01T00:00:00Z", "2026-05-31T00:00:00.000Z"],
    ["0 0 29 2 *", "2026-01-01T00:00:00Z", "2028-02-29T00:00:00.000Z"],
    ["0 0 30 * *", "2026-01-31T00:00:00Z", "2026-03-30T00:00:00.000Z"],
    ["0 0 31 * *", "2026-02-01T00:00:00Z", "2026-03-31T00:00:00.000Z"],
    ["0 12 29 2 1", "2027-01-01T00:00:00Z", "2027-02-01T12:00:00.000Z"],
  ];
  for (const [expr, from, expected] of cases) {
    assert.equal(nextRun(expr, new Date(from)).toISOString(), expected, `nextRun(${JSON.stringify(expr)}, ${from})`);
  }
});

test("rollover", () => {
  const cases = [
    ["0 0 * * *", "2026-12-31T23:59:00Z", "2027-01-01T00:00:00.000Z"],
    ["* * * * *", "2026-12-31T23:59:00Z", "2027-01-01T00:00:00.000Z"],
    ["0 0 1 * *", "2026-01-31T12:00:00Z", "2026-02-01T00:00:00.000Z"],
  ];
  for (const [expr, from, expected] of cases) {
    assert.equal(nextRun(expr, new Date(from)).toISOString(), expected, `nextRun(${JSON.stringify(expr)}, ${from})`);
  }
});

test("macros", () => {
  const cases = [
    ["@yearly", "2026-03-01T00:00:00Z", "2027-01-01T00:00:00.000Z"],
    ["@annually", "2026-03-01T00:00:00Z", "2027-01-01T00:00:00.000Z"],
    ["@monthly", "2026-03-01T00:00:00Z", "2026-04-01T00:00:00.000Z"],
    ["@weekly", "2026-10-12T00:00:00Z", "2026-10-18T00:00:00.000Z"],
    ["@daily", "2026-10-12T00:00:00Z", "2026-10-13T00:00:00.000Z"],
    ["@midnight", "2026-10-12T05:00:00Z", "2026-10-13T00:00:00.000Z"],
    ["@hourly", "2026-10-12T05:00:00Z", "2026-10-12T06:00:00.000Z"],
  ];
  for (const [expr, from, expected] of cases) {
    assert.equal(nextRun(expr, new Date(from)).toISOString(), expected, `nextRun(${JSON.stringify(expr)}, ${from})`);
  }
});

test("whitespace", () => {
  const cases = [
    ["  0   9\t* *  1-5 ", "2026-10-09T10:00:00Z", "2026-10-12T09:00:00.000Z"],
  ];
  for (const [expr, from, expected] of cases) {
    assert.equal(nextRun(expr, new Date(from)).toISOString(), expected, `nextRun(${JSON.stringify(expr)}, ${from})`);
  }
});

test("result has no seconds and does not mutate from", () => {
  const from = new Date("2026-01-01T10:07:42.123Z");
  const r = nextRun("* * * * *", from);
  assert.equal(r.toISOString(), "2026-01-01T10:08:00.000Z");
  assert.equal(from.toISOString(), "2026-01-01T10:07:42.123Z");
  assert.ok(r instanceof Date);
});

test("malformed expressions throw SyntaxError", () => {
  const bad = [
    "", "* * * *", "* * * * * *", "60 * * * *", "* 24 * * *", "* * 0 * *", "* * 32 * *", "* * * 0 *", "* * * 13 *",
    "* * * * 8", "5-1 * * * *", "*/0 * * * *", "1,,2 * * * *", "1, * * * *", "* * * FOO *", "* * * * FUNDAY",
    "a * * * *", "1.5 * * * *", "-1 * * * *", "@sometimes", "@daily 5", "*/ * * * *", "1-2-3 * * * *",
  ];
  for (const expr of bad) assert.throws(() => nextRun(expr, new Date("2026-01-01T00:00:00Z")), SyntaxError, `expected SyntaxError for ${JSON.stringify(expr)}`);
});

test("impossible schedules throw RangeError", () => {
  assert.throws(() => nextRun("0 0 30 2 *", new Date("2026-01-01T00:00:00Z")), RangeError);
  assert.throws(() => nextRun("0 0 31 4,6,9,11 *", new Date("2026-01-01T00:00:00Z")), RangeError);
});

test("feb 30 with a weekday runs on that weekday in february (OR rule)", () => {
  assert.equal(nextRun("0 0 30 2 MON", new Date("2026-10-12T00:00:00Z")).toISOString(), "2027-02-01T00:00:00.000Z");
});

test("invalid from throws TypeError", () => {
  assert.throws(() => nextRun("* * * * *", "2026-01-01"), TypeError);
  assert.throws(() => nextRun("* * * * *", new Date("nope")), TypeError);
});

test("fast enough for sparse schedules", () => {
  const t = Date.now();
  assert.equal(nextRun("0 0 29 2 *", new Date("2026-03-01T00:00:00Z")).toISOString(), "2028-02-29T00:00:00.000Z");
  assert.ok(Date.now() - t < 2000, "took more than 2s");
});

test("no dependencies", () => {
  const src = readFileSync(new URL("../src/cron.js", import.meta.url), "utf8");
  const imports = [
    ...src.matchAll(/^\s*import\s+(?:[\s\S]*?\s+from\s+)?["']([^"']+)["']/gm),
    ...src.matchAll(/\bimport\s*\(\s*["']([^"']+)["']\s*\)/g),
    ...src.matchAll(/\brequire\s*\(\s*["']([^"']+)["']\s*\)/g),
  ].map((m) => m[1]);
  assert.deepEqual(imports.filter((s) => !s.startsWith(".") && !s.startsWith("node:")), []);
});
