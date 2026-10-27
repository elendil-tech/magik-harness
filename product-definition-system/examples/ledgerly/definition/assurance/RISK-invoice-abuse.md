---
id: RISK-invoice-abuse
title: Sending is used to spam or phish strangers
summary: Someone signs up only to send fake invoices, harming recipients and the sending reputation every owner relies on.
anchor: FEAT-send-invoice
maturity: specified
likelihood: medium
impact: high
status: accepted
response: accept
owner: Dana Whitfield
rel:
  concerns: [FEAT-send-invoice, EXT-email-delivery]
---

## Description

A fake invoice from a billing product looks legitimate, so it is an attractive way to phish. The harm falls on the recipients and on the reputation of the sending domain, which every owner's delivery depends on ([[EXT-email-delivery]]).

## Response plan

Accepted for the closed beta, because workspaces are invited and the Free plan allows five invoices a month. To be decided at the launch review ([[RLS-first-release]]): sending limits for new workspaces, a held-for-review state for suspicious sends, and a way for recipients to report an invoice from the email footer.
