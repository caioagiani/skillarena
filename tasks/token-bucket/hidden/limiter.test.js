import { test } from "node:test";
import assert from "node:assert/strict";
import { createLimiter } from "../src/limiter.js";

function clock(start = 10_000) {
  let t = start;
  const now = () => t;
  now.set = (v) => (t = v);
  now.advance = (ms) => (t += ms);
  return now;
}

test("validates options", () => {
  for (const bad of [0, -1, NaN, Infinity, "3", undefined]) {
    assert.throws(() => createLimiter({ capacity: bad, refillPerSec: 1 }), RangeError);
    assert.throws(() => createLimiter({ capacity: 1, refillPerSec: bad }), RangeError);
  }
});
test("starts full and drains", () => {
  const now = clock();
  const l = createLimiter({ capacity: 3, refillPerSec: 1, now });
  assert.equal(l.available(), 3);
  assert.equal(l.tryRemove(), true);
  assert.equal(l.tryRemove(2), true);
  assert.equal(l.tryRemove(), false);
  assert.equal(l.available(), 0);
});
test("failed removal consumes nothing", () => {
  const now = clock();
  const l = createLimiter({ capacity: 5, refillPerSec: 1, now });
  l.tryRemove(4);
  assert.equal(l.tryRemove(2), false);
  assert.equal(l.available(), 1);
  assert.equal(l.tryRemove(1), true);
});
test("continuous fractional refill", () => {
  const now = clock();
  const l = createLimiter({ capacity: 10, refillPerSec: 2, now });
  l.tryRemove(10);
  now.advance(250);
  assert.equal(l.available(), 0.5);
  assert.equal(l.tryRemove(1), false);
  now.advance(250);
  assert.equal(l.available(), 1);
  assert.equal(l.tryRemove(1), true);
});
test("refill is capped at capacity", () => {
  const now = clock();
  const l = createLimiter({ capacity: 3, refillPerSec: 100, now });
  l.tryRemove(1);
  now.advance(60_000);
  assert.equal(l.available(), 3);
});
test("asking for more than capacity is always false", () => {
  const now = clock();
  const l = createLimiter({ capacity: 3, refillPerSec: 1, now });
  assert.equal(l.tryRemove(4), false);
  assert.equal(l.available(), 3);
});
test("fractional requests", () => {
  const now = clock();
  const l = createLimiter({ capacity: 1, refillPerSec: 1, now });
  assert.equal(l.tryRemove(0.25), true);
  assert.equal(l.available(), 0.75);
});
test("invalid n throws RangeError", () => {
  const l = createLimiter({ capacity: 3, refillPerSec: 1, now: clock() });
  for (const bad of [0, -1, NaN, Infinity, "1"]) assert.throws(() => l.tryRemove(bad), RangeError);
});
test("clock going backwards adds no tokens", () => {
  const now = clock(10_000);
  const l = createLimiter({ capacity: 4, refillPerSec: 1, now });
  l.tryRemove(4);
  now.set(5_000);
  assert.equal(l.available(), 0);
  assert.equal(l.tryRemove(1), false);
});
test("defaults to Date.now", () => {
  const l = createLimiter({ capacity: 2, refillPerSec: 1 });
  assert.equal(l.tryRemove(2), true);
  assert.equal(l.tryRemove(1), false);
});
