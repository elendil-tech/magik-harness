---
id: MET-activation-rate
title: Activation rate
summary: The share of new workspaces that send their first invoice within seven days of signing up.
anchor: PROD-ledgerly
maturity: specified
kind: input
definition: The number of workspaces that send at least one invoice within seven days of being created, divided by the number of workspaces created in that week. Test and internal workspaces are left out.
unit: percent
grain: Weekly sign-up cohort
direction: up
target: 60% of each weekly cohort by the end of the first release
owner: Dana Whitfield
rel:
  sourced_from: [EVT-invoice-sent]
---

## Interpretation

Read by cohort and never as one blended figure, because early cohorts come from friends and later ones from search. A fall means people reach the first invoice and stop: look first at the review screen's empty and error states ([[SCR-invoice-review]]) and at undelivered invoices ([[FLW-send-invoice]]). A rise caused only by a promotion that attracts unusually keen users is not an improvement in the product.
