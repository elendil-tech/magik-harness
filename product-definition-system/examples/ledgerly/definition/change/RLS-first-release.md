---
id: RLS-first-release
title: First release
summary: The smallest release that lets an owner send an invoice and be paid online.
anchor: PROD-ledgerly
maturity: specified
stage: in_progress
target: Closed beta in January 2027, general launch in February 2027
rel:
  includes: [CAP-invoicing, CAP-collect-payments, FEAT-draft-invoice, FEAT-send-invoice, FEAT-pay-invoice-online, FLW-send-invoice, FLW-pay-invoice, PLAN-free, PLAN-team, ENTL-monthly-invoices]
---

## Scope intent

Draft, send and collect on invoices in one workspace, with the Free and Team plans. It proves the core promise: an invoice leaves in minutes and is paid from the email ([[OBJ-paid-faster]], [[OBJ-first-value]]). Left out on purpose: reminders, recurring invoices, credit notes, refunds and a second currency.

## Exit criteria

Closed beta ends when twenty real workspaces have sent at least one invoice, no invoice has been sent to the wrong client and no number has been skipped or repeated. General launch needs the accountant's confirmation for each launch country ([[OBL-tax-and-invoicing]]), the provider's compliance attestation on file ([[OBL-payment-card-security]]) and activation of at least 40% in the beta cohorts ([[MET-activation-rate]]).

## Rollout and risks

Behind a flag per workspace for the beta, then on for everyone. The main risks are a misdirected invoice ([[RISK-wrong-recipient]]) and a provider outage ([[RISK-payment-provider-outage]]). Rolling back means turning off Send and the pay link; invoices already sent keep working.
