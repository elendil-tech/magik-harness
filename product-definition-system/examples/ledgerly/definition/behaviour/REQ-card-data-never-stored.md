---
id: REQ-card-data-never-stored
title: Card data never reaches Ledgerly
summary: No card number, expiry or security code is received, stored or logged by any Ledgerly system.
anchor: CAP-collect-payments
maturity: specified
kind: constraint
statement: The system shall not receive, store or log card numbers, expiry dates or security codes.
priority: must
verification: inspection
verification_note: Review of the integration design and of the pay page's network traffic against the provider's hosted-checkout checklist, repeated at every release that touches the pay page or its logging.
rel:
  derives_from: [DEC-hosted-card-fields]
  satisfies: [OBL-payment-card-security]
---
