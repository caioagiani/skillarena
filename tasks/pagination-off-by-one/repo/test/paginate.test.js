import { test } from "node:test";
import assert from "node:assert/strict";
import { paginate } from "../src/paginate.js";

test("first page", () => {
  const r = paginate([1, 2, 3, 4], 1, 2);
  assert.deepEqual(r.items, [1, 2]);
});
