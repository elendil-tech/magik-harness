---
id: OBL-payment-card-security
title: Payment card security
summary: Card data must be protected; Ledgerly meets the duty by never handling it.
anchor: PROD-ledgerly
maturity: specified
reviewed: 2026-10-27
approval: {state: approved, by: Dana Whitfield, at: 2026-10-27, hash: sha256:1def7f5c22d28c91}
source: standard
reference: PCI DSS, self-assessment questionnaire A for merchants that fully outsource card data
applies_when: The product accepts card payments through a provider
evidence: The provider's current attestation of compliance on file, the yearly self-assessment, and the card data scope check
---

## Interpretation

The standard governs anyone who stores, processes or transmits card data. Ledgerly sends the client to the provider's hosted checkout, so card numbers, expiry dates and security codes never reach its pages, servers or logs ([[DEC-hosted-card-fields]]). That keeps the duty to the lightest self-assessment, provided it stays true: no custom card form, no card data in logs or error reports and no second provider added without the same design ([[REQ-card-data-never-stored]]).
