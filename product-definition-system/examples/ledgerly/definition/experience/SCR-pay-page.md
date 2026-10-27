---
id: SCR-pay-page
title: Pay page
summary: The single page a client sees from the email link. It shows the invoice, what is owed and how to pay.
anchor: FEAT-pay-invoice-online
maturity: specified
kind: page
route: /pay/:token
data_bound: true
states: [loading, ready, paid, void, empty, error]
rel:
  on_surface: [SRF-pay-page]
  requires: [PERM-pay-invoice]
---

## Purpose

Shows the invoice in full and offers the one action that matters: pay. It carries the owner's name and logo, because to the client this is the owner's invoice, not a Ledgerly product page.

## Content and states

Loading: the invoice skeleton. Ready: the invoice, the balance, the amount field defaulting to the full balance, and the Pay button. Paid: the receipt and no payment options. Void: a plain notice that the invoice was cancelled and who to contact. Empty: the link is unknown or has been replaced, so there is no invoice to show. Error: the page could not load or the provider is unreachable; a retry, and the owner's bank details as a fallback.

## Interactions

Pay validates the amount against the balance before leaving for the provider's page ([[RULE-payment-covers-balance]]). Returning from the provider shows the current state of the invoice, which may still be "processing" until the provider confirms.

## Accessibility

Usable by keyboard and screen reader on a phone and a desktop. The amount field has a visible label and an error message tied to it. Contrast meets WCAG 2.2 AA ([[OBL-accessibility]]).
