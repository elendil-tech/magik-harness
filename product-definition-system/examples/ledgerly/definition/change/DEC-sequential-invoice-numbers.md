---
id: DEC-sequential-invoice-numbers
title: Invoice numbers are sequential per workspace and never reused
summary: Each workspace numbers its invoices in one unbroken sequence assigned at the moment of sending.
anchor: CAP-invoicing
maturity: specified
status: accepted
date: 2026-09-23
deciders: [Dana Whitfield, Sam Ortiz]
rel:
  concerns: [OBL-tax-and-invoicing]
---

## Context

EU VAT rules require a sequential number that uniquely identifies each invoice ([[OBL-tax-and-invoicing]]). Drafts are edited, deleted and abandoned, so numbering them would leave gaps.

## Options considered

1. Number at creation: simple, but deleted drafts leave gaps that an auditor reads as missing invoices.
2. Number at sending: only invoices that exist for the client consume a number.
3. Let the owner type the number: flexible, and the owner carries the risk of duplicates.

## Decision

Option 2. The number is assigned when the invoice moves from draft to sent, from a per-workspace counter, and is never changed, reused or removed. A sent invoice that is cancelled is voided, keeping its number.

## Consequences

Drafts have no number. Two people sending at the same moment need a counter that cannot hand out the same number twice. Importing historical invoices needs a way to set the starting number once.
