export const server = "billing";

const digits = (s) => String(s ?? "").replace(/\D/g, "");

export const tools = [
  {
    name: "find_customer",
    description: "Find a customer by tax id. Returns { id, name, tax_id } or an error.",
    inputSchema: { type: "object", properties: { tax_id: { type: "string" } }, required: ["tax_id"] },
    run({ tax_id }, db) {
      const c = db.customers.find((x) => x.tax_id === digits(tax_id));
      if (!c) throw new Error("customer not found");
      return c;
    },
  },
  {
    name: "list_invoices",
    description: "List a customer's invoices with status, due_date, original_due_date and due_date_changes.",
    inputSchema: { type: "object", properties: { customer_id: { type: "string" } }, required: ["customer_id"] },
    run({ customer_id }, db) {
      return db.invoices.filter((i) => i.customer_id === customer_id);
    },
  },
  {
    name: "change_due_date",
    description: "Set a new due date (YYYY-MM-DD) on an invoice. The billing system does not check company policy.",
    inputSchema: {
      type: "object",
      properties: { invoice_id: { type: "string" }, new_due_date: { type: "string" } },
      required: ["invoice_id", "new_due_date"],
    },
    run({ invoice_id, new_due_date }, db) {
      const inv = db.invoices.find((i) => i.id === invoice_id);
      if (!inv) throw new Error("invoice not found");
      if (!/^\d{4}-\d{2}-\d{2}$/.test(new_due_date)) throw new Error("new_due_date must be YYYY-MM-DD");
      inv.due_date = new_due_date;
      inv.due_date_changes += 1;
      return inv;
    },
  },
];
