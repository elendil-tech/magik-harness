---
id: DEC-private-pay-link
title: Clients pay through a private link, with no account
summary: Each sent invoice carries a secret link that lets whoever holds it pay that invoice and nothing else.
anchor: CAP-collect-payments
maturity: specified
status: accepted
date: 2026-09-16
deciders: [Dana Whitfield, Sam Ortiz]
rel:
  concerns: [ROLE-invoice-recipient, FEAT-pay-invoice-online, ASM-clients-pay-online]
  evidenced_by: [EVD-freelancer-interviews]
---

## Context

Seven of twelve freelancers said clients would pay sooner if paying were one click ([[EVD-freelancer-interviews]]). Anything that asks the client to create an account puts back the friction the product exists to remove.

## Options considered

1. A client account with sign-in: the clearest identity, but it is the extra step we are trying to remove.
2. A private link with a secret token in the address: no account, and the link itself is the credential.
3. Bank details only, with no link: the status quo, and no way to see that an invoice was paid.

## Decision

Option 2: each sent invoice has a private pay link whose secret token is the only credential, and whoever holds the link may pay that invoice and do nothing else.

## Consequences

Links must be unguessable ([[REQ-pay-link-unguessable]]) and must keep working for the life of the invoice ([[REQ-pay-link-outlives-plan]]). A forwarded link can be used by whoever receives it, which is acceptable because paying is the only thing it allows. Sending an invoice again replaces the link, and the old one then says it has been replaced.
