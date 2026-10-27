---
id: ACT-client
title: Client
summary: The business that receives an invoice and pays it; has no Ledgerly account.
anchor: PROD-ledgerly
maturity: specified
kind: external
internal: false
authn: None; access is by a private link in the invoice email
goals: [Understand what is being billed, Pay in one step, Keep a receipt]
rel:
  holds: [ROLE-invoice-recipient]
---

## Who they are

A business, usually another small company, that bought work from an account owner. They never sign up. Their only touchpoints are the invoice email and the page it links to.

## Access and lifecycle

Created implicitly when an owner adds them as a client and sends an invoice. Access is a private, unguessable link to one invoice. The link works until the invoice is voided or paid and can be re-sent by the owner at any time. Nothing else is visible through it.

## Exceptions and security

Anyone holding the link can pay the invoice, which is intended: a colleague of the client may be the one who pays. The link cannot reveal other invoices or the owner's client list. A voided invoice shows a plain notice instead of payment options.
