---
id: SRF-pay-page
title: Invoice pay page
summary: A single public page per invoice, reached by private link, where a client reads and pays.
anchor: PROD-ledgerly
maturity: specified
kind: web_app
audience: Clients who received an invoice
auth: none
---

## Purpose

Lets a client read an invoice and pay it with no account. It shows one invoice and nothing else, and carries the owner's name and branding rather than Ledgerly's.

## Navigation model

One page with no navigation. The card step leaves the page for the payment provider and returns to it, so the page must handle being re-entered in any payment state.
