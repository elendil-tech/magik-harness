---
id: ROLE-invoice-recipient
title: Invoice recipient
summary: Whoever holds the private link to one invoice; they may read it and pay it, nothing else.
anchor: PROD-ledgerly
maturity: specified
scope: resource
assignable_by: ROLE-owner
rel:
  grants: [PERM-pay-invoice]
---

## Purpose

Lets a client pay without an account. The role exists on one invoice only, never on a workspace.

## Assignment rules

Assigned by an Owner sending the invoice, which creates the link. Revoked when the invoice is paid in full or voided, or by an Owner re-sending it, which replaces the link.
