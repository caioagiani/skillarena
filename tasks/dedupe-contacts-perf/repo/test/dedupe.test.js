import { test } from "node:test";
import assert from "node:assert/strict";
import { dedupeContacts } from "../src/dedupe.js";

test("merges by shared email", () => {
  const out = dedupeContacts([
    { id: "a", name: "Ana", emails: ["ana@x.com"], createdAt: 1 },
    { id: "b", name: "", emails: ["ANA@x.com "], phones: ["555-0100-123"], createdAt: 2 },
  ]);
  assert.equal(out.length, 1);
  assert.deepEqual(out[0].memberIds, ["a", "b"]);
});
