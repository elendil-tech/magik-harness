---
id: INT-payment-provider-checkout
title: Payment provider hosted checkout
summary: Sends the client to the provider's hosted page to pay and receives signed confirmations back.
anchor: CAP-collect-payments
maturity: specified
direction: bidirectional
protocol: HTTPS redirect to the provider's hosted checkout, and signed webhooks back
auth: An API key to create a checkout; a signature on every webhook, verified before it is trusted
rel:
  integrates_with: [EXT-payment-provider]
---

## What flows

Out: a checkout request carrying the invoice reference, the amount and the return address. In: a confirmation that the charge succeeded or failed, with the provider's reference. No card data in either direction ([[REQ-card-data-never-stored]]).

## Failure handling

Webhooks are verified by signature, deduplicated by the provider's reference and processed idempotently, so a repeat changes nothing. A failure to create a checkout shows the pay page's fallback ([[REQ-payment-provider-fallback]]). A confirmation for an unknown invoice is kept, alerted on and never applied.

## Contract and limits

The provider rate-limits checkout creation; we create at most one checkout per attempt and reuse it if the client returns within its validity. Webhooks may arrive up to an hour late.
