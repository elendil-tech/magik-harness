---
id: RISK-payment-provider-outage
title: The payment provider is unavailable
summary: Clients cannot pay online while the provider is down, and invoices wait longer for payment.
anchor: FEAT-pay-invoice-online
maturity: specified
likelihood: medium
impact: medium
status: mitigating
response: mitigate
owner: Dana Whitfield
rel:
  concerns: [FEAT-pay-invoice-online, EXT-payment-provider]
---

## Description

The hosted checkout or its confirmations stop working for minutes or hours. Clients who open the pay page cannot pay by card, and a confirmation that arrives late leaves a paid invoice showing as unpaid for a while ([[EXT-payment-provider]]).

## Response plan

The pay page shows the owner's bank details and says that paying online is unavailable ([[REQ-payment-provider-fallback]]), so the client is never stuck. Late confirmations are applied when they arrive and are safe to repeat ([[INT-payment-provider-checkout]]). The provider's status page is watched, and an outage of more than one hour is announced to owners in the app.
