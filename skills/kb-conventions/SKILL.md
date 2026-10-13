---
name: kb-conventions
description: >-
  The recommended metadata standard for knowledge-base entries: frontmatter schema, tagging
  standard, relations standard, and the judgment for applying them coherently (living entries
  versus decision records, one claim per entry, honest types). Use when creating or editing KB
  entries, and when running kb-sanitize or kb-code-sync. Everything sits above a tiny required
  floor (status and updated); it is convention, never a gate.
---

# KB metadata conventions

This is the harness's **recommended** metadata standard for knowledge-base entries: the frontmatter schema, the tagging standard and the relations standard, plus the **judgment** for applying them coherently rather than mechanically. It is generic and portable; the project owns the specifics (its tag vocabulary and any extra field conventions) in its own `knowledge/conventions.md` (section 5 below).

> **Relationship to the floor.** The `knowledge-base` skill requires only `status` and `updated`. Everything here is **additive convention, not a schema gate**. The floor stays tiny on purpose; the rest is *recommended* so the graph stays useful without becoming rigid. An entry that carries only `status` and `updated` is still valid. Apply the rest with judgment, and propose (never silently impose) it when maintaining.

## Quick reference

- **Required floor:** `status` (`active` | `deprecated`; `draft` is optional) and `updated` (ISO date of the last substantive change).
- **Recommended:** `id` (kebab-case, permanent, and also the filename: `<id>.md`), `aliases`, `type` (`concept` | `decision` | `specification` | `policy` | `fieldnote`), `domain`, `title`, `summary`, `tags`.
- **Field order:** `id`, `aliases`, `type`, `domain`, `title`, `status`, `updated`, `summary`, type-specific fields, `implements`, `implemented_by`, `supersedes`, `superseded_by`, `depends_on`, `related`, `tags`. Omit empty fields.
- **Filename equals id.** `[[id]]` resolves by filename, never by alias. Moving a file between folders keeps its id.
- **Tags:** lowercase-kebab, roughly 3 to 7 per entry, from the project's controlled vocabulary, never restating a structured field.
- **Relations** live in frontmatter as `"[[id]]"`: `related` (symmetric), `supersedes` / `superseded_by`, `implements` / `implemented_by`, `depends_on`. A `deprecated` entry carries `superseded_by` when a successor exists.
- **Living versus record.** `concept`, `specification` and `policy` are edited in place to stay current. `decision` and `fieldnote` are immutable: supersede them, never rewrite them.
- **Judgment beats completeness.** Omit a field rather than invent a dishonest value, and surface ambiguity instead of guessing.

## Where the detail lives

| You need | Read |
| --- | --- |
| Field set, `type` enum, status lifecycle, field order, filename and `[[id]]` resolution (sections 1.1 to 1.7) | `references/frontmatter.md` |
| Tagging rules and facets (section 2); relation fields, reciprocity, deprecation (section 3) | `references/tags-and-relations.md` |
| Applying it with judgment: relations, tags, scope, honest types, when unsure, decision records versus state documents (sections 4.1 to 4.6) | `references/judgment.md` |

Other skills cite these by section number, and the numbering is kept stable across the files.

## 5. Per-project vocabulary and conventions

The harness ships the **generic rules** above; each project owns its **specifics**:

- **Controlled tag vocabulary.** Maintain the canonical tag list — grouped by facet (§2.2) — plus a synonym→canonical mapping and a note of any retired tags, in the project's `knowledge/conventions.md`. The §2 rules point *at* that list; they don't contain it.
- **Project field conventions.** Any extension to the `type` enum (§1.2) or extra type-specific fields a project standardizes on belong in the same `knowledge/conventions.md`, marked clearly as project-local.
- **Consolidation is a one-pass edit.** When merging synonyms or retiring tags, record the mapping in `conventions.md` and apply it across all entries in a single proposal, so the index never sits half-migrated.

If a project has no `knowledge/conventions.md` yet, the generic standard here is enough to start; create one when the tag vocabulary is worth pinning down.
