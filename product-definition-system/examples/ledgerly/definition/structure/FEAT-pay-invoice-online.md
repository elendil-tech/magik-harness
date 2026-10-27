---
id: FEAT-pay-invoice-online
title: Pay an invoice online
summary: A client opens the private link, sees what is owed and pays by card; the invoice turns paid by itself.
anchor: CAP-collect-payments
maturity: specified
kind: user_facing
tier: 1
owner: Sam Ortiz
reviewed: 2026-10-22
facets: {async: true, public: true, user_content: false}
rel:
  audience: [ACT-client]
  requires: [PERM-pay-invoice]
  governed_by: [RULE-payment-covers-balance]
  depends_on: [INT-payment-provider-checkout]
  emits: [EVT-payment-received, EVT-invoice-paid]
  measured_by: [MET-days-to-paid]
probes:
  failure-paths: {addressed: [FLW-pay-invoice]}
  first-use: {addressed: [SCR-pay-page]}
  concurrency: {deferred: "Repeated confirmations are safe, but two payments started together can exceed the balance.", until: QST-overpayment}
  deletion: {na: "A payment is never deleted or edited once recorded and stays with its invoice for the retention period; refunds are out of scope."}
  audit: {addressed: [EVT-payment-received]}
  limits: {addressed: [RULE-payment-covers-balance]}
  lists: {na: "A client sees one invoice on one page; there is nothing to list, search or act on in bulk."}
  import-export: {na: "A client has no account and no data of their own to bring in or take out."}
  accessibility: {addressed: [SCR-pay-page, OBL-accessibility]}
  localisation: {deferred: "The first release is English only; amounts and dates follow the invoice's format.", until: 2027-06-30}
  performance: {addressed: [REQ-pay-page-load-time]}
  observability: {addressed: [REQ-unmatched-confirmation-alert]}
  rollout: {addressed: [RLS-first-release]}
  analytics: {addressed: [MET-days-to-paid]}
  abuse: {addressed: [REQ-pay-link-unguessable]}
  personal-data: {deferred: "How owners answer a client's request to see, correct or erase their data is not decided.", until: QST-client-data-requests}
  tenant-isolation: {addressed: [REQ-workspace-data-isolation, TST-workspace-isolation]}
  tenant-states: {addressed: [REQ-pay-link-outlives-plan]}
  plan-gating: {na: "Paying is available on every plan; a client is never gated by the owner's plan."}
  billing-impact: {deferred: "Refunds, chargebacks and disputes are not handled in the first release.", until: QST-refunds-and-disputes}
  usage-metering: {na: "Payments are not counted against any limit and Ledgerly charges no fee per payment."}
  dependency-failure: {addressed: [FLW-pay-invoice, REQ-payment-provider-fallback]}
  event-delivery: {addressed: [EVT-payment-received]}
  messaging-preferences: {addressed: [MSG-payment-received]}
---

## Purpose and value

Removes the step that makes invoices late: the client needing to find bank details and remember to transfer. One link, one payment, one receipt. Its worth depends on [[ASM-clients-pay-online]].

Out of scope: bank transfers, refunds, and clients managing an account.

## Entry conditions

Reached from the link in the invoice email ([[MSG-invoice-email]]). The invoice must be sent and not void; a paid invoice shows its receipt instead of payment options. No sign-in. The first thing the client sees is the invoice they are about to pay ([[SCR-pay-page]]).

## Behaviour notes

An invoice is marked paid only when the provider confirms the payment, never when the client returns to the page ([[REQ-payment-confirmation]]). A single payment may not exceed the balance ([[RULE-payment-covers-balance]]). Two payments started together can still add up to more than the balance, and what happens then is not decided ([[QST-overpayment]]). If the provider is unavailable the page says so and shows the owner's bank details instead ([[REQ-payment-provider-fallback]]). A client who abandons the card step can come back through the same link.

## Release and maintenance

Closed beta with five workspaces before launch, to validate [[ASM-clients-pay-online]]. Monitored by payment success rate and by confirmations that arrive without a matching invoice, which must page someone. Switching it off falls back to showing bank details only. Retiring it needs a plan for payments in flight.
