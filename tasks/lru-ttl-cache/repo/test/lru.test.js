import { test } from "node:test";
import assert from "node:assert/strict";
import { LRUCache } from "../src/lru.js";

test("evicts the oldest entry", () => {
  const c = new LRUCache({ max: 2 });
  c.set("a", 1).set("b", 2).set("c", 3);
  assert.equal(c.has("a"), false);
  assert.deepEqual(c.keys(), ["b", "c"]);
});
