---
id: INT-email-sending
title: Email sending
summary: Hands outgoing email to the delivery provider and receives bounce and rejection reports.
anchor: CAP-invoicing
maturity: specified
direction: outbound
protocol: HTTPS API for sending; a webhook for delivery reports
auth: An API key for sending; a signature on every report
rel:
  integrates_with: [EXT-email-delivery]
---

## What flows

Out: the recipient, subject, body and the invoice PDF. In: accepted, delivered, bounced or rejected, per message.

## Failure handling

Sending is queued and retried with backoff for temporary errors. A permanent failure or a bounce marks the invoice as undelivered and tells the owner; the invoice keeps its number and can be sent again ([[FLW-send-invoice]]).

## Contract and limits

The provider limits message size, so the PDF is kept small and the pay link is always in the body. Delivery reports can arrive up to a day after sending.
