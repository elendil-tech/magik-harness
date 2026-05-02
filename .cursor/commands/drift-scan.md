# /drift-scan

Run the drift scan across the four harness layers (registry, knowledge, scaffolding, optional codebase).

Invoke `.cursor/skills/_core/drift-scan/SKILL.md`. Default to shallow mode. If the user passes `deep`, include the codebase layer.

Output the report exactly as specified by the skill (Summary, High, Medium, Low, Proposals). Do not apply mutations from this command — that's done by the user approving proposals, which then route through `domain-registry` / `knowledge-base` / `scaffolding-author`.
