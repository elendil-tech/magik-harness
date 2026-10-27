---
id: TST-workspace-isolation
title: One workspace cannot read another's data
summary: A request for another workspace's invoice, client or payment returns nothing, exactly as if it did not exist.
anchor: CAP-invoicing
maturity: specified
kind: security
level: integration
automation: planned
rel:
  verifies: [REQ-workspace-data-isolation]
---

```gherkin
Feature: Workspace isolation

  Scenario: A member cannot read another workspace's invoice
    Given two workspaces that each hold an invoice
    When a member of the first requests the second workspace's invoice by its id
    Then nothing of that invoice is returned
    And the response is the same as for an invoice that does not exist

  Scenario: A person in two workspaces sees only the one they are working in
    Given a person who belongs to two workspaces
    When they list clients while working in the first
    Then only the first workspace's clients are shown
```
