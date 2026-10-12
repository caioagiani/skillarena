import { test } from "node:test";
import assert from "node:assert/strict";
import { monthlyReport } from "../src/report.js";
import { invoiceTotalUsdCents } from "../src/invoices.js";
import { referenceReport, generate } from "./reference-report.js";

let n = 0;
const doc = (o) => ({ id: `T${n++}`, customer: "acme", type: "invoice", status: "paid", currency: "USD",
  issuedAt: "2026-03-10T12:00:00Z", lines: [{ quantity: 1, unitPrice: 100, taxRate: 0 }], ...o });

test("single USD invoice", () => {
  assert.deepEqual(monthlyReport([doc({})], "2026-03"), {
    month: "2026-03", documentCount: 1, totalUsd: "100.00", byCustomer: [{ customer: "acme", totalUsd: "100.00" }],
  });
});

test("tax is rounded per line, like the invoice", () => {
  const d = doc({ lines: [
    { quantity: 1, unitPrice: 0.05, taxRate: 0.1 },
    { quantity: 1, unitPrice: 0.05, taxRate: 0.1 },
    { quantity: 3, unitPrice: 0.15, taxRate: 0.075 },
  ] });
  const r = monthlyReport([d], "2026-03");
  assert.equal(r.totalUsd, "0.60");
  assert.equal(invoiceTotalUsdCents(d), 60);
});

test("no float drift over many small documents", () => {
  const docs = Array.from({ length: 1000 }, () => doc({ lines: [{ quantity: 1, unitPrice: 0.1, taxRate: 0 }] }));
  assert.equal(monthlyReport(docs, "2026-03").totalUsd, "100.00");
});

test("foreign currency uses the rate of the issue day, not the latest rate", () => {
  const d = doc({ currency: "EUR", issuedAt: "2026-01-01T09:00:00Z" });
  assert.equal(monthlyReport([d], "2026-01").totalUsd, "108.50");
});

test("void documents don't count anywhere", () => {
  const r = monthlyReport([doc({}), doc({ status: "void", customer: "globex", lines: [{ quantity: 1, unitPrice: 999, taxRate: 0 }] })], "2026-03");
  assert.equal(r.totalUsd, "100.00");
  assert.equal(r.documentCount, 1);
  assert.deepEqual(r.byCustomer, [{ customer: "acme", totalUsd: "100.00" }]);
});

test("credit notes reduce revenue and can make a customer negative", () => {
  const r = monthlyReport([
    doc({}),
    doc({ type: "credit", customer: "globex", lines: [{ quantity: 1, unitPrice: 12.5, taxRate: 0 }] }),
  ], "2026-03");
  assert.equal(r.totalUsd, "87.50");
  assert.equal(r.documentCount, 2);
  assert.deepEqual(r.byCustomer, [{ customer: "acme", totalUsd: "100.00" }, { customer: "globex", totalUsd: "-12.50" }]);
});

test("negative amounts below one dollar keep their sign", () => {
  const r = monthlyReport([doc({ type: "credit", lines: [{ quantity: 1, unitPrice: 0.05, taxRate: 0 }] })], "2026-03");
  assert.equal(r.totalUsd, "-0.05");
});

test("months are UTC months, whatever the offset or the server timezone", () => {
  const docs = [
    doc({ customer: "feb", issuedAt: "2026-02-28T23:30:00Z" }),
    doc({ customer: "mar", issuedAt: "2026-03-01T00:15:00Z" }),
    doc({ customer: "feb2", issuedAt: "2026-03-01T01:30:00+02:00" }), // 2026-02-28T23:30Z
    doc({ customer: "mar2", issuedAt: "2026-02-28T20:00:00-05:00" }), // 2026-03-01T01:00Z
  ];
  assert.deepEqual(monthlyReport(docs, "2026-02").byCustomer.map((c) => c.customer).sort(), ["feb", "feb2"]);
  assert.deepEqual(monthlyReport(docs, "2026-03").byCustomer.map((c) => c.customer).sort(), ["mar", "mar2"]);
});

test("conversion uses the UTC issue day", () => {
  // 2026-01-02T01:00+13:00 is 2026-01-01 in UTC
  const d = doc({ currency: "EUR", issuedAt: "2026-01-02T01:00:00+13:00" });
  assert.equal(monthlyReport([d], "2026-01").totalUsd, "108.50");
});

test("byCustomer: largest first, ties by name", () => {
  const r = monthlyReport([
    doc({ customer: "zeta" }), doc({ customer: "alpha" }),
    doc({ customer: "mid", lines: [{ quantity: 1, unitPrice: 150, taxRate: 0 }] }),
    doc({ customer: "beta", lines: [{ quantity: 1, unitPrice: 0.1, taxRate: 0 }] }),
    doc({ customer: "beta", lines: [{ quantity: 1, unitPrice: 0.2, taxRate: 0 }] }),
    doc({ customer: "gamma", lines: [{ quantity: 1, unitPrice: 0.3, taxRate: 0 }] }),
  ], "2026-03");
  assert.deepEqual(r.byCustomer.map((c) => c.customer), ["mid", "alpha", "zeta", "beta", "gamma"]);
});

test("rejects malformed months", () => {
  for (const m of ["2026-3", "2026-13", "2026-00", "03-2026", "", "2026-03-01", undefined, 202603]) {
    assert.throws(() => monthlyReport([], m), TypeError, String(m));
  }
});

test("empty month", () => {
  assert.deepEqual(monthlyReport([doc({})], "2026-04"), { month: "2026-04", documentCount: 0, totalUsd: "0.00", byCustomer: [] });
});

test("does not modify its input", () => {
  const docs = generate(50, 7);
  const before = JSON.stringify(docs);
  monthlyReport(docs, "2026-03");
  assert.equal(JSON.stringify(docs), before);
});

test("agrees with the invoices on random data", () => {
  for (let seed = 1; seed <= 25; seed++) {
    const docs = generate(300, seed);
    for (const month of ["2026-01", "2026-02", "2026-03", "2026-04", "2026-05", "2026-06"]) {
      assert.deepEqual(monthlyReport(docs, month), referenceReport(docs, month), `seed ${seed} ${month}`);
    }
  }
});
