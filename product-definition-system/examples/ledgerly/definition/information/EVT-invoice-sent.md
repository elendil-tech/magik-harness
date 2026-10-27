---
id: EVT-invoice-sent
title: Invoice sent
summary: An invoice received its number and was queued for the client.
anchor: CAP-invoicing
maturity: specified
kind: domain
delivery: at_least_once
pii: true
---

## Meaning

Published in the same transaction that numbers the invoice. The invoice email, the activation metric and the monthly invoice count all follow from it ([[MSG-invoice-email]], [[MET-activation-rate]]). Consumers must tolerate seeing it twice.

```pds-payload
fields:
  - {name: invoice_id, type: id, required: true}
  - {name: workspace_id, type: id, required: true}
  - {name: number, type: text, required: true}
  - {name: total, type: money, required: true}
  - {name: client_email, type: email, required: true, pii: true}
```
