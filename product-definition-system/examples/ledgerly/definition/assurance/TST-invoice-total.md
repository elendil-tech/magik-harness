---
id: TST-invoice-total
title: Invoice totals are calculated and rounded as specified
summary: Line amounts, per-line tax and the total match the worked examples to the cent.
anchor: CAP-invoicing
maturity: specified
kind: scenario
level: unit
automation: planned
rel:
  verifies: [RULE-invoice-total]
---

```gherkin
Feature: Invoice totals

  Scenario: A line with tax is calculated
    Given a line of 3 hours at 85.00 with 21% tax
    When the invoice total is calculated
    Then the line amount is 255.00
    And the tax is 53.55
    And the total is 308.55

  Scenario: Rounding is half up at the cent
    Given a line of 0.333 hours at 85.00 with 21% tax
    When the invoice total is calculated
    Then the line amount is 28.31
    And the tax is 5.95
    And the total is 34.26

  Scenario: A negative quantity is refused
    Given a line with a quantity of -1
    When the owner marks the invoice ready
    Then the invoice cannot be saved as ready
```
