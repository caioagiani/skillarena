import { roundCents } from "./money.js";
import { rateOn } from "../data/rates.js";

/**
 * @typedef {{ quantity: number, unitPrice: number, taxRate: number, description?: string }} Line
 * @typedef {{ id: string, customer: string, type: "invoice" | "credit", status: "open" | "paid" | "void",
 *   currency: "USD" | "EUR" | "GBP" | "BRL", issuedAt: string, lines: Line[] }} Document
 */

export function lineTotalCents(line) {
  const net = roundCents(line.quantity * line.unitPrice * 100);
  const tax = roundCents(net * line.taxRate);
  return net + tax;
}

/** Total in the document's own currency, in cents. */
export function invoiceTotalCents(doc) {
  return doc.lines.reduce((sum, line) => sum + lineTotalCents(line), 0);
}

/** Total converted to USD at the reference rate of the UTC issue day, in cents. Always positive. */
export function invoiceTotalUsdCents(doc) {
  const total = invoiceTotalCents(doc);
  if (doc.currency === "USD") return total;
  const day = new Date(doc.issuedAt).toISOString().slice(0, 10);
  return roundCents(total * rateOn(doc.currency, day));
}
