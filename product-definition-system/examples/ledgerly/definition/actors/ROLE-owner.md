---
id: ROLE-owner
title: Owner
summary: Full control of a workspace, from invoices and clients to members, plan and settings.
anchor: PROD-ledgerly
maturity: specified
scope: workspace
min_holders: 1
rel:
  grants: [PERM-send-invoice, PERM-manage-billing, PERM-manage-members, PERM-manage-settings]
---

## Purpose

The role of the person accountable for the business the workspace represents. Owners decide what is sent and who may see it.

## Assignment rules

Given to the person who creates the workspace. An Owner can make another member an Owner. A workspace always has at least one Owner: the last one cannot be removed, demoted or leave.
