---
name: kb-search
description: >-
  Search the knowledge base before any substantive work. Use BEFORE producing,
  modifying, or committing content; before answering domain-relevant questions;
  before proposing structural changes. Returns ranked entries from
  knowledge/<domain>/ with supersede chains and active-policy conflicts
  surfaced. This is a mandatory pre-task gate per the harness contract — do
  not skip it because "I already know."
---

# KB search

The mandatory pre-task gate over `knowledge/`. Disciplined filesystem search with index-first walking and supersede-chain unwinding. No vector DB; no embeddings. The schema discipline of the KB is what makes this work.

## When to invoke

**Always**, before any task that produces, modifies, or commits content. Specifically:

- A user asks for domain-relevant work (engineering change, marketing copy, brand asset, sales playbook, etc.).
- Before answering a domain-relevant factual question.
- Before proposing a new KB entry, skill, or domain.
- Before promoting a memory candidate to the KB.
- When uncertain whether ground truth already exists.

You should *not* invoke this skill for trivial actions (formatting a sentence, renaming a single variable in code, answering a generic question with no project specificity).

If in doubt, run it. The cost is one walk over `_index.md` files; the cost of skipping it is contradicting an active `policy` or `decision`.

## Inputs

- `query` — the task description or user request, in natural language.
- `domain` *(optional)* — narrow to a single domain slug.
- `schema` *(optional)* — narrow to one of `concept` / `decision` / `policy` / `specification` / `fieldnote`.
- `status` *(optional)* — narrow to `active` / `draft` / `deprecated`. Default: `active` (with deprecated surfaced if it has a `superseded_by`).

## Procedure

### 1. Read the registry

Open `knowledge/_meta/domains.md`. Confirm which domains are `active`. If `domain` is provided as input, validate it against the registry; if it doesn't exist, return a clear error (do not silently fall back to a guess).

### 2. Index walk (cheap)

For each candidate domain (filtered by input or all `active`):

1. Read `knowledge/<domain>/_index.md` if it exists.
2. Read each entry's frontmatter (path, schema, status, tags, supersede links).
3. Score by: tag overlap with query nouns and verbs (highest weight), title match (high), domain match (medium), `status: active` (positive prior), recency of `updated` (mild positive).

### 3. Body grep (only when needed)

If the index walk returns < 3 entries with score above threshold, fall back to a body grep over `knowledge/<domain>/*.md` for the query's nouns and verbs. Skip schema files in `_meta/schemas/` and the registry itself.

### 4. Memory check (last 7 days)

Walk `memory/daily/<YYYY-MM-DD>.md` for the last 7 days. Surface entries tagged `[lesson-candidate]`, `[decision-candidate]`, `[concept-candidate]` matching the query — the KB may not have absorbed them yet, but they are still relevant context for the task. Mark them as **memory-only, not yet promoted**.

Also walk `memory/commitments.md` for active commitments touching the query's domain or scope.

### 5. Supersede-chain unwind

For every result with `superseded_by` in its frontmatter, follow the chain to the current entry and present that one instead. Never return a stale `deprecated` entry without surfacing its successor.

### 6. Conflict surfacing

For every `policy` in the result set, evaluate whether the task described in the query would *violate* that policy:

- If the query proposes an action the policy forbids, mark the result `⚠ conflict`.
- If the query touches the policy's `applies_to` scope, mark the result `! relevant`.
- Stop and ask the user before proceeding with a violating action.

For every `decision` whose subject overlaps the query, mark `! relevant` so the agent reads the decision before duplicating or contradicting it.

## Output format

```markdown
# KB search — <query summary>

## Active hits

| Path | Schema | Status | Score | Why it matched |
| --- | --- | --- | --- | --- |
| knowledge/engineering/auth-strategy.md | decision | active | 0.92 | tag:auth, title-match |
| knowledge/engineering/db-postgres.md | decision | active | 0.71 | tag:db, body-match |

## Conflicts / relevance flags

- ⚠ `knowledge/engineering/no-direct-db-writes.md` (policy) — current task would violate.
- ! `knowledge/engineering/db-postgres.md` (decision) — read before proposing a different store.

## Memory (not yet promoted)

- 2026-05-03 [lesson-candidate] [engineering] middleware rewrite breaks on `/` paths
- 2026-05-04 [commitment] [engineering] follow up on auth migration after Friday

## Supersede chain

- knowledge/engineering/old-auth.md → knowledge/engineering/auth-strategy.md (current)

## Coverage

- Walked: 4 domains, 17 _index entries, 5 daily memory files.
- Body grep: not triggered (index walk returned 6 hits ≥ threshold).
```

The skill returns paths and gists, **not full bodies**. The agent then opens what's actually relevant. This is what keeps the cost low — the search itself is cheap, and the agent only pays the body cost for entries it decided to read.

## Anti-patterns

- Returning entry bodies instead of frontmatter+gist (defeats the purpose).
- Returning a `deprecated` entry without its `superseded_by` successor.
- Failing to surface a `policy` conflict when one exists.
- Silently falling back to a guess when an unknown `domain` is passed.
- Skipping the memory pass — recent observations are often the most relevant context.
- Caching results across sessions (the KB and memory both change).

## Quick checklist

- [ ] Registry read; domain validated
- [ ] Each domain's `_index.md` walked
- [ ] Body grep run only if index walk was sparse
- [ ] Last 7 days of memory included
- [ ] Supersede chains unwound to current entry
- [ ] `policy` conflicts surfaced with `⚠`
- [ ] Output is paths + gists, not bodies
