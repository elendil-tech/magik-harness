---
id: QST-refunds-and-disputes
title: Who handles refunds and chargebacks?
summary: Whether owners deal with refunds and disputes in the provider's dashboard or Ledgerly does it for them.
anchor: CAP-collect-payments
maturity: specified
status: open
blocking: false
asked_of: Sam Ortiz
due: 2027-01-31
rel:
  concerns: [FEAT-pay-invoice-online, EXT-payment-provider]
---

The first release records payments but cannot reverse them. An owner who has to refund or who faces a chargeback would use the provider's own dashboard, and the invoice would then no longer match what was paid. The question is whether that is acceptable for launch, and whether a refund or dispute should change the invoice's balance and state.
