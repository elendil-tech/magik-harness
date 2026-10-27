---
id: REQ-confirm-recipient
title: The owner confirms the recipient before sending
summary: Sending needs an explicit confirmation on a screen that shows who gets the invoice and for how much.
anchor: FEAT-send-invoice
maturity: specified
kind: functional
statement: When the owner chooses Send, the system shall require explicit confirmation on a screen that shows the recipient's name, email address and the invoice total.
priority: must
verification: test
rel:
  mitigates: [RISK-wrong-recipient]
---
