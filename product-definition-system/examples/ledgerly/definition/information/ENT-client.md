---
id: ENT-client
title: Client
summary: A business that a workspace sends invoices to, with its name, email, address and default payment terms.
anchor: CAP-invoicing
maturity: specified
classification: confidential
pii: true
monetary: false
tenant_scoped: true
system_of_record: internal
retention: Until the owner deletes the client or the workspace is closed; invoices already sent keep their own copy
has_lifecycle: false
---

## Meaning

The address book of a workspace ([[TERM-client]]). A client has no Ledgerly account and is never shown to another workspace, even when two workspaces invoice the same business.

## Ownership and lifecycle

Created by any member while drafting an invoice, edited and deleted by members with permission to invoice. Deleting a client does not touch invoices already sent to them.

```pds-attributes
attributes:
  - {name: id, type: id, required: true, unique: true}
  - {name: workspace_id, type: id, required: true}
  - {name: name, type: text, required: true, pii: true, note: Company or person's name}
  - {name: email, type: email, required: true, pii: true, note: Where invoices are sent}
  - {name: address, type: text, pii: true, note: Needed on the invoice for EU VAT}
  - {name: vat_number, type: text, note: Shown on the invoice when present}
  - {name: payment_terms_days, type: int, note: Default days between sending and the due date}
```
