---
id: TST-invoice-numbering
title: Invoice numbers stay unique and unbroken
summary: Concurrent sends, deleted drafts and voided invoices never repeat or skip a number.
anchor: CAP-invoicing
maturity: specified
kind: scenario
level: integration
automation: planned
rel:
  verifies: [RULE-invoice-number-sequence, REQ-invoice-number-legal, OBL-tax-and-invoicing]
---

```gherkin
Feature: Invoice numbers

  Scenario: Numbers are consecutive under concurrent sending
    Given a workspace that has sent three invoices
    When two members send an invoice at the same moment
    Then one invoice is numbered INV-0004 and the other INV-0005
    And no number is repeated or skipped

  Scenario: A deleted draft consumes no number
    Given a workspace that has sent three invoices and holds an unsent draft
    When the draft is deleted and a new invoice is sent
    Then the new invoice is numbered INV-0004

  Scenario: A voided invoice keeps its number
    Given invoice INV-0004 has been voided
    When another invoice is sent
    Then it is numbered INV-0005

  Scenario: A number cannot be typed in
    Given a draft invoice
    When the owner tries to set its number by hand
    Then the number stays read-only and the attempt is refused
```
