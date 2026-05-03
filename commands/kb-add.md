---
name: kb-add
description: Add a knowledge base entry — guided by schema (concept / decision / policy / spec / fieldnote), domain, and id.
---

# Knowledge Base Entry

Quickly add a knowledge base entry.

Invoke the `knowledge-base` skill. Walk the user through:

1. Pick the schema (`concept` / `decision` / `policy` / `specification` / `fieldnote`).
2. Confirm the domain (must exist in `knowledge/_meta/domains.md`; if not, defer to the `domain-registry` skill).
3. Pick an `id`.
4. Author from the matching schema in `knowledge/_meta/schemas/` (these files are seeded into the user's project by `/init-harness`).
5. Cross-link and update `_index.md`.

For lessons / gotchas, default to `fieldnote` and offer to bump `recurrence` if a similar entry already exists.
