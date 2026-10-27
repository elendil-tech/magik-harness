---
id: DEC-two-plans
title: Two plans, a Free tier and a flat-priced Team tier
summary: Charge per workspace on two plans, limiting invoices on Free, rather than per seat or per invoice.
anchor: PROD-ledgerly
maturity: specified
status: accepted
date: 2026-09-09
deciders: [Dana Whitfield]
rel:
  concerns: [DOM-billing-and-plans, CAP-plan-catalogue]
---

## Context

The product earns when freelancers send enough invoices to rely on it. Per-seat pricing penalises the agencies we want later, and per-invoice pricing feels like a tax on being paid.

## Options considered

1. Per seat: simple, but most customers are one person.
2. Per invoice: tracks value, but makes the monthly charge unpredictable.
3. Free tier with an invoice limit plus one flat-priced tier: predictable, and the limit is the upgrade trigger.

## Decision

Option 3: Free (five invoices a month) and Team (flat monthly price per workspace, unlimited invoices, up to five members).

## Consequences

The invoice limit becomes an entitlement that gates sending ([[ENTL-monthly-invoices]]), so plan changes reach the core feature. Enterprise is not offered; the question of a sales-led motion stays open ([[QST-sales-motion]]).
