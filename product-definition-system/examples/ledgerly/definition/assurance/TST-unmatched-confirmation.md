---
id: TST-unmatched-confirmation
title: A confirmation for an unknown invoice raises an alert
summary: A signed confirmation that matches no payable invoice is not applied and reaches the person on call.
anchor: FEAT-pay-invoice-online
maturity: specified
kind: scenario
level: integration
automation: planned
rel:
  verifies: [REQ-unmatched-confirmation-alert]
---

```gherkin
Feature: Unmatched confirmations

  Scenario: A confirmation for an invoice that does not exist
    Given a correctly signed confirmation that names an unknown invoice
    When the confirmation arrives
    Then no payment is recorded
    And an alert reaches the person on call within 5 minutes

  Scenario: A confirmation for an invoice that is already paid in full
    Given a correctly signed confirmation for an invoice with a balance of zero
    When the confirmation arrives
    Then no second payment is recorded
    And an alert reaches the person on call within 5 minutes
```
