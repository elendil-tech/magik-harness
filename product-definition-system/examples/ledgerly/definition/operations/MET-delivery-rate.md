---
id: MET-delivery-rate
title: Delivery rate
summary: The share of sent invoices whose email the provider reports as delivered.
anchor: FEAT-send-invoice
maturity: specified
kind: health
definition: The number of invoices whose email the provider reports as delivered, divided by the number of invoices sent that day, counted 24 hours after sending when most delivery reports have arrived.
unit: percent
grain: Day of sending
direction: up
target: 98% or more, with an alert below 95% for a day
owner: Dana Whitfield
rel:
  sourced_from: [EVT-invoice-sent, ENT-invoice]
---

## Interpretation

A drop usually comes from bad addresses at one large sender or from a provider problem, so look at the bounce reasons before suspecting the product. A bounce is not a failure of Ledgerly, but an owner who is not told about one loses a payment, which is why every undelivered invoice is shown to the owner ([[FLW-send-invoice]]).
