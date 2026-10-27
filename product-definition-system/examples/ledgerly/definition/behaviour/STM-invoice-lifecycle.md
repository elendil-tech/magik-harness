---
id: STM-invoice-lifecycle
title: Invoice lifecycle
summary: An invoice moves from draft to sent, may become overdue, and ends paid or void.
anchor: CAP-invoicing
maturity: specified
scope: entity
rel:
  lifecycle_of: [ENT-invoice]
---

## Notes

States only move forward. A draft is private to the workspace and has no number. Sending gives it a number and makes it payable. Overdue is not a decision anyone takes: it follows from the due date. Paid and void are final.

```pds-states
states:
  - {id: draft, label: Draft, kind: initial, note: Being written; the client cannot see it and it has no number}
  - {id: sent, label: Sent, note: Numbered and payable once it has been emailed}
  - {id: overdue, label: Overdue, note: Past its due date with a balance outstanding}
  - {id: paid, label: Paid, kind: terminal, note: The balance is zero}
  - {id: void, label: Void, kind: terminal, note: Cancelled by the owner and the number is kept}
transitions:
  - {from: draft, to: sent, trigger: The owner sends it, by: ACT-account-owner, guard: [RULE-invoice-number-sequence], emits: [EVT-invoice-sent]}
  - {from: sent, to: paid, trigger: A payment brings the balance to zero, by: system, emits: [EVT-invoice-paid]}
  - {from: sent, to: overdue, trigger: The due date passes with a balance outstanding, by: system}
  - {from: overdue, to: paid, trigger: A payment brings the balance to zero, by: system, emits: [EVT-invoice-paid]}
  - {from: sent, to: void, trigger: The owner voids it, by: ACT-account-owner}
  - {from: overdue, to: void, trigger: The owner voids it, by: ACT-account-owner}
```

## Edge cases

A paid invoice cannot be voided; a credit note is the later answer. A draft is deleted, never voided, so it never uses a number. A daily job at 06:00 UTC marks an invoice overdue when its due date has passed and its balance is above zero, so an invoice paid in full on its due date never becomes overdue. Partial payments reduce the balance and change no state.
