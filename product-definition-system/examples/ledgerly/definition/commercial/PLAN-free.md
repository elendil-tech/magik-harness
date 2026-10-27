---
id: PLAN-free
title: Free
summary: For people sending a handful of invoices a month; costs nothing.
anchor: PROD-ledgerly
maturity: specified
visibility: public
price: {model: free, amount: 0, currency: EUR, interval: monthly}
entitlements:
  - {entl: ENTL-monthly-invoices, value: 5}
---

## Positioning

For a freelancer who invoices a few clients. The limit of five invoices a month is deliberately close to what a part-time freelancer sends, so heavier users move to Team without feeling tricked ([[DEC-two-plans]]).

## Rules

No trial: it is free. Downgrading from Team is allowed at any time; existing invoices stay, and the monthly limit applies from the next calendar month. Nothing is deleted when a workspace is over the limit.
