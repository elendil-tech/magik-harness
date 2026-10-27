---
id: TEN-tenancy
title: Tenancy model
summary: A workspace is the tenant; people can belong to several workspaces.
anchor: PROD-ledgerly
maturity: outlined
unit: Workspace, one per business a person invoices for
hierarchy: [workspace, member]
---

## Model

The tenant is the workspace. Everything a business creates (clients, invoices, payments, settings) belongs to exactly one workspace. A person has one sign-in and can be a member of several workspaces, for example a freelancer who also helps run a small agency ([[DEC-workspace-per-business]]).

Still to define: isolation approach, provisioning and offboarding, cross-tenant behaviour. This stays at outlined until the engineering design settles isolation.
