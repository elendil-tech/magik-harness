---
id: PROD-ledgerly
title: Ledgerly
summary: Invoicing that gets freelancers and small agencies paid sooner, without bookkeeping software.
maturity: specified
category: Invoicing software for freelancers and small agencies
stage: building
customer_model: b2b
platforms: [web]
markets: [EU]
owner: Dana Whitfield
reviewed: 2026-10-20
---

## Problem

Freelancers and small agencies finish the work and then wait for the money. In [[EVD-freelancer-interviews]] the people we spoke to waited a median of 38 days to be paid, and most of them spent an hour or more a week chasing. Invoices are assembled in spreadsheets or word-processor templates, sent as attachments and paid by bank transfer when the client remembers.

What they do today: spreadsheets and templates, full bookkeeping suites, or a thread of reminder emails. The suites solve the accountant's problem and bury the freelancer's; the templates have no payment link, no reminders and no record of who has seen what.

## Value proposition

A finished invoice leaves in a couple of minutes, the client pays it with a card from the email, and the freelancer sees it turn paid without chasing. It is deliberately not bookkeeping: no ledger, no chart of accounts, nothing to configure before the first invoice.

People adopt it to get paid sooner. They might reject it if their clients insist on paying by bank transfer, which is why [[ASM-clients-pay-online]] is tracked.

## Business model

The customer, the buyer and the user are the same person: the owner of a one-person business or a small agency ([[DEC-core-job]]). Revenue is a subscription per workspace on two plans, a Free plan with a monthly invoice limit and a flat-priced Team plan ([[DEC-two-plans]]). Acquisition is search, referrals and the footer of every invoice email. The cost drivers are payment-provider fees (passed to the client or absorbed, a setting) and email delivery.

## Boundaries

In scope: creating, sending and collecting on invoices; clients; workspaces and their members.

Out of scope: bookkeeping, payroll, expenses, tax filing. Deferred: recurring invoices, payment reminders, multiple currencies in one workspace.

Depends on: a payment provider ([[EXT-payment-provider]]) and an email delivery provider ([[EXT-email-delivery]]). Markets: the EU only for now, with data held in the EU ([[DEC-eu-data-residency]]). Constraints: EU VAT invoice content and numbering rules ([[OBL-tax-and-invoicing]]); card data never touches our systems ([[OBL-payment-card-security]]).

## Success

North star: the median invoice is paid within 14 days of sending ([[MET-days-to-paid]]). Activation: a new workspace sends its first invoice within seven days ([[MET-activation-rate]]). Guardrail: an invoice is never sent to the wrong client ([[RISK-wrong-recipient]]).

## Direction

Now: send and collect ([[RLS-first-release]]). Next: payment reminders and recurring invoices. Later: a second currency. Change direction if fewer than a third of paid invoices are paid online, since the product's promise depends on it ([[ASM-clients-pay-online]]).
