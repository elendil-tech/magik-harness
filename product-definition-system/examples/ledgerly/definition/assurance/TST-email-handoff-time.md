---
id: TST-email-handoff-time
title: Invoice emails reach the provider within 30 seconds
summary: A production check that at least 99% of sent invoices are handed to the delivery provider within 30 seconds.
anchor: FEAT-send-invoice
maturity: specified
kind: performance
level: monitoring
automation: planned
rel:
  verifies: [REQ-email-handoff-time]
---

```gherkin
Feature: Invoice email hand-off

  Scenario: Almost every email is handed over within 30 seconds
    Given the invoices sent in production over any seven days
    When the time from sending to the provider's acceptance is measured for each
    Then at least 99% were handed over within 30 seconds
```
