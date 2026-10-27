---
id: MSG-invoice-email
title: Invoice email
summary: The email that carries an invoice and its private pay link to the client.
anchor: FEAT-send-invoice
maturity: specified
channel: email
class: transactional
trigger_event: EVT-invoice-sent
audience: ACT-client
user_controllable: false
rel:
  on_surface: [SRF-email]
---

## Purpose and content

Subject names the sender and the amount. The body shows the invoice number, the total, the due date and one button, Pay now, that opens the pay page. The invoice is attached as a PDF. The footer says who sent it and offers a way to reply to the owner.

## Delivery rules

Sent from a Ledgerly address with the owner's name and reply-to. Handed to the provider within 30 seconds of sending ([[REQ-email-handoff-time]]). Not suppressible by the client, since it is a legal document; but unsubscribe applies to nothing else because no marketing is ever sent in it. A bounce or rejection is reported to the owner, not retried silently.
