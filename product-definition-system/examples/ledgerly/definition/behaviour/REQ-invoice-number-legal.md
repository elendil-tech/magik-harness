---
id: REQ-invoice-number-legal
title: Invoice numbers are unique, unbroken and permanent
summary: Every sent invoice gets one number from an unbroken per-workspace sequence that is never reused or changed.
anchor: CAP-invoicing
maturity: specified
kind: constraint
statement: The system shall give every sent invoice a unique number from one unbroken sequence per workspace that is never reused or changed.
priority: must
verification: test
rel:
  derives_from: [DEC-sequential-invoice-numbers]
  satisfies: [OBL-tax-and-invoicing]
---
