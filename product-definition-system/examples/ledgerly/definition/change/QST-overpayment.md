---
id: QST-overpayment
title: What if two payments for one invoice are confirmed at once?
summary: Two payments started against the same balance can together exceed it, and the rule only checks at the start.
anchor: FEAT-pay-invoice-online
maturity: specified
status: open
blocking: false
asked_of: Dana Whitfield, with the payment provider
due: 2026-12-01
rel:
  concerns: [FEAT-pay-invoice-online, RULE-payment-covers-balance]
---

A client who opens the pay page twice, or two people at the client who share the link, can start two payments that are each within the balance when started ([[RULE-payment-covers-balance]]) but together exceed it. The options are to refuse the second at confirmation and refund it automatically, to record the excess as a credit on the client, or to accept the risk until it is seen in practice. Refunds are out of scope for the first release, so for now the case is recorded and the owner is alerted.
