# Knowledge base — index

The knowledge base is the project's **ground truth**. Everything in it is reference material for agents and humans: definitions, decisions, policies, specifications, and persistent fieldnotes (lessons), organized by **project domain**.

## Layout

```
knowledge/
├── _index.md            ← this file
├── _meta/
│   ├── domains.md       ← the live domain registry (source of truth)
│   ├── glossary.md      ← canonical terms used across domains
│   └── schemas/         ← document templates (concept, decision, policy, spec, fieldnote)
└── <domain>/            ← created on demand (only when content has accumulated)
    ├── _index.md
    └── <topic>.md
```

## How to write

1. **Pick a schema** from `_meta/schemas/`:
   - `concept` — a definition (an object, role, or capability of the project).
   - `decision` — a choice made and its rationale (ADR-style).
   - `policy` — a rule that constrains future work.
   - `specification` — a formal spec (product feature, contract clause, brand element, …).
   - `fieldnote` — a time-stamped lesson, gotcha, or "do this / never do this again".

2. **Place under the right domain.** If the domain doesn't exist in `_meta/domains.md`, run the `domain-registry` skill — *don't* invent a folder ad hoc.

3. **Fill the frontmatter.** All schemas require: `id`, `domain`, `status`, `created`, `updated`. Optional: `links`, `supersedes`, `superseded_by`, `tags`.

4. **Cross-link.** Use relative links (`../engineering/auth-decision.md`) and add the link to the related entry's `links` block.

## Status values

- `draft` — being written.
- `active` — in force; trustworthy reference.
- `deprecated` — kept for history; superseded.
- `archived` — historical only; do not act on it.

## Memory

Cursor's harness manages session/conversation memory. **Persistent project memory lives here as `fieldnote` entries.** When you make a mistake worth remembering, write a fieldnote.

## Indexes

Each non-empty domain has its own `_index.md`. The harness can regenerate domain indexes via the `knowledge-base` skill.
