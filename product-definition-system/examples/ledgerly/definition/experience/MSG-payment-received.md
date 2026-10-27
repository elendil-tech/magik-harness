---
id: MSG-payment-received
title: Payment received email
summary: Tells the owner that a client paid an invoice, so they never have to check.
anchor: FEAT-pay-invoice-online
maturity: specified
channel: email
class: transactional
trigger_event: EVT-payment-received
audience: ACT-account-owner
user_controllable: true
rel:
  on_surface: [SRF-email]
---

## Purpose and content

One line saying who paid, how much and for which invoice, and whether the invoice is now fully paid or has a balance left. A link opens the invoice in the app.

## Delivery rules

Sent within a minute of the payment being confirmed. Owners can turn it off per workspace in settings; it is on by default. Not sent for payments the owner recorded by hand.
