---
schema: decision
id: <kebab-case-id>
domain: <domain-slug>
status: draft
created: YYYY-MM-DD
updated: YYYY-MM-DD
last_referenced: YYYY-MM-DD     # bumped when this entry informs a substantive task; defaults to `updated`
provenance: direct              # direct | memory-distill@<YYYY-MM-DD> | imported
trust: medium                   # low | medium | high
quarantine: false               # true if sourced from unverified external content
quarantine_reason: ""           # external-source | policy-conflict | unverified — set when quarantine: true
deciders: []
supersedes: []
superseded_by: []
links: []
tags: []
---

# <Decision title — present tense, e.g. "Use Postgres for primary store">

> **Decision** — a choice made, the alternatives considered, and the rationale. Stable; if reversed, supersede rather than rewrite.

## Context

What was the situation that forced a choice? What constraints applied? What was already decided that this builds on?

## Options considered

| Option | Pros | Cons |
| --- | --- | --- |
| Option A | … | … |
| Option B | … | … |

## Decision

State the choice in one sentence.

## Rationale

Why this option over the others. Tie the reasoning to the constraints from *Context*.

## Consequences

- Positive consequences and capabilities unlocked.
- Negative consequences, debt incurred, or risks introduced.
- What follow-up decisions or specs this implies.
