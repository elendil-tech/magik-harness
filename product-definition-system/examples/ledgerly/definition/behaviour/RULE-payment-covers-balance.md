---
id: RULE-payment-covers-balance
title: A payment is positive and no more than the balance
summary: A client may pay the full balance or part of it, never nothing and never more than is owed.
anchor: CAP-collect-payments
maturity: specified
kind: validation
statement: A payment amount must be greater than zero and no more than the invoice's outstanding balance when the payment is started.
examples:
  - case: positive
    given: A balance of 308.55 and a payment of 308.55
    then: The payment is accepted and the invoice becomes paid
  - case: positive
    given: A balance of 308.55 and a payment of 100.00
    then: The payment is accepted, the balance becomes 208.55 and the invoice stays sent
  - case: edge
    given: A balance of 0.01 and a payment of 0.01
    then: The payment is accepted, as the smallest payable amount
  - case: negative
    given: A balance of 308.55 and a payment of 400.00
    then: The payment is refused before the client leaves for the provider, and the allowed range is shown
---

Checked on the pay page and again on the server before the provider is called. Two payments confirmed against the same balance at once are an open question ([[QST-overpayment]]).
