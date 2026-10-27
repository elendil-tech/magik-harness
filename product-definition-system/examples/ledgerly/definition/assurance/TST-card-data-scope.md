---
id: TST-card-data-scope
title: No card data reaches Ledgerly
summary: A recorded test payment shows no card number, expiry or security code in any request, log or database write.
anchor: CAP-collect-payments
maturity: specified
kind: security
level: manual
automation: manual
rel:
  verifies: [REQ-card-data-never-stored, OBL-payment-card-security]
---

```gherkin
Feature: Card data scope

  Scenario: A test payment leaves no card data behind
    Given the pay page and the provider's hosted checkout
    When a test payment is made while every request, log line and database write is recorded
    Then no card number, expiry date or security code appears in any of them
```
