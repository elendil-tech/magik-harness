---
id: RULE-invoice-total
title: How an invoice total is calculated
summary: Each line is rounded, tax is computed and rounded per line, and the total is the sum of the rounded amounts.
anchor: CAP-invoicing
maturity: specified
kind: calculation
statement: A line amount is its quantity times its unit price rounded half up to the cent; line tax is the line amount times the line's tax rate rounded half up to the cent; the invoice total is the sum of all line amounts and all line tax amounts. Quantities have at most three decimals and unit prices at most two.
examples:
  - case: positive
    given: Three hours at 85.00 with 21% tax
    then: The line amount is 255.00, the tax 53.55 and the total 308.55
  - case: edge
    given: A quantity of 0.333 hours at 85.00 with 21% tax
    then: The line amount is 28.31 (28.305 rounded half up), the tax 5.95 (5.9451 rounded) and the total 34.26
  - case: negative
    given: A line with a negative quantity
    then: The invoice cannot be saved as ready; credits are made with a credit note, which is not yet supported
rel:
  satisfies: [OBL-tax-and-invoicing]
---

Totals are computed on the server from the lines and shown, never typed in. A client sees the same figures the owner confirmed on the review screen ([[SCR-invoice-review]]).
