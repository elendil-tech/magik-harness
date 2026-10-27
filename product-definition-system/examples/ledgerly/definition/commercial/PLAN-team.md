---
id: PLAN-team
title: Team
summary: Unlimited invoices and up to five members for a flat monthly price.
anchor: PROD-ledgerly
maturity: specified
visibility: public
price: {model: flat, amount: 12, currency: EUR, interval: monthly}
trial_days: 14
entitlements:
  - {entl: ENTL-monthly-invoices, value: unlimited}
---

## Positioning

For a freelancer past five invoices a month and for small agencies. A flat price per workspace keeps billing predictable for people who dislike per-seat arithmetic ([[DEC-two-plans]]).

## Rules

A 14-day trial starts when a workspace first upgrades and needs no card. Upgrades apply immediately; downgrades apply at the end of the paid period. Cancelling returns the workspace to Free at the end of the paid period; nothing is deleted.
