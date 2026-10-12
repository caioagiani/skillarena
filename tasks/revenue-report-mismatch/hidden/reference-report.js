// Independent reference used by the property tests.
import { invoiceTotalUsdCents } from "../src/invoices.js";

const fmt = (c) => `${c < 0 ? "-" : ""}${Math.floor(Math.abs(c) / 100)}.${String(Math.abs(c) % 100).padStart(2, "0")}`;

export function referenceReport(documents, month) {
  const docs = documents.filter((d) => d.status !== "void" && new Date(d.issuedAt).toISOString().slice(0, 7) === month);
  const per = new Map();
  let total = 0;
  for (const d of docs) {
    const c = invoiceTotalUsdCents(d) * (d.type === "credit" ? -1 : 1);
    total += c;
    per.set(d.customer, (per.get(d.customer) ?? 0) + c);
  }
  const byCustomer = [...per]
    .sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1))
    .map(([customer, c]) => ({ customer, totalUsd: fmt(c) }));
  return { month, documentCount: docs.length, totalUsd: fmt(total), byCustomer };
}

function rng(seed) {
  let s = seed >>> 0;
  return () => ((s = (Math.imul(s ^ (s >>> 15), 2246822507) + 0x9e3779b9) >>> 0) / 2 ** 32);
}

export function generate(n, seed) {
  const r = rng(seed);
  const pick = (xs) => xs[Math.floor(r() * xs.length)];
  const customers = ["acme", "globex", "initech", "umbrella", "hooli", "stark"];
  const offsets = ["Z", "Z", "+02:00", "-05:00", "+13:00", "-11:00"];
  const docs = [];
  for (let i = 0; i < n; i++) {
    const t = Date.UTC(2026, 0, 2) + Math.floor(r() * 170 * 86_400_000);
    // shift some documents right next to a month boundary
    const at = r() < 0.25 ? Date.UTC(2026, 1 + Math.floor(r() * 4), 1) + Math.floor((r() - 0.5) * 30) * 3_600_000 : t;
    const off = pick(offsets);
    const sign = off[0] === "-" ? -1 : 1;
    const offMin = off === "Z" ? 0 : sign * (Number(off.slice(1, 3)) * 60 + Number(off.slice(4)));
    const local = new Date(at + offMin * 60_000).toISOString().slice(0, 19);
    const lines = Array.from({ length: 1 + Math.floor(r() * 4) }, () => ({
      quantity: 1 + Math.floor(r() * 7),
      unitPrice: Math.round(r() * 30000) / 100 + pick([0, 0.005, 0.015]),
      taxRate: pick([0, 0.05, 0.075, 0.2, 0.21]),
    }));
    docs.push({
      id: `D${i}`,
      customer: pick(customers),
      type: r() < 0.15 ? "credit" : "invoice",
      status: r() < 0.1 ? "void" : pick(["open", "paid"]),
      currency: pick(["USD", "USD", "EUR", "GBP", "BRL"]),
      issuedAt: local + off,
      lines,
    });
  }
  return docs;
}
