import { test } from "node:test";
import assert from "node:assert/strict";
import { satisfies } from "../src/semver.js";

test("caret", () => {
  assert.equal(satisfies("1.4.0", "^1.2.3"), true);
  assert.equal(satisfies("2.0.0", "^1.2.3"), false);
});
