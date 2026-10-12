import { test } from "node:test";
import assert from "node:assert/strict";
import { parseCSV } from "../src/csv.js";

test("simple rows", () => {
  assert.deepEqual(parseCSV("a,b\n1,2\n"), [["a", "b"], ["1", "2"]]);
});
