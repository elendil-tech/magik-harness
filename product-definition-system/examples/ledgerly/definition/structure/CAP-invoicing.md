---
id: CAP-invoicing
title: Invoicing
summary: Create an invoice for a client, number it correctly and send it so the client can read and pay it.
anchor: DOM-invoicing
maturity: specified
approval: {state: approved, by: Dana Whitfield, at: 2026-10-27, hash: sha256:cb2719ca0da228d3}
tier: 1
outcome: An owner turns finished work into a correct, numbered invoice in the client's inbox within minutes.
owner: Dana Whitfield
reviewed: 2026-10-27
rel:
  serves: [OBJ-first-value, OPP-late-payment]
  measured_by: [MET-activation-rate]
---

## Purpose and outcome

The heart of the product: from "I finished the work" to "the client has a correct invoice". Success is a first invoice sent in the first week ([[OBJ-first-value]]) and nobody having to fix a number, a total or a recipient afterwards.

## Scope

In: drafting an invoice for a client, line items and tax, numbering at sending, sending by email with a pay link, the invoice's life from draft to paid or void, and the entities and rules that describe it (invoice, client, total, number sequence, lifecycle).

Out: taking the payment ([[CAP-collect-payments]]), reminders and recurring invoices (deferred), and the plan limit's own definition ([[ENTL-monthly-invoices]]), which this capability obeys.
