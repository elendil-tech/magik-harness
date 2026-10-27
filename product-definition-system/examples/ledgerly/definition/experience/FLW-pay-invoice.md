---
id: FLW-pay-invoice
title: Pay an invoice online
summary: From the client opening the private link to a recorded payment and a receipt.
anchor: FEAT-pay-invoice-online
maturity: specified
trigger: The client opens the private link in the invoice email
rel:
  realizes: [UC-invoice-a-client]
---

## Notes

The invoice is marked paid only when the provider confirms the charge, never when the client returns to the page ([[REQ-payment-confirmation]]). The page can be re-entered at any point, so every step starts from the invoice's current state, not from the page's history.

```pds-flow
trigger: The client opens the private link in the invoice email
entry: view
steps:
  - id: view
    actor: ACT-client
    at: SCR-pay-page
    does: Reads the invoice and chooses Pay
    accesses: {ENT-invoice: [read]}
    next: choose-amount
  - id: choose-amount
    actor: ACT-client
    at: SCR-pay-page
    does: Keeps the full balance or enters a smaller amount
    uses: [RULE-payment-covers-balance]
    decide:
      - {when: The amount is valid, next: pay}
      - {when: The amount is above the balance or not positive, next: invalid-amount}
  - id: invalid-amount
    does: The page explains the allowed range and asks again
    next: choose-amount
  - id: pay
    does: The client is taken to the payment provider's page and enters card details there
    uses: [INT-payment-provider-checkout]
    decide:
      - {when: The provider reports the card was charged, next: record}
      - {when: The card is declined or the client leaves, next: declined}
      - {when: The provider is unavailable, next: provider-down}
  - id: record
    does: The system records the payment, reduces the balance and marks the invoice paid when nothing is left
    accesses: {ENT-payment: [create], ENT-invoice: [update]}
    moves: {STM-invoice-lifecycle: ["sent->paid", "overdue->paid"]}
    emits: [EVT-payment-received, EVT-invoice-paid]
    next: receipt
  - id: receipt
    actor: ACT-client
    at: SCR-pay-page
    does: Sees the receipt and is emailed a copy
    end: success
  - id: declined
    does: The page shows what happened and offers to try again with the same link
    end: failure
  - id: provider-down
    does: The page says paying is unavailable and shows the owner's bank details
    end: abort
```
