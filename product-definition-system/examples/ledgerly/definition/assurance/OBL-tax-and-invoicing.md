---
id: OBL-tax-and-invoicing
title: Tax and invoicing rules
summary: An invoice must carry the content and the unbroken numbering that EU VAT rules require.
anchor: PROD-ledgerly
maturity: specified
reviewed: 2026-10-27
approval: {state: approved, by: Dana Whitfield, at: 2026-10-27, hash: sha256:13c7863ca4632668}
source: law
reference: Council Directive 2006/112/EC, article 226, and the invoicing rules of the seller's member state
applies_when: A workspace in the EU sends an invoice for services
evidence: A sample invoice per country reviewed by an accountant before launch, and the invoice numbering test
---

## Interpretation

An invoice needs its issue date, a unique sequential number, the seller's and the client's names and addresses, the seller's VAT number, a description of the service and its date, the amount before tax, the tax rate and the tax amount. Several member states also require the sequence to have no gaps. For Ledgerly this means one unbroken numbered series per workspace that is never reused ([[REQ-invoice-number-legal]]), tax calculated per line ([[RULE-invoice-total]]) and the client's address captured before sending ([[ENT-client]]). The interpretation has to be confirmed by an accountant for each launch country; it is an exit criterion of [[RLS-first-release]].
