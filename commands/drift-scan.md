---
name: drift-scan
description: Detect disagreements between the harness layers — domain registry, knowledge, scaffolding, and (optionally) codebase. Outputs a triage report.
---

Detect disagreements across the four harness layers — domain registry, knowledge base, agent scaffolding, and (optionally) the codebase. Outputs a triage report; does not mutate state.

Invoke the `drift-scan` skill. Default to shallow mode. If the user passes `deep`, include the codebase layer.

Output the report exactly as specified by the skill (Summary, High, Medium, Low, Proposals). Do not apply mutations from this command — that's done by the user approving proposals, which then route through the `domain-registry`, `knowledge-base`, or `scaffolding-author` skills.
