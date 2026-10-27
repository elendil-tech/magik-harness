---
id: TST-pay-page-load-time
title: The pay page shows the invoice within 2 seconds
summary: A production check that at least 95% of pay page views show the invoice within 2 seconds on a mobile connection.
anchor: FEAT-pay-invoice-online
maturity: specified
kind: performance
level: monitoring
automation: planned
rel:
  verifies: [REQ-pay-page-load-time]
---

```gherkin
Feature: Pay page speed

  Scenario: Almost every view shows the invoice within 2 seconds
    Given the pay page views recorded in production over any seven days
    When the time to show the invoice is measured for each view on a mobile connection
    Then at least 95% showed the invoice within 2 seconds
```
