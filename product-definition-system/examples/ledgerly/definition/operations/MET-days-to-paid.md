---
id: MET-days-to-paid
title: Days to paid
summary: The median number of days from sending an invoice to its being paid in full.
anchor: PROD-ledgerly
maturity: specified
kind: north_star
definition: The median number of days between an invoice being sent and its balance reaching zero, over the invoices sent in a calendar month. An invoice still unpaid after 60 days counts as 60 days, so unpaid invoices cannot flatter the median.
unit: days
grain: Calendar month of sending
direction: down
target: 14 days or fewer, against the 38-day baseline from the interviews
owner: Dana Whitfield
rel:
  sourced_from: [EVT-invoice-sent, EVT-invoice-paid]
---

## Interpretation

Read together with the share of paid invoices that were paid online: a faster median that comes only from bank transfers would not show that the product works ([[ASM-clients-pay-online]]). Partial payments do not count until the balance is zero. A month is not final until 60 days after it ends, so the figures for recent months move as invoices are paid.
