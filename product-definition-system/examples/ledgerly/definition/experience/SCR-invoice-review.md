---
id: SCR-invoice-review
title: Invoice review
summary: The last screen before sending. It shows who it goes to, what it totals, when it is due and one Send button.
anchor: FEAT-send-invoice
maturity: specified
kind: page
route: /invoices/:id/review
data_bound: true
states: [loading, ready, empty, error, over-limit]
rel:
  on_surface: [SRF-web-app]
  requires: [PERM-send-invoice]
---

## Purpose

Lets the owner be certain before committing a numbered legal document. It repeats the recipient's name and email, every line, the tax, the total and the due date in the same layout the client will see.

## Content and states

Loading: the invoice skeleton. Ready: the invoice as the client will see it, with the Send button and an Edit link back to the draft. Empty: the draft has no lines or no recipient, so Send is disabled and the missing parts are listed. Error: the invoice could not be loaded; a retry and a way back. Over-limit: the workspace is at its monthly limit, so Send is replaced by the limit message and an upgrade prompt ([[FEAT-upgrade-plan]]).

## Interactions

Send confirms and shows a short progress state; the button is disabled while sending so a double click cannot send twice. Edit returns to the draft without losing it. Closing the tab after confirming does not cancel sending.

## Accessibility

Fully usable by keyboard with a visible focus order ending on Send. The recipient and the total are announced by screen readers before the Send button. Totals do not rely on colour. Meets WCAG 2.2 AA ([[OBL-accessibility]]).
