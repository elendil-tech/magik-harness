---
name: harness-audit
description: Holistic harness review — drift scan plus structural recommendations (scale up / down / merge / deprecate). Doubles as first-time setup. Use on /audit, when starting a project, or for periodic review.
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

### 2. Run memory-distill

Invoke the `memory-distill` skill. It produces its own proposal list (promotions, conflicts, structural moves, pruning) which is folded into the audit's overall proposal output. Memory hygiene is a first-class section of the audit, not an afterthought.

### 3. Analyze KB health

For each domain:

- Count entries by schema and status.
- Flag: domains with > 80% `draft`, domains with no entries in > 90 days, domains with `decision` but no `policy`/`spec`.

### 4. Analyze memory hygiene

`memory/` is gitignored and runtime-local; this section operates on whatever memory exists on this machine. If `memory/` is absent (fresh clone, CI run), report this section as "no memory present on this runtime" and continue — the rest of the audit is unaffected.

- Daily notes count vs. retention window (active `daily/` should be ≤ 30 days of entries).
- Undistilled signals: count of `[lesson-candidate]` / `[decision-candidate]` / `[concept-candidate]` not yet promoted or rejected.
- Commitment backlog: count of active commitments past their `due` date.
- Oldest unprocessed daily note: flag if > 14 days since last distill run.
- `[external]` entries awaiting review (these become `quarantine: true` on promotion).
- Earn-the-lane candidates: domains with accumulated tagged daily entries but no `memory/<domain>/` lane yet — surface as *prompts* for `domain-registry` to evaluate against the five principles (`rules/scaffolding.mdc`), never as auto-promotion triggers.

### 4b. Analyze KB trust + freshness

- Quarantined KB entries (any). Surface every one — they need to be reviewed and cleared.
- Low-trust KB entries (`trust: low`, `provenance != direct`) older than 14 days without a `last_referenced` bump — review-gate signal.
- Stale KB entries (`freshness < 0.06`, ~ > 56 days). Advisory only — recommend either bumping `last_referenced` after re-validation or deprecating.

### 5. Analyze scaffolding health

- Skills not referenced from any domain index in > 90 days — *prompt* to evaluate whether the workflow is still needed (the count of days is evidence, not a verdict).
- Service skills whose service is not used in any other entry — *prompt* for review.
- Skill count per domain — *prompt* to evaluate splitting (heavy domains) or adding a `_domain/SKILL.md` (domains with KB depth but no orchestration).

### 6. Analyze fieldnote signals

- Fieldnotes with substantial recurrence — *prompt* to evaluate promotion to `policy` (the five principles decide; recurrence is evidence, not an auto-trigger).
- Fieldnotes with the same `tags` cluster — *prompt* to evaluate consolidation into a `concept`.

### 7. Recommend structural changes (judgement, not threshold)

Produce 0–N **proposals**. Every proposal goes through `domain-registry` (or `scaffolding-author` for single-skill cases) and answers the five principles in `rules/scaffolding.mdc`. The "trigger" column lists *prompts* — qualitative or quantitative signals that warrant evaluating the operation. The principles decide; numbers don't.

| Proposal type | Prompts to evaluate |
| --- | --- |
| Add subdomain | A domain has accumulated entries that fall into clear sub-clusters; consult `knowledge/_meta/subdomain-catalogue.md` for matching slugs. |
| Merge domains | Two domains have heavy cross-links and entries plausibly belonging to either — boundary blur. |
| Split (sibling-promotion) | A subdomain has clearly outgrown its parent's frame — the boundary statement reads broader than the parent's, not nested in it. |
| Deprecate domain | No writes for an extended stretch, no referenced entries — the *Persistence* principle is in question. |
| Promote fieldnote → policy | Substantial recurrence, or `severity: high`, or stable enough wording that it would constrain future work. |
| Add domain skill | Cross-cutting tooling decisions in a domain that aren't owned by any single task skill. |
| **Add domain agent** | Domain has procedural surface (orchestration `_domain/SKILL.md`, multiple task skills, services in active use) AND recurring delegated work AND the five principles say yes for the agent's role. See `.cursor/rules/subagents.mdc`. |
| Promote memory lane | Tagged entries are creating noise in the flat `memory/daily/` lane and separation would genuinely improve coherence/boundary/granularity/persistence/discoverability. Spinal precondition: slug must be active in registry. |

### 8. Output

```markdown
# Harness audit — <YYYY-MM-DD>

## Health
- Domains: 5 active, 0 deprecated
- KB entries: 42 (active 28 / draft 11 / deprecated 3)
- KB trust: high 9 / medium 26 / low 4 / quarantined 1
- KB freshness: fresh 18 / aging 7 / stale 3 (14-day half-life)
- Memory: 12 daily notes (last 14 days), 4 commitments active, last distill 2026-04-29
- Earned memory subfolders: 2 of 5 active domains
- Skills: 17 (services 4 / domain 3 / task 10 / core 5)
- Drift: 1 high, 2 medium, 5 low

## Drift summary
<from drift-scan>

## Memory hygiene
<from memory-distill — promotions, conflicts, prunes>

## Proposals
1. Promote fieldnote `kb/engineering/db-migration-foot-gun.md` to a policy.
2. Promote `[decision-candidate] postgres for primary store` to `knowledge/engineering/db-postgres.md`.
3. Add subdomain `engineering/security` (8 entries cluster).
4. Add domain skill at `.cursor/skills/marketing/_domain/SKILL.md`.
5. Earn `memory/engineering/` (3 entries / 14 days).

Approve [1,2,3,4,5]? [select / all / none]
```

### 9. Apply approvals

Hand off each approved proposal to the appropriate skill:

- domain changes → `domain-registry`
- KB writes / promotions → `knowledge-base`
- skill creation → `scaffolding-author`
- memory promotions / prunes → `memory-distill` (it already produced these; the audit just hands them through to user approval and applies via `memory-distill`'s own apply step)

## Anti-patterns

- Mutating files directly — always hand off to the specialist skill.
- Auto-applying without user approval, except for trivial index regeneration.
- Recommending more than ~5 proposals at once. Cap and prioritize by severity.
