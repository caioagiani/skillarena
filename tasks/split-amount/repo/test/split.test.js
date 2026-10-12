import { test } from "node:test";
import assert from "node:assert/strict";
import { splitAmount } from "../src/split.js";

test("even split", () => {
  assert.deepEqual(splitAmount(100, [1, 1]), [50, 50]);
});
