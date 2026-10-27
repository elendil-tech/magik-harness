---
id: FEAT-draft-invoice
title: Draft an invoice
summary: Create and edit an invoice for a client, with lines, tax and a due date, until it is ready to send.
anchor: CAP-invoicing
maturity: outlined
kind: user_facing
tier: 1
rel:
  audience: [ACT-account-owner, ACT-member]
  accesses: [{to: ENT-invoice, ops: [create, read, update, delete]}, {to: ENT-client, ops: [create, read, update]}]
---

## Purpose and value

Where an invoice is made: pick or add a client, add lines, set tax and a due date, save as often as needed. A draft has no number and can be changed or deleted freely. Sending it is a separate, deliberate step ([[FEAT-send-invoice]]).

<!-- Outline only. The editor screen, its flow, validation rules and tests are the next things to write. -->
