---
schema: specification
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
version: 0.1.0
owner: <user or role>
links: []
tags: []
---

# <Specification title>

> **Specification** — a formal description of what something is or does. Used for product features, contract clauses, brand elements, infrastructure components, etc. Versioned.

## Summary

One short paragraph: what this specifies and why it matters.

## Goals

- Bulleted goals this specification satisfies.

## Non-goals

- Bulleted things this specification deliberately does **not** address.

## Specification

The body. Structure freely depending on what is being specified:

- For a product feature: user stories, flows, acceptance criteria.
- For a contract clause: parties, obligations, termination conditions.
- For a brand element: usage rules, do/don't examples, asset references.
- For an infrastructure component: API, data shape, SLOs, dependencies.

Refer to `workspace/<domain>/...` for any binary or rich asset that supports the spec.

## Open questions

- Things still to resolve. Convert to `decision` entries once resolved.

## Change log

- `vX.Y.Z` — YYYY-MM-DD — what changed.
