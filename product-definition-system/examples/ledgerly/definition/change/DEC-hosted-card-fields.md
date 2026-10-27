---
id: DEC-hosted-card-fields
title: Card details are entered on the payment provider's page
summary: Clients enter card details on a page hosted by the payment provider, so card data never reaches Ledgerly.
anchor: CAP-collect-payments
maturity: specified
status: accepted
date: 2026-09-30
deciders: [Sam Ortiz, Dana Whitfield]
rel:
  concerns: [OBL-payment-card-security]
---

## Context

Handling card numbers would put Ledgerly in the heaviest tier of card-industry security requirements, for a team of four.

## Options considered

1. Collect cards in our own form and forward them: full scope, high cost.
2. Embedded fields served by the provider: reduced scope, with the provider's script on our page.
3. Redirect to the provider's hosted page: smallest scope, less control over the look.

## Decision

Option 3 at launch, with a path to option 2 once branding of the pay page matters more than scope.

## Consequences

The pay page links out for the card step and returns the client to Ledgerly afterwards. We receive payment outcomes from the provider and never a card number, expiry or security code.
