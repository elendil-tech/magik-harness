---
name: harness-audit
description: >-
  Holistic review of the project harness — combines drift-scan with structural
  recommendations (scale up / down / merge / deprecate) and serves as the
  first-time-setup pass. Use when the user runs /audit, when starting a new
  project, or as a periodic review.
---

# Harness audit

A full pass over the harness. Covers two modes:

- **First-time setup** — when this skill detects an empty registry.
- **Periodic review** — when the registry has content.

## When to invoke

- User runs `/audit` or asks for a "harness review", "project review", "kb audit".
- After a major restructure (large KB write, new domain, codebase introduction).
- On a cadence the user sets (e.g., monthly).
- Whenever the harness feels "out of sync" with the project.

## Procedure

### 0. Detect mode

Read `knowledge/_meta/domains.md`. If `domains: []` is empty, run **first-time setup**. Otherwise, run **periodic review**.

---

## First-time setup

### 1. Confirm project metadata

Ask the user:

- Project name?
- One-line description?
- Will this project have a codebase? (creates `codebase/` if yes)

Update the `project:` block at the top of `knowledge/_meta/domains.md`.

### 2. Pick starting domains

Show the **reference catalogue** from `knowledge/_meta/domains.md`. Ask which apply now. Common starter sets:

- SaaS solo founder: `engineering`, `product`, `brand`, `marketing`.
- Service business: `brand`, `marketing`, `sales`, `legal`, `finance`.
- Research project: `research`, `engineering` (optional), `legal`.

Only add domains the user can immediately fill. **Prefer fewer, deeper.**

### 2a. Offer subdomain seeds (optional)

For each chosen domain, mention the recommended subdomain set from `knowledge/_meta/subdomain-catalogue.md`. **Do not pre-create subdomain folders** — they earn their place. Just surface them as a menu, e.g.:

```
You picked `engineering`. Recommended subdomains for full SaaS coverage
(create them later as content accumulates):

  architecture, backend, frontend, data, infrastructure,
  observability, reliability, security, testing

Smallest viable starter: architecture, backend, frontend, infrastructure, security.

Want a flat `engineering/` for now? [y/n]   (recommended: y)
```

A flat domain is the right starting point in almost all cases. Subdomains are added later via `domain-registry`.

### 3. Apply

For each chosen domain, defer to `domain-registry` skill (one call per domain). Each one creates `knowledge/<domain>/_index.md`.

### 4. Optional: codebase

If yes, create `codebase/` with a placeholder README. Do not pick a stack — the user does that on the first `codebase/` task.

### 5. Output

Print a summary:

```
Harness initialized.
- Project: <name>
- Domains: engineering, product, brand
- Codebase: yes

Next steps:
- Capture initial decisions in knowledge/<domain>/ via /kb-add.
- Add a service skill for any external tool you've already wired up.
- Run /drift-scan whenever in doubt.
```

---

## Periodic review

### 1. Run drift-scan

Invoke the `drift-scan` skill (default mode, or `--deep` if a codebase exists). Capture the report.

### 2. Analyze KB health

For each domain:

- Count entries by schema and status.
- Flag: domains with > 80% `draft`, domains with no entries in > 90 days, domains with `decision` but no `policy`/`spec`.

### 3. Analyze scaffolding health

- Skills not referenced from any domain index in > 90 days.
- Service skills whose service is not used in any other entry.
- Skill count per domain — flag domains with > 10 skills as candidates for splitting; flag domains with 0 skills + > 5 KB entries as candidates for adding a domain skill.

### 4. Analyze fieldnote signals

- Fieldnotes with `recurrence ≥ 3` — propose promotion to `policy`.
- Fieldnotes with the same `tags` cluster — propose a `concept` to consolidate.

### 5. Recommend structural changes

Produce 0–N **proposals**:

| Proposal type | Trigger |
| --- | --- |
| Add subdomain | A domain has > 8 active entries and a clear sub-cluster (consult `knowledge/_meta/subdomain-catalogue.md` for a matching slug). |
| Merge domains | Two domains have heavy cross-links and overlapping concepts. |
| Deprecate domain | No writes in > 6 months, no referenced entries. |
| Promote fieldnote | `recurrence ≥ 3` or `severity: high`. |
| Add domain skill | Domain has > 3 task skills but no `_domain/SKILL.md`. |
| **Add domain agent** | Domain has ≥ 1 domain skill, ≥ 3 task skills, and ≥ 1 service skill — i.e., enough specialized surface to warrant a dedicated worker. See `.cursor/rules/subagents.mdc`. |

### 6. Output

```markdown
# Harness audit — <YYYY-MM-DD>

## Health
- Domains: 5 active, 0 deprecated
- KB entries: 42 (active 28 / draft 11 / deprecated 3)
- Skills: 17 (services 4 / domain 3 / task 10 / core 5)
- Drift: 1 high, 2 medium, 5 low

## Drift summary
<from drift-scan>

## Proposals
1. Promote fieldnote `kb/engineering/db-migration-foot-gun.md` to a policy.
2. Add subdomain `engineering/security` (8 entries cluster).
3. Add domain skill at `.cursor/skills/marketing/_domain/SKILL.md`.

Approve [1,2,3]? [select / all / none]
```

### 7. Apply approvals

Hand off each approved proposal to the appropriate skill:

- domain changes → `domain-registry`
- KB writes / promotions → `knowledge-base`
- skill creation → `scaffolding-author`

## Anti-patterns

- Mutating files directly — always hand off to the specialist skill.
- Auto-applying without user approval, except for trivial index regeneration.
- Recommending more than ~5 proposals at once. Cap and prioritize by severity.
