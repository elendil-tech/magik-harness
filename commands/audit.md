---
name: audit
description: Audit the harness — first-time setup on empty projects, periodic review otherwise. Picks domains, surfaces drift, recommends restructures.
---

Run the harness audit — first-time setup on an empty registry, periodic review otherwise. Picks starting domains, surfaces drift, and recommends restructures.

Invoke the `harness-audit` skill and follow it strictly. Hand off any approved proposals to:

- the `domain-registry` skill for registry / domain folder changes,
- the `knowledge-base` skill for KB writes / pruning,
- the `scaffolding-author` skill for new skills or subagents.

Do not mutate files outside those skills.
