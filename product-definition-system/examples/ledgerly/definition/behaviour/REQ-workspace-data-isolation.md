---
id: REQ-workspace-data-isolation
title: A workspace's data never appears in another's
summary: A request made in one workspace never returns an invoice, client or payment that belongs to another.
anchor: DOM-workspaces-and-teams
maturity: specified
kind: constraint
statement: The system shall return no invoice, client or payment of one workspace in response to a request made in the context of another workspace.
priority: must
verification: test
rel:
  derives_from: [DEC-workspace-per-business]
---
