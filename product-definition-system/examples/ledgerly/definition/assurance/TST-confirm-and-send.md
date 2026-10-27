---
id: TST-confirm-and-send
title: Confirming sends the invoice exactly once
summary: The owner sees who the invoice goes to, confirms, and exactly one numbered email is queued.
anchor: FEAT-send-invoice
maturity: specified
kind: scenario
level: e2e
automation: planned
rel:
  verifies: [FEAT-send-invoice, REQ-confirm-recipient, REQ-send-checks-permission, FLW-send-invoice, SCR-invoice-review]
---

```gherkin
Feature: Send an invoice

  Scenario: The review screen shows who the invoice goes to
    Given a draft invoice for a client with an email address and one line
    When the owner opens the review screen
    Then the client's name, email address and the invoice total are shown

  Scenario: Confirming sends the invoice
    Given a draft invoice on the review screen and a workspace under its monthly limit
    When the owner confirms
    Then the invoice is numbered and marked sent
    And exactly one email is queued for the client

  Scenario: Pressing Send twice does not send twice
    Given a draft invoice on the review screen
    When the owner presses Send twice in quick succession
    Then one number is taken and one email is queued

  Scenario: A workspace at its limit cannot send
    Given a workspace that has reached its monthly invoice limit
    When the owner opens the review screen of a draft
    Then Send is replaced by the limit message and an upgrade prompt
    And the draft is kept unchanged

  Scenario: Permission is checked at the moment of sending
    Given an owner who opened the review screen and was then removed from the workspace
    When they confirm sending
    Then nothing is sent
    And they are told they no longer have permission
```
