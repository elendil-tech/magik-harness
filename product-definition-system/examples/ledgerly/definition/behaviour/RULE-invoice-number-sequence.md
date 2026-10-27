---
id: RULE-invoice-number-sequence
title: How an invoice number is formed
summary: INV- and a four-digit counter per workspace, taken at the moment of sending and never reused.
anchor: CAP-invoicing
maturity: specified
kind: uniqueness
statement: An invoice number is INV- followed by a four-digit counter that starts at 0001 and goes up by one for each invoice sent by the workspace; it is taken at the moment of sending and is never reused, not even after the invoice is voided.
examples:
  - case: positive
    given: A workspace that has sent three invoices sends a fourth
    then: The fourth is numbered INV-0004
  - case: edge
    given: A draft is deleted before it was ever sent
    then: No number was consumed, and the next invoice sent takes the next number with no gap
  - case: edge
    given: Two members send invoices at the same moment
    then: They receive two different consecutive numbers, never the same one
  - case: negative
    given: An owner tries to type an invoice number by hand
    then: The number is read-only and the attempt is refused
---

A workspace that imports history sets the starting counter once, before its first send ([[DEC-sequential-invoice-numbers]]).
