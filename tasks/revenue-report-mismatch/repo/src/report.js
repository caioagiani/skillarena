import { latestRate } from "../data/rates.js";

/** Monthly revenue report. See "Monthly revenue report" in README.md. */
export function monthlyReport(documents, month) {
  const [year, mon] = month.split("-").map(Number);
  const docs = documents.filter((doc) => {
    const d = new Date(doc.issuedAt);
    return d.getFullYear() === year && d.getMonth() + 1 === mon;
  });

  let total = 0;
  const perCustomer = {};
  for (const doc of docs) {
    let amount = 0;
    for (const line of doc.lines) {
      amount += line.quantity * line.unitPrice * (1 + line.taxRate);
    }
    if (doc.currency !== "USD") amount *= latestRate(doc.currency);
    total += amount;
    perCustomer[doc.customer] = (perCustomer[doc.customer] ?? 0) + amount;
  }

  const byCustomer = Object.entries(perCustomer)
    .sort((a, b) => b[1] - a[1])
    .map(([customer, amount]) => ({ customer, totalUsd: amount.toFixed(2) }));

  return { month, documentCount: docs.length, totalUsd: total.toFixed(2), byCustomer };
}
