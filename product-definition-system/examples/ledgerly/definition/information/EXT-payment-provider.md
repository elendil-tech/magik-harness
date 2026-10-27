---
id: EXT-payment-provider
title: Payment provider
summary: The external service that takes card payments on a hosted page and tells us the outcome.
anchor: PROD-ledgerly
maturity: specified
kind: payments
criticality: critical
data_shared: The invoice reference, the amount and currency, and the payer's email when the client enters it; never card data
exit_plan: Payments sit behind our own adapter so another provider can replace it; while it is down, owners receive the pay page's bank-details fallback
status_page: https://status.payments-provider.example
---

## Purpose

Takes card payments so Ledgerly never handles card data ([[DEC-hosted-card-fields]]). Chosen for hosted checkout and EU data processing ([[DEC-eu-data-residency]]).

## Risks and constraints

An outage stops online payment, not invoicing ([[RISK-payment-provider-outage]]). Fees are charged per payment. Webhooks can arrive late, twice or out of order, so recording a payment must be idempotent. The provider is a subprocessor and must be listed as one.
