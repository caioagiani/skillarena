import { test } from "node:test";
import assert from "node:assert/strict";
import { invoiceTotalCents, invoiceTotalUsdCents } from "../src/invoices.js";

test("tax is rounded per line", () => {
  const doc = { currency: "USD", issuedAt: "2026-02-10T12:00:00Z", lines: [
    { quantity: 1, unitPrice: 0.05, taxRate: 0.1 },
    { quantity: 1, unitPrice: 0.05, taxRate: 0.1 },
  ] };
  assert.equal(invoiceTotalCents(doc), 12);
});

test("converted at the issue-day rate", () => {
  const doc = { currency: "EUR", issuedAt: "2026-01-01T00:00:00Z", lines: [{ quantity: 1, unitPrice: 100, taxRate: 0 }] };
  assert.equal(invoiceTotalUsdCents(doc), 10850);
});
