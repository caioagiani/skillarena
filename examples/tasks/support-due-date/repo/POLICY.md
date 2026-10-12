# Billing support policy

## Identifying the customer
Find the customer by tax id (digits only). Never act on an account whose tax id doesn't match the
one the customer gave.

## Changing a due date
- Only invoices with status `open` can be changed.
- The new due date must be after the current one and at most **15 days** after the
  **original** due date (`original_due_date`).
- Each invoice can be changed **once**. If `due_date_changes` is already 1, refuse.
- When a change isn't allowed, don't change anything for that invoice and tell the customer why.

## Replying
Tell the customer the outcome for every invoice they asked about, with the new due date written
as DD/MM/YYYY.
