# /kb-add

Quickly add a knowledge base entry.

Invoke `.cursor/skills/_core/knowledge-base/SKILL.md`. Walk the user through:

1. Pick the schema (`concept` / `decision` / `policy` / `specification` / `fieldnote`).
2. Confirm the domain (must exist in `knowledge/_meta/domains.md`; if not, defer to `domain-registry`).
3. Pick an `id`.
4. Author from the matching schema in `knowledge/_meta/schemas/`.
5. Cross-link and update `_index.md`.

For lessons / gotchas, default to `fieldnote` and offer to bump `recurrence` if a similar entry already exists.
