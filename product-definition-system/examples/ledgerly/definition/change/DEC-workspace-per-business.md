---
id: DEC-workspace-per-business
title: One workspace per business, people can join several
summary: The tenant is a workspace for one business; a person has one sign-in and may belong to many workspaces.
anchor: PROD-ledgerly
maturity: specified
status: accepted
date: 2026-09-09
deciders: [Dana Whitfield, Sam Ortiz]
rel:
  concerns: [TEN-tenancy, DOM-workspaces-and-teams]
---

## Context

A freelancer may also help run a small agency, and invoices must never mix the two businesses' numbering, clients or branding.

## Options considered

1. One account per person with everything inside it: simplest, but mixes businesses.
2. One account per company with its own people: clean isolation, but a person needs several logins.
3. Workspaces per business with a single person identity across them.

## Decision

Option 3: the tenant is a workspace that stands for one business, and a person signs in once and may belong to any number of workspaces.

## Consequences

Invoice numbering, clients and plans are per workspace. Switching workspace is a first-class action. Billing is per workspace, so a person in two workspaces may pay for neither, one or both.
