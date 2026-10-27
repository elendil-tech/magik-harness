---
id: ENT-invoice
title: Invoice
summary: A request for payment from a workspace to one of its clients, with lines, tax, a number and a balance.
anchor: CAP-invoicing
maturity: specified
classification: confidential
pii: true
monetary: true
tenant_scoped: true
system_of_record: internal
retention: Seven years from the end of the financial year of the invoice, as tax law requires
has_lifecycle: true
---

## Meaning

The legal document at the centre of the product ([[TERM-invoice]]). It belongs to one workspace and is addressed to one client. Its lines (description, quantity, unit price, tax rate) are part of it and have no life of their own. Once sent, its content is frozen: the client's name and email are copied onto it so that editing the client later never rewrites a document someone already received.

## Ownership and lifecycle

Created as a draft by a member with permission to invoice; sent by an Owner ([[PERM-send-invoice]]). It follows [[STM-invoice-lifecycle]]. A draft can be deleted; a sent invoice can only be voided, never deleted, and is kept for the retention period even after the workspace closes.

```pds-attributes
attributes:
  - {name: id, type: id, required: true, unique: true}
  - {name: workspace_id, type: id, required: true}
  - {name: number, type: text, required: true, unique: true, note: Empty while a draft; INV- and four digits once sent}
  - {name: status, type: text, required: true, note: One of the states of the invoice lifecycle}
  - {name: delivery_status, type: text, required: true, note: Queued and then delivered or undelivered as the email provider reports}
  - {name: client_name, type: text, required: true, pii: true, note: Copied from the client when sent}
  - {name: client_email, type: email, required: true, pii: true, note: Copied from the client when sent}
  - {name: issue_date, type: date, note: Set when sent}
  - {name: due_date, type: date, required: true}
  - {name: currency, type: text, required: true}
  - {name: total, type: money, required: true, note: Computed from the lines}
  - {name: balance, type: money, required: true, note: Total minus confirmed payments}
  - {name: pay_token, type: text, required: true, unique: true, note: Secret; it is the private link}
associations:
  - {to: ENT-client, kind: many_to_one, label: billed to}
  - {to: ENT-payment, kind: one_to_many, label: paid by}
```
