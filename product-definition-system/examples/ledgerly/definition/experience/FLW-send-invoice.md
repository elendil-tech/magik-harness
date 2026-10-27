---
id: FLW-send-invoice
title: Send an invoice
summary: From the owner confirming a finished draft to the client's email being handed to the provider.
anchor: FEAT-send-invoice
maturity: specified
trigger: The owner chooses Send on a finished draft
rel:
  realizes: [UC-invoice-a-client]
---

## Notes

The number is assigned and the email queued in one transaction, so a delivery problem can never waste an invoice number ([[DEC-sequential-invoice-numbers]]). Delivery is a background step: the owner sees "sent" as soon as the transaction commits and is told afterwards if the email cannot be delivered.

```pds-flow
trigger: The owner chooses Send on a finished draft
entry: review
steps:
  - id: review
    actor: ACT-account-owner
    at: SCR-invoice-review
    does: Checks the recipient, the totals and the due date, then confirms
    uses: [RULE-invoice-total]
    decide:
      - {when: The owner confirms, next: check-limit}
      - {when: The owner goes back to edit, next: cancelled}
  - id: check-limit
    does: The system checks that the workspace is under its monthly invoice limit
    decide:
      - {when: The workspace is under the limit, next: send}
      - {when: The workspace is at the limit, next: blocked}
  - id: send
    does: The system takes the next invoice number, marks the invoice sent and queues the email, in one transaction
    uses: [RULE-invoice-number-sequence]
    accesses: {ENT-invoice: [update]}
    moves: {STM-invoice-lifecycle: ["draft->sent"]}
    emits: [EVT-invoice-sent]
    next: deliver
  - id: deliver
    does: A background job hands the email with the private pay link to the delivery provider
    uses: [INT-email-sending]
    decide:
      - {when: The provider accepts the message, next: done}
      - {when: The provider rejects it or the address bounces, next: undelivered}
  - id: done
    does: The owner sees the invoice as sent
    end: success
  - id: undelivered
    does: The owner is told delivery failed, and can correct the address and send it again with the same number
    end: failure
  - id: blocked
    does: The owner sees the monthly limit and an upgrade prompt; the draft is kept
    end: abort
  - id: cancelled
    does: Nothing changes; the draft stays as it was
    end: abort
```
