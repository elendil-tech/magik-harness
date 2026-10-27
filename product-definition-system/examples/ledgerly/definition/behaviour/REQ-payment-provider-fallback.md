---
id: REQ-payment-provider-fallback
title: The pay page falls back to bank details
summary: When the provider is down the client is told so and shown the owner's bank details instead.
anchor: FEAT-pay-invoice-online
maturity: specified
kind: functional
statement: If the payment provider is unavailable, the pay page shall show the owner's bank details and a notice that paying online is unavailable.
priority: should
verification: test
rel:
  mitigates: [RISK-payment-provider-outage]
---
