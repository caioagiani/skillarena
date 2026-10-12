import { test } from "node:test";
import assert from "node:assert/strict";
import { createLimiter } from "../src/limiter.js";

test("starts full", () => {
  const l = createLimiter({ capacity: 3, refillPerSec: 1 });
  assert.equal(l.tryRemove(), true);
});
