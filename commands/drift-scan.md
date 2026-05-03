---
name: drift-scan
description: Detect disagreements between the harness layers — domain registry, knowledge, scaffolding, and (optionally) codebase. Outputs a triage report.
---

# Drift Scan

Run the drift scan across the four harness layers (registry, knowledge, scaffolding, optional codebase).

Invoke the `drift-scan` skill. Default to shallow mode. If the user passes `deep`, include the codebase layer.

Output the report exactly as specified by the skill (Summary, High, Medium, Low, Proposals). Do not apply mutations from this command — that's done by the user approving proposals, which then route through the `domain-registry`, `knowledge-base`, or `scaffolding-author` skills.
