# /audit

Run the harness audit. On an empty registry this is the first-time setup; otherwise it's the periodic review.

Invoke the skill at `.cursor/skills/_core/harness-audit/SKILL.md` and follow it strictly. Hand off any approved proposals to:

- `domain-registry` for registry / domain folder changes,
- `knowledge-base` for KB writes / pruning,
- `scaffolding-author` for new skills or subagents.

Do not mutate files outside those skills.
