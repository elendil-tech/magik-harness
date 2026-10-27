---
id: ENT-payment
title: Payment
summary: One confirmed charge against an invoice, as reported by the payment provider.
anchor: CAP-collect-payments
maturity: specified
classification: confidential
pii: false
monetary: true
tenant_scoped: true
system_of_record: shared
retention: Seven years, with the invoice it belongs to
has_lifecycle: false
---

## Meaning

A record that the provider charged a client's card for an amount against one invoice. We keep the amount and the provider's reference. The payer's identity and card stay with the provider.

## Ownership and lifecycle

Created only when the provider confirms a charge ([[REQ-payment-confirmation]]); never edited. The provider is the system of record for the charge itself and Ledgerly for its effect on the invoice, which is why ownership is shared ([[EXT-payment-provider]]).

```pds-attributes
attributes:
  - {name: id, type: id, required: true, unique: true}
  - {name: invoice_id, type: id, required: true}
  - {name: amount, type: money, required: true}
  - {name: currency, type: text, required: true}
  - {name: provider_reference, type: text, required: true, unique: true, note: The provider's identifier for the charge}
  - {name: confirmed_at, type: datetime, required: true}
associations:
  - {to: ENT-invoice, kind: many_to_one, label: pays}
```
