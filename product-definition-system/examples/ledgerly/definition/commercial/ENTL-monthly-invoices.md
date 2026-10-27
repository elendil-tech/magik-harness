---
id: ENTL-monthly-invoices
title: Invoices sent per month
summary: How many invoices a workspace may send in a calendar month.
anchor: PROD-ledgerly
maturity: specified
kind: limit
unit: invoices per month
default: 5
enforcement: hard
on_limit: Sending is blocked with a message naming the limit and the way to upgrade; drafts can still be saved.
---

## Meaning

Counts invoices that reach the sent state in the calendar month of the workspace's billing date. Drafts, voided invoices and re-sends do not count. The count resets at the start of each calendar month, UTC.
