---
name: domain-registry
description: Read, propose, and update the project's domain registry at knowledge/_meta/domains.md using contextual judgement (the five principles, the five operations). Use when adding / renaming / merging / splitting / deprecating a domain or subdomain, or before any structural change to knowledge/<domain>/ or .cursor/skills/<domain>/.
---

# Domain registry

This skill is the **only** sanctioned way to mutate `knowledge/_meta/domains.md`. The registry is the spine of the harness; KB folders, domain skills, domain agents, and earned memory lanes mirror it (see `rules/domains.mdc` for the spinal binding).

This skill owns all five organizational operations on the registry: **Add / Rename / Merge / Split / Deprecate**. Every operation is judged against the **five principles** (`rules/scaffolding.mdc`) — not against numeric thresholds.

## When to invoke

- User asks to add, rename, merge, split, or deprecate a domain or subdomain.
- A new piece of content does not fit any active domain cleanly.
- A folder has appeared under `knowledge/<x>/`, an earned `memory/<x>/`, or `.cursor/skills/<x>/` (domain skill) that is not in the registry — drift signal, high severity.
- Before scaffolding a new domain skill, domain agent, or KB folder whose placement is unclear.
- `drift-scan` surfaces a *judgement-prompt* signal (e.g., accumulated tagged memory entries with no folder) and the operator wants to evaluate.

## The five principles (every proposal answers these)

Before producing any proposal, the agent reasons through five organizing principles, in writing, and includes the answers in the proposal body:

1. **Coherence.** Do the items belong together because they share *concepts*, or only because they share a *tag*?
2. **Boundary.** Can the unit be defined in one sentence — *what it includes and what it explicitly excludes*?
3. **Granularity.** Does this match the granularity of sibling units at the same level?
4. **Persistence.** Will this organizational unit still make sense in 6 months? Project-shaped concerns are *tags*, not folders.
5. **Discoverability.** Does the placement and naming make a fresh contributor faster?

If any principle is "no" or "not yet," the proposal is not ready. Surface that to the user and recommend the alternative (e.g., a project tag instead of a folder; an `applies_to:` cross-link instead of a meta-domain).

## The five operations

| Operation | When | Default shape |
| --- | --- | --- |
| **Add** | New body of work emerges; no existing domain hosts it cleanly. | New top-level domain *or* subdomain under an existing parent. Default to subdomain if a clear parent exists. |
| **Rename / re-scope** | Slug or purpose has drifted from actual contents. | Slug rename + purpose statement update + folder migration. |
| **Merge** | Two domains' boundaries blur; entries could plausibly live in either. | Pick the surviving slug; mark the other `deprecated` with `superseded_by:` and migrate referenced links. |
| **Split** | Contents fall into two coherent halves with distinguishable boundaries. | **Default: subdomain** — children stay nested under the parent in `subdomains:`. **Sibling-promotion** (child becomes a peer of the parent) only when the child has clearly outgrown the parent's frame. |
| **Deprecate** | Work has wound down; entries are historical, not active. | `status: deprecated` in the registry; folders stay; `_index.md` carries a deprecation banner; successor (if any) named. |

## Procedure

### 1. Read

```
Read knowledge/_meta/domains.md
```

Parse the YAML registry section. Note `domains:` (list), each with `slug`, `status`, `subdomains:`, and (for splits) `knowledge/_meta/subdomain-catalogue.md` for advisory templates.

### 2. Diagnose intent

Confirm the operation. Phrase it back to the user in the operation vocabulary:

> "You're proposing to **split** `engineering` — sub-pattern: subdomain (default) — into `engineering/security` while `engineering` keeps everything else. Is that right?"

### 3. Run the five principles

For the proposed operation, write one short paragraph or bullet answering each of the five principles. This is the load-bearing reasoning step — do not skip it. If any principle returns "no," propose the alternative pattern (e.g., Pattern A `applies_to:` cross-link, Pattern B project tag) instead of the structural change.

### 4. Consult the subdomain catalogue (for splits)

When proposing a **split**, read `knowledge/_meta/subdomain-catalogue.md` and find the parent's recommended set:

