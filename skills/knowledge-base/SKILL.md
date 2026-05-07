---
name: knowledge-base
description: Create, update, and prune knowledge base entries under knowledge/<domain>/ using the five schemas (concept, decision, policy, specification, fieldnote). Use when capturing ground truth, decisions, policies, specs, or lessons.
---

# Knowledge base

The knowledge base captures project **ground truth**. Every entry uses one of five schemas in `knowledge/_meta/schemas/`. This skill handles authoring, editing, indexing, and pruning.

## When to invoke

- User wants to record a decision, define a concept, set a policy, write a spec, or capture a lesson.
- An agent realizes ground truth for a current task is missing or ambiguous.
- Indexes (`_index.md`) need regeneration after writes.
- Periodic pruning of stale or duplicate entries.

## Procedure

### 1. Pick the schema

Ask: *what is the user trying to capture?*

| Intent | Schema |
| --- | --- |
| Define an object/role/capability that other entries will reference | `concept` |
| Record a choice + why (and what was rejected) | `decision` |
| Establish a rule that constrains future work | `policy` |
| Formal description of a feature / clause / asset / component | `specification` |
| Capture a lesson / gotcha / surprise / repeated mistake | `fieldnote` |

If unclear: prefer `concept` for "what is this?", `decision` for "why this?", `policy` for "must do this", `specification` for "exactly this".

### 2. Confirm domain

Read `knowledge/_meta/domains.md`. Confirm the domain slug exists and is `status: active`. If not, defer to the `domain-registry` skill before writing.

### 3. Pick an `id`

`kebab-case`, descriptive, unique within the domain. Examples: `auth-strategy`, `pricing-tier-policy`, `brand-voice-spec`.

### 4. Author

1. Copy `knowledge/_meta/schemas/<schema>.md` to `knowledge/<domain>/<id>.md`.
2. Fill the frontmatter:
   - `id`, `domain`, `status` (`draft` or `active`), `created`, `updated`.
   - `last_referenced`: today.
   - `provenance`: `direct` for hand-written entries; `memory-distill@<YYYY-MM-DD>` when called from `memory-distill` (the distill skill stamps this and passes it through).
   - `trust`: `medium` for direct authoring; for promoted entries, follow the table in `memory-distill` (substantial recurrence + non-external → `high`; otherwise `medium`; `[external]` source → `low`).
   - `quarantine`: `true` only when promoting `[external]` content or when explicitly flagged unverified — set `quarantine_reason` in that case.
3. Fill every section. Empty sections are a sign the entry isn't ready — leave it `draft` or remove the section.
4. Cross-link related entries using relative paths. Mirror the link in their `links:` block.

### 5. Index

Either edit `knowledge/<domain>/_index.md` directly, or regenerate it (list active entries grouped by schema, alphabetical within group).

### 6. Drift check (light)

For new `decision` and `policy` entries: scan for contradictions with existing entries in the same domain. If found, propose a supersede or merge.

## Updating

- **Active entry, small clarification** → edit in place; bump `updated`.
- **Active entry, change of substance** → if it changes the recorded choice/rule, do **not** rewrite. Create a new entry that supersedes the old: set `supersedes: [<old-id>]` on the new one and `superseded_by: [<new-id>]`, `status: deprecated` on the old one.
- **Fieldnote recurrence** → increment `recurrence` and update `updated`. Substantial recurrence or `severity: high` is a *prompt* to evaluate promotion to a `policy` — run the five principles in `rules/scaffolding.mdc` (does this represent a stable rule, or a symptom of a deeper issue better addressed by a `concept` or `decision`?). The principles decide; recurrence is evidence.
- **Entry was used to inform a substantive task** → bump `last_referenced` to today. This is what keeps the freshness score meaningful — `last_referenced` should represent deliberate re-validation or citation, not casual reads.
- **Clearing a quarantine** → only the user does this. Set `quarantine: false`, clear `quarantine_reason`, optionally bump `trust` from `low` to `medium`, and note the review in the entry body or a linked `fieldnote`.

## Pruning

Pruning is **proposal-only** — the user confirms.

Prune when:
- Two entries define the same thing (dedupe → keep richer; deprecate the other; redirect via `superseded_by`).
- Entry is `deprecated` for ≥ 12 months and unreferenced anywhere → propose `archived`.
- Entry contradicts a more recent active entry → supersede chain.
- `draft` entry untouched for ≥ 60 days with no progress → propose deletion or completion.

## Anti-patterns

- Writing without a schema.
- Putting code, binary assets, or operational artifacts in `knowledge/`. Those belong in `workspace/` or `codebase/`.
- Rewriting a `decision` to flip the choice.
- Creating `knowledge/<domain>/` for a domain not in the registry.
- Skipping `_index.md` updates.

## Quick checklist

- [ ] Schema picked and matches intent
- [ ] Domain exists in registry
- [ ] Frontmatter complete (incl. `last_referenced`, `provenance`, `trust`, `quarantine`)
- [ ] Cross-links bidirectional
- [ ] `_index.md` updated
- [ ] No contradiction with existing active entry (or supersede recorded)
- [ ] If `quarantine: true`, `quarantine_reason` set
