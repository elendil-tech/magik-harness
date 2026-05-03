---
name: audit
description: Audit the harness — first-time setup on empty projects, periodic review otherwise. Picks domains, surfaces drift, recommends restructures.
---

# Harness Audit

Run the harness audit. On an empty registry this is the first-time setup; otherwise it's the periodic review.

Invoke the `harness-audit` skill and follow it strictly. Hand off any approved proposals to:

- the `domain-registry` skill for registry / domain folder changes,
- the `knowledge-base` skill for KB writes / pruning,
- the `scaffolding-author` skill for new skills or subagents.

Do not mutate files outside those skills.
