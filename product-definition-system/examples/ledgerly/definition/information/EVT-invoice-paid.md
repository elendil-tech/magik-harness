---
id: EVT-invoice-paid
title: Invoice paid
summary: An invoice's balance reached zero.
anchor: CAP-collect-payments
maturity: specified
kind: domain
delivery: at_least_once
pii: false
---

## Meaning

Published once when the last payment brings the balance to zero. It is the source of the days-to-paid measure ([[MET-days-to-paid]]).

```pds-payload
fields:
  - {name: invoice_id, type: id, required: true}
  - {name: sent_at, type: datetime, required: true}
  - {name: paid_at, type: datetime, required: true}
```
