---
id: DEC-core-job
title: Ledgerly exists to get self-employed people paid
summary: The core job is getting paid for finished work; the customer, buyer and user are the same self-employed person.
anchor: PROD-ledgerly
maturity: specified
status: accepted
date: 2026-09-02
deciders: [Dana Whitfield, Sam Ortiz]
rel:
  concerns: [DOM-invoicing, CAP-invoicing]
  evidenced_by: [EVD-freelancer-interviews]
---

## Context

The first positioning drafts mixed invoicing, bookkeeping and tax. Interviews ([[EVD-freelancer-interviews]]) showed that the pain people pay to remove is being paid late, not keeping accounts.

## Options considered

1. Bookkeeping for freelancers: matches what suites sell, but needs accountants and a ledger, and the interviewees found it heavy.
2. Invoicing with online payment: narrow, fast to a first value moment, and attacks late payment directly.
3. Invoicing plus client management (a CRM): more to sell, but dilutes the first week.

## Decision

Option 2. The one job is getting a self-employed person paid for finished work. The customer is a self-employed person or a small-business owner (business to business); the person who buys is the person who uses.

## Consequences

No ledger, no chart of accounts, no expense tracking in the first releases. Clients are a lightweight list, not a CRM. Roles stay simple because buyer and user coincide. We will lose prospects who want one tool for everything.
