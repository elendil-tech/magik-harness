---
id: TST-pay-online
title: A client pays an invoice from the email link
summary: Full and partial payments are recorded only on the provider's confirmation, and amounts above the balance are refused.
anchor: FEAT-pay-invoice-online
maturity: specified
kind: scenario
level: e2e
automation: planned
rel:
  verifies: [FEAT-pay-invoice-online, FLW-pay-invoice, REQ-payment-confirmation, REQ-pay-link-outlives-plan, RULE-payment-covers-balance, SCR-pay-page]
---

```gherkin
Feature: Pay an invoice online

  Scenario: A client pays the full balance
    Given a sent invoice with a balance of 308.55 and its private link
    When the client pays 308.55 and the provider confirms the charge
    Then a payment is recorded and the invoice is paid
    And the owner is notified

  Scenario: A client pays part of the balance
    Given a sent invoice with a balance of 308.55 and its private link
    When the client pays 100.00 and the provider confirms the charge
    Then the balance is 208.55 and the invoice stays sent

  Scenario: Returning from the provider is not proof of payment
    Given a client who has just returned from the provider's page
    When the provider has not yet confirmed the charge
    Then the invoice is not marked paid
    And the page says the payment is being processed

  Scenario: An amount above the balance is refused
    Given a sent invoice with a balance of 308.55 and its private link
    When the client enters 400.00 and chooses to pay
    Then the payment is refused before leaving for the provider
    And the allowed range is shown

  Scenario: The link keeps working after the owner cancels the plan
    Given a sent unpaid invoice whose owner has since cancelled the paid plan
    When the client opens the pay link
    Then the invoice and the option to pay are shown
```
