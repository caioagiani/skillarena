import { test } from "node:test";
import assert from "node:assert/strict";
import { applyPatch } from "../src/patch.js";

test("add a member", () => {
  assert.deepEqual(applyPatch({ foo: "bar" }, [{ op: "add", path: "/baz", value: "qux" }]), { foo: "bar", baz: "qux" });
});
