---
id: JRN-first-invoice
title: From finished work to a paid invoice
summary: Mara finishes a project, sends the invoice and watches the client pay it within days.
anchor: DOM-invoicing
maturity: specified
reviewed: 2026-10-27
approval: {state: approved, by: Dana Whitfield, at: 2026-10-27, hash: sha256:2112946ed700e53b}
persona: PERS-solo-designer
outcome: The first invoice is sent in minutes and paid in days, with no chasing.
---

## Narrative

Mara finishes a logo project on a Thursday. Instead of copying last month's document she opens the workspace, adds the client and the two line items, reviews the total and sends it. The client gets an email with a pay link, opens it on their phone and pays by card the same afternoon. Mara sees the invoice turn paid and has not written a single reminder.

## Pain points and opportunities

The send step is where Mara hesitates: she needs to trust the total and the recipient before she confirms, so the review screen has to make both unmissable. The client's side is where the product earns its promise; a payment page that looks unfamiliar or asks for an account would lose the sale. Opportunity: tell Mara the moment the client opens the email, so she knows it arrived.

```pds-journey
stages:
  - id: finish
    name: Finishes the work
    goal: Get ready to invoice
    actions: [Opens the workspace, Adds the client and the line items]
    touchpoints: [SRF-web-app]
    feeling: 3
    pain: Rebuilding the same invoice by hand every month
    opportunity: Start from the previous invoice for the same client
  - id: send
    name: Sends the invoice
    goal: Be sure it is right, then send it
    flows: [FLW-send-invoice]
    touchpoints: [SCR-invoice-review, MSG-invoice-email]
    feeling: 4
    pain: Fear of sending the wrong total or to the wrong person
    opportunity: A review screen that shows both plainly
  - id: client-pays
    name: The client pays
    goal: Be paid without chasing
    flows: [FLW-pay-invoice]
    touchpoints: [SCR-pay-page, MSG-payment-received]
    feeling: 5
    pain: Not knowing whether the client opened the email
    opportunity: Say when the invoice was opened
```
