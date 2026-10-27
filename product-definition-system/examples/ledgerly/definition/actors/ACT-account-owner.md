---
id: ACT-account-owner
title: Account owner
summary: The freelancer or agency owner who creates the workspace, sends invoices and pays for the plan.
anchor: PROD-ledgerly
maturity: specified
kind: human
authn: Email and password, or a sign-in link sent by email
goals: [Get paid sooner, Send an invoice in minutes, Know at a glance what is owed]
rel:
  holds: [ROLE-owner]
---

## Who they are

The self-employed person or agency owner who signs up, creates the workspace and is its first and, for freelancers, only member. Buyer and user are the same person ([[DEC-core-job]]).

## Access and lifecycle

Created at sign-up with a new workspace. Becomes the Owner of it. Another member can be promoted to Owner; the last Owner cannot be removed or demoted. Closing the account is done by an Owner and is covered with the workspace lifecycle. Sessions end on sign-out and when the password changes.

## Exceptions and security

With an expired or revoked session an owner can see nothing and is sent to sign-in; the invoice pay page keeps working for their clients. An owner cannot impersonate a client. Support staff never act as an owner.
