# Ledgerly: a worked example

A small, invented SaaS product defined with `pds`: invoicing for freelancers and small agencies. It exists to show what a definition looks like when it is partly done and honest about it, not to be a model product.

**Everything here is fiction.** Ledgerly, its people (Dana Whitfield, Sam Ortiz), the interviews, the prices, the dates and the figures are invented. The tax and card-security notes are plausible summaries, not legal or compliance advice.

**The approvals are fixture data.** Dana Whitfield is the only approver listed in `pds.yaml`, and the approvals recorded in the records were made by the tool's maintainer to demonstrate the mechanism. In a real project an agent never approves; a named person does.

## Look around

Run these from this directory (`node ../../tools/pds.mjs`, or `pds` if you link the package):

```
pds status                      where the definition stands, by family
pds next                        what to write next, most important first
pds ask FEAT-pay-invoice-online what one element still needs
pds spec FEAT-send-invoice      the whole feature assembled into one document
pds impact RULE-invoice-total   what a change to this rule touches
pds explain COV-FEAT-rules      what a rule or check means and why it fires
pds lint                        no errors, and warnings for what is left to do
```

The generated pictures and tables are in [`views/`](views/README.md). They are rebuilt with `pds views` and are never edited by hand. On GitHub the diagrams render in place. Good starting points: [`product-map`](views/product-map.md), [`journey`](views/journey.md), [`flow`](views/flow.md), [`state`](views/state.md), [`trace`](views/trace.md) and [`coverage`](views/coverage.md).

## A thread through the layers

One path from the top of the product to the evidence that it works:

| Layer | Records |
|---|---|
| Why | [`PROD-ledgerly`](definition/intent/PROD-ledgerly.md), [`OBJ-paid-faster`](definition/intent/OBJ-paid-faster.md), [`EVD-freelancer-interviews`](definition/change/EVD-freelancer-interviews.md) |
| Who | [`ACT-account-owner`](definition/actors/ACT-account-owner.md), [`ROLE-owner`](definition/actors/ROLE-owner.md), [`ACT-client`](definition/actors/ACT-client.md), [`ROLE-invoice-recipient`](definition/actors/ROLE-invoice-recipient.md) |
| What | [`CAP-invoicing`](definition/structure/CAP-invoicing.md), [`FEAT-send-invoice`](definition/structure/FEAT-send-invoice.md), [`FEAT-pay-invoice-online`](definition/structure/FEAT-pay-invoice-online.md) |
| Experience | [`UC-invoice-a-client`](definition/experience/UC-invoice-a-client.md), [`FLW-send-invoice`](definition/experience/FLW-send-invoice.md), [`SCR-invoice-review`](definition/experience/SCR-invoice-review.md), [`MSG-invoice-email`](definition/experience/MSG-invoice-email.md), [`JRN-first-invoice`](definition/experience/JRN-first-invoice.md) |
| Behaviour | [`RULE-invoice-total`](definition/behaviour/RULE-invoice-total.md), [`RULE-invoice-number-sequence`](definition/behaviour/RULE-invoice-number-sequence.md), [`STM-invoice-lifecycle`](definition/behaviour/STM-invoice-lifecycle.md), [`REQ-confirm-recipient`](definition/behaviour/REQ-confirm-recipient.md) |
| Information | [`ENT-invoice`](definition/information/ENT-invoice.md), [`EVT-invoice-sent`](definition/information/EVT-invoice-sent.md), [`INT-email-sending`](definition/information/INT-email-sending.md), [`EXT-email-delivery`](definition/information/EXT-email-delivery.md) |
| Commercial | [`PLAN-free`](definition/commercial/PLAN-free.md), [`PLAN-team`](definition/commercial/PLAN-team.md), [`ENTL-monthly-invoices`](definition/commercial/ENTL-monthly-invoices.md) |
| Assurance | [`TST-confirm-and-send`](definition/assurance/TST-confirm-and-send.md), [`RISK-wrong-recipient`](definition/assurance/RISK-wrong-recipient.md), [`OBL-tax-and-invoicing`](definition/assurance/OBL-tax-and-invoicing.md) |
| Operations | [`MET-days-to-paid`](definition/operations/MET-days-to-paid.md), [`MET-activation-rate`](definition/operations/MET-activation-rate.md) |
| Change | [`DEC-sequential-invoice-numbers`](definition/change/DEC-sequential-invoice-numbers.md), [`QST-overpayment`](definition/change/QST-overpayment.md), [`RLS-first-release`](definition/change/RLS-first-release.md) |

## What is deliberately unfinished

A definition that claims to be finished is the thing to distrust. Three kinds of honest gap are left visible on purpose:

- **Skeleton records.** `pds init` wrote about a hundred prompts for the parts of a SaaS every product has (identity, notifications, back office, and so on). Only the invoicing and payments slice has been confirmed and written; the rest are still `origin: skeleton` at `stub`, and `pds status` counts them.
- **Open questions and deferrals.** Four non-blocking questions ([`QST-overpayment`](definition/change/QST-overpayment.md), [`QST-audit-log`](definition/change/QST-audit-log.md), [`QST-client-data-requests`](definition/change/QST-client-data-requests.md), [`QST-refunds-and-disputes`](definition/change/QST-refunds-and-disputes.md)) stand behind probe dispositions marked `deferred`, so each gap has a name and a due date.
- **Approvals still to give.** `CAP-collect-payments` and `FEAT-pay-invoice-online` claim *specified* and are critical, but no one has approved them, so `pds lint` warns. The other critical work is approved, and editing anything under an approved element shows as stale until it is approved again.

Things the example does not try to cover: the rest of the skeleton, an API, a back office, localisation, and anything past the first release.
