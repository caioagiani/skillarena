import { test } from "node:test";
import assert from "node:assert/strict";
import { LRUCache } from "../src/lru.js";

function clock(start = 1_000) {
  let t = start;
  const now = () => t;
  now.advance = (ms) => (t += ms);
  return now;
}

test("validates options", () => {
  assert.throws(() => new LRUCache({}), RangeError);
  assert.throws(() => new LRUCache({ max: 0 }), RangeError);
  assert.throws(() => new LRUCache({ max: 1.5 }), RangeError);
  assert.throws(() => new LRUCache({ max: 2, ttlMs: 0 }), RangeError);
  assert.throws(() => new LRUCache({ max: 2, ttlMs: -5 }), RangeError);
  assert.doesNotThrow(() => new LRUCache({ max: 2 }));
});
test("evicts least recently used", () => {
  const c = new LRUCache({ max: 2 });
  c.set("a", 1).set("b", 2).set("c", 3);
  assert.deepEqual(c.keys(), ["b", "c"]);
});
test("get refreshes recency", () => {
  const c = new LRUCache({ max: 2 });
  c.set("a", 1).set("b", 2);
  assert.equal(c.get("a"), 1);
  c.set("c", 3);
  assert.equal(c.has("a"), true);
  assert.equal(c.has("b"), false);
  assert.deepEqual(c.keys(), ["a", "c"]);
});
test("has does not refresh recency", () => {
  const c = new LRUCache({ max: 2 });
  c.set("a", 1).set("b", 2);
  c.has("a");
  c.set("c", 3);
  assert.equal(c.has("a"), false);
});
test("set on existing key updates value and recency", () => {
  const c = new LRUCache({ max: 2 });
  c.set("a", 1).set("b", 2).set("a", 10).set("c", 3);
  assert.equal(c.get("a"), 10);
  assert.equal(c.has("b"), false);
});
test("entries expire after ttl", () => {
  const now = clock();
  const c = new LRUCache({ max: 5, ttlMs: 100, now });
  c.set("a", 1);
  now.advance(99);
  assert.equal(c.get("a"), 1);
  now.advance(1);
  assert.equal(c.get("a"), undefined);
  assert.equal(c.has("a"), false);
  assert.equal(c.size, 0);
});
test("get does not extend ttl, set does", () => {
  const now = clock();
  const c = new LRUCache({ max: 5, ttlMs: 100, now });
  c.set("a", 1).set("b", 2);
  now.advance(60);
  c.get("a");
  c.set("b", 3);
  now.advance(60);
  assert.equal(c.get("a"), undefined);
  assert.equal(c.get("b"), 3);
});
test("size and keys ignore expired entries", () => {
  const now = clock();
  const c = new LRUCache({ max: 5, ttlMs: 100, now });
  c.set("a", 1);
  now.advance(50);
  c.set("b", 2);
  now.advance(60);
  assert.equal(c.size, 1);
  assert.deepEqual(c.keys(), ["b"]);
});
test("expired entries are dropped before evicting live ones", () => {
  const now = clock();
  const c = new LRUCache({ max: 2, ttlMs: 100, now });
  c.set("old", 1); // expires at +100
  now.advance(50);
  c.set("live", 2); // expires at +150
  now.advance(10);
  c.get("old"); // recency is now: live, old
  now.advance(50); // "old" expired, "live" still valid
  c.set("new", 3); // plain LRU would evict "live"

  assert.deepEqual(c.keys(), ["live", "new"]);
});
test("delete reports whether a live entry was removed", () => {
  const now = clock();
  const c = new LRUCache({ max: 5, ttlMs: 100, now });
  c.set("a", 1).set("b", 2);
  assert.equal(c.delete("a"), true);
  assert.equal(c.delete("a"), false);
  now.advance(200);
  assert.equal(c.delete("b"), false);
});
test("no ttl means no expiry", () => {
  const now = clock();
  const c = new LRUCache({ max: 2, now });
  c.set("a", 1);
  now.advance(10 ** 12);
  assert.equal(c.get("a"), 1);
});
test("defaults to Date.now", () => {
  const c = new LRUCache({ max: 2, ttlMs: 60_000 });
  c.set("a", 1);
  assert.equal(c.get("a"), 1);
});
test("stores falsy values", () => {
  const c = new LRUCache({ max: 3 });
  c.set("zero", 0).set("empty", "").set("undef", undefined);
  assert.equal(c.get("zero"), 0);
  assert.equal(c.has("undef"), true);
  assert.equal(c.size, 3);
});