- If the proposed slug matches a catalogue entry → reuse the catalogue's `name` and `purpose`.
- If it doesn't match → flag it. Either pick the closest catalogue slug, propose adding a new entry to the catalogue, or document why this project diverges.
- The catalogue is **advisory**. You may diverge with explicit user confirmation.

### 5. Detect cross-domain handling (for adds)

When the candidate is *cross-cutting* (touches multiple existing domains), do not jump to a new top-level domain. Try the patterns from `rules/knowledge-base.mdc` in order:

- **Pattern A** — Primary owner + `applies_to:` + `links:`. Default for cross-domain reach.
- **Pattern B** — Project tag (`tags: [<project>]`). For transient cross-cutting concerns.
- **Pattern C** — Cross-cutting meta-domain (e.g., `compliance/`). **Only** when (a) no single domain is the natural owner, (b) the concern persists indefinitely, and (c) the content passes all five principles independently. Rare on purpose.

State which pattern is being proposed and why.

### 6. Propose to user

Always confirm structural changes before committing. Output the proposal in the form below. The proposal MUST be future-tense; no "added" / "registered" / "I've created" until step 7 has actually run.

```
## Proposed change — <operation> <slug(s)>

### Operation
- <Add | Rename | Merge | Split (subdomain | sibling-promotion) | Deprecate>: <short description>

### Five principles
- Coherence:       <one-sentence answer>
- Boundary:        <one-sentence answer (include what is excluded)>
- Granularity:     <one-sentence answer>
- Persistence:     <one-sentence answer>
- Discoverability: <one-sentence answer>

### Cross-domain pattern (if applicable)
- Pattern A | B | C — <reason>

### Concrete edits
- knowledge/_meta/domains.md     — <add row | rename slug | mark deprecated | …>
- knowledge/<slug>/_index.md     — <create | move | update>
- workspace/<slug>/              — <advisory; create if user wants>
- (only when explicitly authoring) .cursor/skills/<slug>/_domain/SKILL.md
- knowledge/_meta/domains.md     — append change-log row

### Drift impact
- <which existing drift-scan signals this resolves; which it might create>

Apply? (yes / amend / cancel)
```

### 7. Apply (only on explicit "yes")

In order:

1. Edit `knowledge/_meta/domains.md` — the YAML block + change-log row.
2. Create or move `knowledge/<slug>/_index.md` from the index template (below).
3. Do **not** pre-create `.cursor/skills/<slug>/` (a domain skill folder) unless content is being authored *now*.
4. Do **not** touch `memory/<slug>/` — memory lanes are earned through their own proposal via `memory-distill`, evaluated against the same five principles.
5. Confirm by listing each file written from the structured tool output, not narrated.

### 8. Verify

Run `drift-scan` to confirm no new drift was introduced (and that any verdict-class signals are resolved).

## Index template (for new domain)

```markdown
# <Domain name>

> **Domain.** <One-paragraph purpose, mirroring the registry entry.>

## Active entries

*(none yet)*

## Subdomains

*(none yet)*

## Open questions

- …
```

## Anti-patterns

- Editing `knowledge/_meta/domains.md` directly without going through this skill.
- Creating `knowledge/<x>/`, an earned `memory/<x>/`, or `.cursor/skills/<x>/` (domain skill) before the registry has the entry.
- Treating numeric signals (`≥ 3 entries`, `recurrence ≥ 3`, "no writes in 6 months") as verdicts. They are *prompts* for the five principles. The principles decide.
- Adding a domain "just in case." Defer until the principles all say yes.
- Renaming silently. Rename = breaking change; require explicit confirmation; migrate dependent paths.
- Proposing Pattern C (cross-cutting meta-domain) without showing all three preconditions hold. A loose meta-domain bends the spine.
- Forcing service or task skills into a domain folder to "satisfy the spine." The spine binds KB and *domain* skills; services and tasks have their own taxonomies (see `rules/skills-organization.mdc`).
- Skipping the five principles in the proposal body. A proposal that lists files but doesn't articulate the boundary is incomplete; the user can't approve what isn't argued.
