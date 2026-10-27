---
id: TST-pay-provider-down
title: The pay page falls back when the provider is down
summary: With the provider unreachable the client sees the owner's bank details and a clear notice.
anchor: FEAT-pay-invoice-online
maturity: specified
kind: scenario
level: integration
automation: planned
rel:
  verifies: [REQ-payment-provider-fallback]
---

```gherkin
Feature: Payment provider outage

  Scenario: The pay page shows the bank details
    Given the payment provider is unreachable
    When a client opens the pay page of a sent invoice
    Then the page shows the owner's bank details
    And says that paying online is unavailable
```
