import { test } from "node:test";
import assert from "node:assert/strict";
import { nextRun } from "../src/cron.js";

test("every 15 minutes", () => {
  assert.equal(nextRun("*/15 * * * *", new Date("2026-01-01T10:07:00Z")).toISOString(), "2026-01-01T10:15:00.000Z");
});
