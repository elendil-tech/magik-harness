---
id: TST-plan-change-timing
title: A plan change affects sending only when it should
summary: Cancelling or downgrading leaves the current paid period untouched and applies the Free limit from the next month.
anchor: FEAT-send-invoice
maturity: specified
kind: scenario
level: integration
automation: planned
rel:
  verifies: [RULE-plan-change-timing]
---

```gherkin
Feature: Plan changes and the monthly limit

  Scenario: A cancelled plan still sends until the paid period ends
    Given a Team workspace that cancelled with a paid period ending on 31 March
    When it sends its twelfth invoice of March on 20 March
    Then the invoice is sent

  Scenario: The Free limit starts the month after the paid period
    Given a workspace whose paid period ended on 31 March and that has sent nothing in April
    When it sends six invoices in April
    Then the first five are sent
    And the sixth is blocked with an upgrade prompt
```
