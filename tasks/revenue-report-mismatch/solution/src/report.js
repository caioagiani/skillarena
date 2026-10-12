import { invoiceTotalUsdCents } from "./invoices.js";
import { formatUsd } from "./money.js";

/** Monthly revenue report. See "Monthly revenue report" in README.md. */
export function monthlyReport(documents, month) {
  if (typeof month !== "string" || !/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) {
    throw new TypeError(`invalid month: ${month}`);
  }
  const docs = documents.filter(
    (doc) => doc.status !== "void" && new Date(doc.issuedAt).toISOString().slice(0, 7) === month,
  );

  let total = 0;
  const perCustomer = new Map();
  for (const doc of docs) {
    const cents = invoiceTotalUsdCents(doc) * (doc.type === "credit" ? -1 : 1);
    total += cents;
    perCustomer.set(doc.customer, (perCustomer.get(doc.customer) ?? 0) + cents);
  }

  const byCustomer = [...perCustomer]
    .sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0))
    .map(([customer, cents]) => ({ customer, totalUsd: formatUsd(cents) }));

  return { month, documentCount: docs.length, totalUsd: formatUsd(total), byCustomer };
}
