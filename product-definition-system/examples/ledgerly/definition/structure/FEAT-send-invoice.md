---
id: FEAT-send-invoice
title: Send an invoice
summary: Finish a draft, check who it goes to and what it totals, and send it with a private pay link.
anchor: CAP-invoicing
maturity: specified
approval: {state: approved, by: Dana Whitfield, at: 2026-10-27, hash: sha256:35ff7b4c9728971f}
kind: user_facing
tier: 1
owner: Dana Whitfield
reviewed: 2026-10-27
facets: {async: true, user_content: true, public: false}
rel:
  audience: [ACT-account-owner]
  requires: [PERM-send-invoice]
  governed_by: [RULE-invoice-total, RULE-invoice-number-sequence, RULE-plan-change-timing]
  gated_by: [ENTL-monthly-invoices]
  depends_on: [INT-email-sending]
  emits: [EVT-invoice-sent]
  measured_by: [MET-activation-rate, MET-delivery-rate]
probes:
  failure-paths: {addressed: [FLW-send-invoice]}
  first-use: {addressed: [SCR-invoice-review]}
  concurrency: {addressed: [RULE-invoice-number-sequence, FLW-send-invoice]}
  deletion: {addressed: [STM-invoice-lifecycle]}
  audit: {deferred: "The first release keeps an invoice's state and dates but no log of who did what.", until: QST-audit-log}
  limits: {addressed: [ENTL-monthly-invoices]}
  lists: {na: "Sending acts on one invoice from its own review screen; finding and filtering invoices is a separate feature."}
  import-export: {na: "Sending has no data of its own to bring in or take out; exporting invoices belongs with the invoice list."}
  accessibility: {addressed: [SCR-invoice-review, OBL-accessibility]}
  localisation: {deferred: "The first release is English only; amounts and dates follow the workspace's country format.", until: 2027-06-30}
  performance: {addressed: [REQ-email-handoff-time]}
  observability: {addressed: [MET-delivery-rate]}
  rollout: {addressed: [RLS-first-release]}
  analytics: {addressed: [MET-activation-rate]}
  abuse: {addressed: [RISK-invoice-abuse]}
  personal-data: {deferred: "How owners answer a client's request to see, correct or erase their data is not decided.", until: QST-client-data-requests}
  tenant-isolation: {addressed: [REQ-workspace-data-isolation, TST-workspace-isolation]}
  tenant-states: {addressed: [RULE-plan-change-timing]}
  session-and-revocation: {addressed: [REQ-send-checks-permission]}
  plan-gating: {addressed: [ENTL-monthly-invoices]}
  billing-impact: {addressed: [RULE-invoice-total, TST-invoice-total]}
  usage-metering: {addressed: [ENTL-monthly-invoices, EVT-invoice-sent]}
  dependency-failure: {addressed: [FLW-send-invoice]}
  event-delivery: {addressed: [EVT-invoice-sent]}
  messaging-preferences: {addressed: [MSG-invoice-email]}
---

## Purpose and value

An owner who has finished a draft sends it to the client in one confirmed action. The product's first value moment ([[OBJ-first-value]]) is this action succeeding for a real invoice.

Out of scope here: creating the draft itself ([[FEAT-draft-invoice]]), taking payment ([[FEAT-pay-invoice-online]]), reminders, and sending on a schedule.

## Entry conditions

Reached from a draft invoice. The invoice must have a client with an email address and at least one line. The owner must hold [[PERM-send-invoice]]. If the workspace is at its monthly limit ([[ENTL-monthly-invoices]]) the action is replaced by an upgrade prompt ([[FEAT-upgrade-plan]]). The first thing the owner sees is the review screen ([[SCR-invoice-review]]).

## Behaviour notes

The invoice number is assigned at the moment of sending and no earlier ([[DEC-sequential-invoice-numbers]]), in the same transaction that marks the invoice sent and queues its email ([[FLW-send-invoice]]). Pressing Send twice, or two members sending at once, must not send two emails or consume two numbers. Delivery happens afterwards in the background: if the provider rejects the message or the address bounces, the invoice stays sent with its number and the owner is told it was not delivered. The owner can then correct the address and send it again; that keeps the number and does not count against the limit a second time. If the owner closes the browser after confirming, sending still completes.

## Release and maintenance

Behind the `send-invoice` flag during the closed beta, on for all workspaces at launch. Monitored by the sent-to-delivered ratio and by sends rejected for number conflicts, which must stay at zero. Switching the flag off hides Send but leaves existing invoices and links working. Retiring the feature would require a plan for invoices already in the sent state.
