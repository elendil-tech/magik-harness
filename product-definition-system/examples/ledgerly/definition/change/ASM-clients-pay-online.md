---
id: ASM-clients-pay-online
title: Clients will pay by card from the invoice email
summary: Most clients will use a card payment link rather than insist on a bank transfer.
anchor: PROD-ledgerly
maturity: specified
status: open
confidence: medium
if_wrong: Online payment is used on a minority of invoices, the product promise weakens, and bank-transfer reconciliation becomes necessary.
validate_by: Track the share of paid invoices settled online during the closed beta
validate_before: 2027-02-28
rel:
  concerns: [FEAT-pay-invoice-online]
  evidenced_by: [EVD-freelancer-interviews]
---

Seven of twelve interviewees said clients would pay sooner if paying were one click ([[EVD-freelancer-interviews]]). That is what they believe about their clients, not what clients did. The closed beta measures it.
