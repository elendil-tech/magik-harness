---
id: RULE-plan-change-timing
title: When a plan change affects sending
summary: A workspace sends under the plan it is on at that moment, and a downgrade only bites from the next calendar month.
anchor: FEAT-send-invoice
maturity: specified
kind: timing
statement: A workspace may send invoices up to the monthly limit of the plan it is on when it sends; a downgrade, a cancellation or an ended trial takes effect at the end of the paid period, the Free limit counts from the first day of the calendar month after that, and invoices already sent are never affected.
examples:
  - case: positive
    given: A Team workspace that cancelled on 10 March with a paid period ending on 31 March sends its twelfth invoice of the month on 20 March
    then: The invoice is sent, because the workspace is still on Team
  - case: edge
    given: The same workspace sends on 2 April, when it is on Free and has sent nothing yet that month
    then: It may send five invoices in April and is blocked from the sixth
  - case: edge
    given: A paid period that ends on 15 March
    then: The Free limit still counts only from 1 April, so sending between 16 and 31 March is not limited
  - case: negative
    given: A Free workspace that has already sent five invoices this month starts a sixth
    then: Sending is blocked, the draft is kept and an upgrade is offered
---

The limit itself is [[ENTL-monthly-invoices]]; the two plans' wording on downgrades is in [[PLAN-free]] and [[PLAN-team]].
