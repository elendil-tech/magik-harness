---
id: UC-invoice-a-client
title: Invoice a client for finished work
summary: An owner finishes work and gets a correct invoice to the client with a way to pay it.
anchor: CAP-invoicing
maturity: specified
goal: Get an invoice to the client that they can read and pay
primary_actor: ACT-account-owner
supporting_actors: [ACT-client]
trigger: The owner has finished work for a client
preconditions: [The client is on file or can be added, The workspace is under its monthly invoice limit]
success: The client has the invoice by email with a working pay link, the invoice is numbered and marked sent, and the owner can see that it was sent.
failure: The invoice stays a draft with no number consumed, or is sent but undelivered with a visible warning, and the owner knows which.
rel:
  audience: [ACT-account-owner]
---
