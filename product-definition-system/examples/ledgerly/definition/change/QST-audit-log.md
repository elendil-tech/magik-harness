---
id: QST-audit-log
title: Do workspaces with several members need an audit log?
summary: Whether owners need to see who sent, voided or changed an invoice, and which actions must be logged before launch.
anchor: CAP-invoicing
maturity: specified
status: open
blocking: false
asked_of: Dana Whitfield
due: 2027-01-15
rel:
  concerns: [FEAT-send-invoice, ENT-invoice]
---

The first release keeps an invoice's state and its dates but not who did what. Most early workspaces have one member, so this may be enough for the closed beta. Teams of up to five members, which the Team plan allows, will want to know who voided an invoice. The answer decides whether a log of sending, voiding and editing is a launch requirement.
