---
id: EVT-payment-received
title: Payment received
summary: The provider confirmed a charge and it was recorded against an invoice.
anchor: CAP-collect-payments
maturity: specified
kind: domain
delivery: at_least_once
pii: false
---

## Meaning

Published when a payment is recorded, whether it clears the balance or only reduces it. Tells the owner ([[MSG-payment-received]]). Consumers must tolerate seeing it twice.

```pds-payload
fields:
  - {name: payment_id, type: id, required: true}
  - {name: invoice_id, type: id, required: true}
  - {name: amount, type: money, required: true}
  - {name: balance_after, type: money, required: true}
```
