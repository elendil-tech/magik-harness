---
id: DEC-eu-data-residency
title: Customer data stays in the EU
summary: Store and process customer and client data in EU regions only, including at subprocessors.
anchor: PROD-ledgerly
maturity: specified
status: accepted
date: 2026-09-16
deciders: [Dana Whitfield, Sam Ortiz]
rel:
  concerns: [DOM-trust-and-compliance, OBL-privacy-law]
---

## Context

Customers are EU businesses whose clients' names and emails sit in our records. Several interviewees asked where the data lives before asking about price.

## Options considered

1. Single global region: cheapest, and the hardest to explain to EU customers.
2. EU only: a clear promise, and it limits the choice of subprocessors.

## Decision

EU only, at launch, for primary data, backups and subprocessors that receive personal data.

## Consequences

The payment provider and the email delivery provider must offer EU processing and be listed as subprocessors. Opening other regions later is a new decision, not an implicit extension.
