---
id: REQ-pay-link-unguessable
title: Pay links cannot be guessed
summary: The secret in each pay link is long and random enough that no one can find another client's invoice.
anchor: FEAT-pay-invoice-online
maturity: specified
kind: constraint
statement: The system shall generate each pay link token from at least 128 bits of randomness.
priority: must
verification: inspection
verification_note: Review of the token generator against the team's secure randomness rules, and a unit test that tokens have the required length, repeated at every change to the generator.
rel:
  derives_from: [DEC-private-pay-link]
---
