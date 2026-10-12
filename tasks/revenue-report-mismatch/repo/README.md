# billing

Invoicing and revenue reporting for our SaaS.

## Conventions

- Timestamps are ISO 8601 strings and may carry any UTC offset (`2026-03-01T01:30:00+02:00`).
  Every calendar computation (days, months) is done in **UTC**, regardless of where the server runs.
- Money is handled in integer cents. Amounts are rounded half away from zero to the cent with
  `roundCents` from `src/money.js`.

## Invoices

An invoice has lines. Each line's net amount is `quantity × unitPrice`, rounded to the cent, and
its tax is `net × taxRate`, rounded to the cent. Lines of one invoice may have different tax rates.
The invoice total is the sum of its lines' net and tax. `invoiceTotalCents` implements this.

### Lifecycle

`status` is `open`, `paid` or `void`. A void invoice was issued by mistake: it is not revenue and
doesn't count anywhere.

### Credit notes

A document with `type: "credit"` is a credit note (a refund). Its lines hold positive amounts,
exactly like an invoice, and its total is computed the same way. Credit notes **reduce** revenue.
They follow the same lifecycle rules as invoices.

## Currencies

Customers are billed in `USD`, `EUR`, `GBP` or `BRL`. For reporting, a document's total is
converted to USD at the finance reference rate **of the UTC day it was issued** (`rateOn` in
`data/rates.js`), then rounded to the cent. `invoiceTotalUsdCents` implements this.

## Monthly revenue report

`monthlyReport(documents, month)` takes every document we have and a month as `"YYYY-MM"`
(throws a `TypeError` for anything else) and returns:

```js
{
  month: "2026-03",
  documentCount: 12,            // documents of that month that count as revenue (credit notes included)
  totalUsd: "10432.17",         // revenue: sum of invoice USD totals minus credit note USD totals
  byCustomer: [                 // one entry per customer with a document that month
    { customer: "acme", totalUsd: "8000.00" },
    { customer: "globex", totalUsd: "-12.50" },
  ],
}
```

Amounts are strings with exactly two decimals and a leading `-` when negative. A document belongs
to the month it was issued in. `byCustomer` is sorted by amount, largest first; customers with the
same amount are sorted by name. The report must agree to the cent with the invoice totals and must
not modify its input.
