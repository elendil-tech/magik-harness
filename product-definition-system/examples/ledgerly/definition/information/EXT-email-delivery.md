---
id: EXT-email-delivery
title: Email delivery provider
summary: The external service that sends our transactional email and reports bounces.
anchor: PROD-ledgerly
maturity: specified
kind: email
criticality: important
data_shared: The recipient's name and email address, and the invoice PDF and pay link in the message
exit_plan: Sending sits behind our own adapter, so another provider can replace it; invoices stay visible in the app while email is down
---

## Purpose

Delivers the invoice email and the payment notice, and tells us about bounces and rejections so owners know when an invoice did not arrive ([[MSG-invoice-email]]).

## Risks and constraints

Deliverability depends on the provider's reputation and our domain setup. Bounce notifications arrive later than sending. EU processing is required ([[DEC-eu-data-residency]]).
