---
id: RISK-wrong-recipient
title: An invoice goes to the wrong client
summary: A sent invoice reaches someone it was not meant for and shows them another business's amounts.
anchor: FEAT-send-invoice
maturity: specified
likelihood: low
impact: high
status: mitigating
response: mitigate
owner: Dana Whitfield
rel:
  concerns: [FEAT-send-invoice]
---

## Description

A mistyped or stale address, or the wrong client picked from the list, sends an invoice to a stranger. They see what the owner charges and for what, and the real client never gets it. It breaks the promise in [[PROD-ledgerly]] that an invoice is never sent to the wrong client, and an email cannot be recalled.

## Response plan

Reduce the chance with a mandatory confirmation that shows the recipient's name, address and total ([[REQ-confirm-recipient]]), and by copying the client's details onto the invoice at sending so later edits cannot redirect it. Reduce the harm by letting the owner void the invoice, which keeps its number, and send a corrected one. Review any support report of a misdirected invoice within one working day.
