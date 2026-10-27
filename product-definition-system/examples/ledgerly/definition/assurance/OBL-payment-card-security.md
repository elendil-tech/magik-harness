---
id: OBL-payment-card-security
title: Payment card security
summary: Card data must be protected; Ledgerly meets the duty by never handling it.
anchor: PROD-ledgerly
maturity: specified
source: standard
reference: PCI DSS, self-assessment questionnaire A for merchants that fully outsource card data
applies_when: The product accepts card payments through a provider
evidence: The provider's current attestation of compliance on file, the yearly self-assessment, and the card data scope check
---

## Interpretation

The standard governs anyone who stores, processes or transmits card data. Ledgerly sends the client to the provider's hosted checkout, so card numbers, expiry dates and security codes never reach its pages, servers or logs ([[DEC-hosted-card-fields]]). That keeps the duty to the lightest self-assessment, provided it stays true: no custom card form, no card data in logs or error reports and no second provider added without the same design ([[REQ-card-data-never-stored]]).
