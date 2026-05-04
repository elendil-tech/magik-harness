---
schema: concept
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
links: []
tags: []
---

# <Concept name>

> **Concept** — a defined object, role, or capability in this project. Use when you need a stable referent that other entries can link to.

## Definition

One paragraph. State what this *is*, in this project's specific terms. Avoid generic dictionary definitions.

## Why it exists

Why does this concept matter to the project? What problem does it represent or solve?

## Properties / shape

- Bullet the structural facts: fields, parts, states, lifecycle.
- Use a small table if useful.

## Boundaries

- What this concept is **not**.
- Adjacent concepts and how to disambiguate them.

## Related

- Related `concept`s, `decision`s, `policy`s, or `specification`s.
