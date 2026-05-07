---
schema: decision
id: paid-budget-allocation
domain: marketing
status: active
created: 2026-03-20
updated: 2026-04-15
last_referenced: 2026-04-22
provenance: direct
trust: high
quarantine: false
applies_to: [marketing]
enforcement: advisory
links:
  - knowledge/marketing/paid-channel-mix.md
tags: [paid, budget, finance]
---

# Quarterly paid budget — fixed, not a percentage of revenue

## Decision

Paid acquisition spend is set as a **fixed quarterly budget** decided at the start of each quarter, not as a percentage of revenue.

## Q2 2026 budget

$140k total. Channel allocation per `paid-channel-mix.md`.

## Rationale

- Percentage-of-revenue spending creates a procyclical loop: when revenue dips, spend dips, which dips revenue further. Fixed-budget breaks the loop.
- A fixed quarterly cap is also easier to govern: one approval cycle per quarter, agency partners can plan creative slate against a known number.
- We re-evaluate the cap quarterly using last-quarter LTV/CAC and runway. The cap is *informed by* revenue, not *derived from* it.

## Overage rule

- Channel-level overages of <10% within-quarter are allowed without reapproval (creative-test fluctuation).
- Cumulative overage >5% across the full mix triggers a mid-quarter review with the founder + finance.
- Pause-and-audit triggers (CPA breaches, channel underperformance) live in policies under marketing/, not here — this entry is about the *cap*, not the *kill rules*.
