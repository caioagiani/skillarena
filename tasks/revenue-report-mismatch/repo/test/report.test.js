import { test } from "node:test";
import assert from "node:assert/strict";
import { monthlyReport } from "../src/report.js";

test("single USD invoice", () => {
  const docs = [{ id: "1", customer: "acme", type: "invoice", status: "paid", currency: "USD",
    issuedAt: "2026-03-10T12:00:00Z", lines: [{ quantity: 2, unitPrice: 50, taxRate: 0 }] }];
  assert.deepEqual(monthlyReport(docs, "2026-03"), {
    month: "2026-03", documentCount: 1, totalUsd: "100.00", byCustomer: [{ customer: "acme", totalUsd: "100.00" }],
  });
});
