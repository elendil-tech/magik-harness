---
name: <domain>-domain
description: >-
  High-level guidance for the <domain> domain — its tools, services, policies,
  and recurring procedures. Use when starting domain-relevant work and the
  specific task skill is unclear, or when no task skill exists yet.
---

# <Domain> — domain skill

> **Domain skill.** Orchestrates a domain's tooling and points to the right task / service skills.

## Scope

- What this domain covers (tied to the registry purpose).
- What it does **not** cover (hand-off to other domains).

## Read first

Before doing domain work:

1. `knowledge/<domain>/_index.md`
2. Active `decision`s and `policy`s in this domain.

## Tooling

### Services

| Service | What we use it for | Skill |
| --- | --- | --- |
| <Service A> | … | `.cursor/skills/services/<service-a>/SKILL.md` |

### Common stacks / conventions

- Languages, frameworks, asset formats, file naming.
- Where outputs land (`workspace/<domain>/...` or `codebase/...`).

## Recurring procedures

| Task | Skill |
| --- | --- |
| <Task A> | `.cursor/skills/<domain>/<task-a>/SKILL.md` |
| <Task B> | `.cursor/skills/<domain>/<task-b>/SKILL.md` |

If a task you're about to perform is not listed and you've done it before, propose a new task skill via `scaffolding-author`.

## Domain policies (live here)

- Quote the *titles* of `policy` entries from `knowledge/<domain>/`. Do not duplicate the rule text — link to it.

## Open questions

- What's still under-specified in this domain.

## Health signals

- Indicators that the domain is healthy (writes per month, drift items resolved, etc.).
