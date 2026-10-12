import { test } from "node:test";
import assert from "node:assert/strict";
import { paginate } from "../src/paginate.js";

const ten = Array.from({ length: 10 }, (_, i) => i + 1);

test("first page", () => {
  assert.deepEqual(paginate(ten, 1, 3), { items: [1, 2, 3], page: 1, totalPages: 4, hasNext: true, hasPrev: false });
});
test("middle page does not repeat items", () => {
  assert.deepEqual(paginate(ten, 2, 3).items, [4, 5, 6]);
  assert.deepEqual(paginate(ten, 3, 3).items, [7, 8, 9]);
});
test("last partial page is reachable", () => {
  assert.deepEqual(paginate(ten, 4, 3), { items: [10], page: 4, totalPages: 4, hasNext: false, hasPrev: true });
});
test("exact multiple", () => {
  const r = paginate([1, 2, 3, 4], 2, 2);
  assert.deepEqual(r, { items: [3, 4], page: 2, totalPages: 2, hasNext: false, hasPrev: true });
});
test("page past the end is empty, not an error", () => {
  const r = paginate(ten, 9, 3);
  assert.deepEqual(r.items, []);
  assert.equal(r.hasNext, false);
  assert.equal(r.totalPages, 4);
});
test("empty input", () => {
  assert.deepEqual(paginate([], 1, 5), { items: [], page: 1, totalPages: 0, hasNext: false, hasPrev: false });
});
test("invalid page throws RangeError", () => {
  assert.throws(() => paginate(ten, 0, 3), RangeError);
  assert.throws(() => paginate(ten, -1, 3), RangeError);
  assert.throws(() => paginate(ten, 1.5, 3), RangeError);
});
test("invalid perPage throws RangeError", () => {
  assert.throws(() => paginate(ten, 1, 0), RangeError);
  assert.throws(() => paginate(ten, 1, 2.5), RangeError);
});
test("does not mutate input", () => {
  const input = [1, 2, 3];
  paginate(input, 1, 2);
  assert.deepEqual(input, [1, 2, 3]);
});
