---
id: TST-invoice-lifecycle
title: Invoices move through their states as designed
summary: Sending, paying, becoming overdue and voiding change an invoice's state only as the lifecycle allows.
anchor: CAP-invoicing
maturity: specified
kind: scenario
level: integration
automation: planned
rel:
  verifies: [STM-invoice-lifecycle]
---

```gherkin
Feature: Invoice lifecycle

  Scenario: A sent invoice becomes paid when its balance reaches zero
    Given a sent invoice with a balance of 308.55
    When a payment of 308.55 is confirmed
    Then the invoice is paid

  Scenario: An unpaid invoice becomes overdue after its due date
    Given a sent invoice whose due date was yesterday and whose balance is above zero
    When the daily overdue job runs
    Then the invoice is overdue

  Scenario: A paid invoice cannot be voided
    Given a paid invoice
    When the owner tries to void it
    Then the invoice stays paid
    And the owner is told why
```
