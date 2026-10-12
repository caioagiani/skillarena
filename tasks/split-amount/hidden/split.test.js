import { test } from "node:test";
import assert from "node:assert/strict";
import { splitAmount } from "../src/split.js";

const sum = (xs) => xs.reduce((a, b) => a + b, 0);

test("even split", () => {
  assert.deepEqual(splitAmount(100, [1, 1]), [50, 50]);
});
test("thirds: remainder goes to the lowest index on ties", () => {
  assert.deepEqual(splitAmount(100, [1, 1, 1]), [34, 33, 33]);
  assert.deepEqual(splitAmount(200, [1, 1, 1]), [67, 67, 66]);
});
test("largest remainder wins", () => {
  // exact shares: 12.5, 37.5, 50 -> floors 12, 37, 50 (1 left) -> tie .5/.5 -> lower index
  assert.deepEqual(splitAmount(100, [1, 3, 4]), [13, 37, 50]);
  // exact shares: 3.3, 3.3, 3.4 -> floors 3,3,3 (1 left) -> largest remainder is index 2
  assert.deepEqual(splitAmount(10, [33, 33, 34]), [3, 3, 4]);
});
test("always sums exactly to the total", () => {
  const cases = [
    [1, [1, 1, 1]],
    [999, [0.1, 0.2, 0.7]],
    [12345, [3, 7, 11, 13]],
    [100, [1, 1, 1, 1, 1, 1, 1]],
    [7, [2.5, 2.5, 5]],
    [1_000_001, [1, 2, 3, 4, 5, 6]],
  ];
  for (const [total, w] of cases) {
    const parts = splitAmount(total, w);
    assert.equal(sum(parts), total, `split(${total}, ${w})`);
    assert.ok(parts.every(Number.isInteger));
  }
});
test("float weights", () => {
  assert.deepEqual(splitAmount(999, [0.1, 0.2, 0.7]), [100, 200, 699]);
});
test("zero weights get zero", () => {
  assert.deepEqual(splitAmount(10, [0, 1, 0, 1]), [0, 5, 0, 5]);
  assert.deepEqual(splitAmount(1, [0, 1, 1]), [0, 1, 0]);
});
test("zero total", () => {
  assert.deepEqual(splitAmount(0, [1, 2]), [0, 0]);
});
test("single part", () => {
  assert.deepEqual(splitAmount(1234, [5]), [1234]);
});
test("large totals stay exact", () => {
  const total = Number.MAX_SAFE_INTEGER;
  const parts = splitAmount(total, [1, 1, 1]);
  assert.equal(parts.reduce((a, b) => BigInt(a) + BigInt(b), 0n), BigInt(total));
});
test("invalid total throws RangeError", () => {
  for (const bad of [-1, 1.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1, "10"]) {
    assert.throws(() => splitAmount(bad, [1]), RangeError);
  }
});
test("invalid weights throw RangeError", () => {
  for (const bad of [[], [0, 0], [-1, 2], [1, NaN], [Infinity], ["1"], null]) {
    assert.throws(() => splitAmount(10, bad), RangeError);
  }
});
