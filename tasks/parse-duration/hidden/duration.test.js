import { test } from "node:test";
import assert from "node:assert/strict";
import { parseDuration } from "../src/duration.js";

test("single units", () => {
  assert.equal(parseDuration("2d"), 172_800_000);
  assert.equal(parseDuration("3h"), 10_800_000);
  assert.equal(parseDuration("4m"), 240_000);
  assert.equal(parseDuration("5s"), 5_000);
  assert.equal(parseDuration("250ms"), 250);
});
test("combined segments", () => {
  assert.equal(parseDuration("1h30m"), 5_400_000);
  assert.equal(parseDuration("1d2h3m4s5ms"), 93_784_005);
});
test("ms is not confused with m + s", () => {
  assert.equal(parseDuration("1m500ms"), 60_500);
  assert.equal(parseDuration("10ms"), 10);
});
test("whitespace", () => {
  assert.equal(parseDuration("1h 30m"), 5_400_000);
  assert.equal(parseDuration("  2d  "), 172_800_000);
  assert.equal(parseDuration("1m\t1s"), 61_000);
});
test("decimals and rounding", () => {
  assert.equal(parseDuration("1.5h"), 5_400_000);
  assert.equal(parseDuration("0.5s"), 500);
  assert.equal(parseDuration("1.0006s"), 1001);
  assert.equal(parseDuration("0.4ms"), 0);
});
test("case-insensitive units", () => {
  assert.equal(parseDuration("1H30M"), 5_400_000);
  assert.equal(parseDuration("5MS"), 5);
});
test("any order", () => {
  assert.equal(parseDuration("30m1h"), 5_400_000);
});
test("zero is fine", () => {
  assert.equal(parseDuration("0s"), 0);
});
test("invalid inputs throw TypeError", () => {
  for (const bad of ["", "   ", "10", "1x", "h", "1h30", "-1h", ".5s", "1e3s", "1h1h", "1m 2M", "1 h", "1h,30m", "abc", "1.h", "1..5h"]) {
    assert.throws(() => parseDuration(bad), TypeError, `expected TypeError for ${JSON.stringify(bad)}`);
  }
});
test("non-strings throw TypeError", () => {
  for (const bad of [null, undefined, 10, {}, ["1h"]]) assert.throws(() => parseDuration(bad), TypeError);
});
