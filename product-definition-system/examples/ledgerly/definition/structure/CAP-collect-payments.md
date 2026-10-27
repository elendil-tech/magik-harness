---
id: CAP-collect-payments
title: Collect payments
summary: Let a client pay an invoice online and show the owner the result without chasing.
anchor: DOM-invoicing
maturity: specified
tier: 1
outcome: A client pays a sent invoice in one step, and the owner sees it marked paid without doing anything.
owner: Sam Ortiz
rel:
  serves: [OBJ-paid-faster, OPP-late-payment]
  measured_by: [MET-days-to-paid]
---

## Purpose and outcome

Closes the loop the product promises: sent today, paid this week. Success is the median time from sending to paid falling below the 38 days people report today ([[MET-days-to-paid]]).

## Scope

In: the client's pay page, card payment through the payment provider, recording payments against an invoice, full and partial payment, the paid and overdue states, and telling the owner. Out: bank-transfer reconciliation, refunds and disputes (deferred), payment reminders (deferred).
