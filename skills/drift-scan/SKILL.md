---
name: drift-scan
description: Detect drift across the harness layers — registry, knowledge, memory, scaffolding, codebase — and produce a triaged report with proposed fixes. Use after large KB writes, registry changes, memory accumulation, or as part of /audit.
---

# Drift scan

Drift = two layers that should agree, disagreeing. This skill produces a structured report of drift items and suggested resolutions. It does **not** mutate state; resolutions are proposals.

## Layers

1. **Registry** — `knowledge/_meta/domains.md`
2. **Knowledge** — `knowledge/<domain>/`
3. **Memory** — `memory/daily/`, `memory/<domain>/daily/`, `memory/commitments.md` *(gitignored, runtime-local — see note below)*
4. **Scaffolding** — `.cursor/skills/<domain>/`, `.cursor/rules/`, `.cursor/agents/`
5. **Codebase** — `codebase/` (only if present)

`workspace/` is excluded from drift control.

`memory/` is gitignored; checks D2m, D3m, D16–D21 below operate on whatever runtime-local memory exists and report nothing if `memory/` is absent (e.g. CI runs, fresh clones). That is correct, not a bug — see `rules/drift-control.mdc` "Memory drift is local."

## Procedure

### 1. Build the inventory

Collect:

- `registry.domains[]` — slugs, status, paths, subdomains.
- `kb.domains{}` — directories under `knowledge/` (excluding `_meta`).
- `kb.entries[]` — every `*.md` not under `_meta`, parse frontmatter (`schema`, `domain`, `status`, `id`, `links`, `supersedes`, `superseded_by`, `last_referenced`, `provenance`, `trust`, `quarantine`, `quarantine_reason`).
- `memory.daily{}` — files under `memory/daily/` and `memory/<domain>/daily/`. Parse each bullet's tag, domain, optional `[external]` flag, date.
- `memory.domains{}` — directories under `memory/` (excluding `daily`, `distillations`, `_index.md`, `commitments.md`). Each is an "earned" domain memory subfolder.
- `memory.commitments[]` — entries from `memory/commitments.md` (status, due, scope).
- `skills.domains{}` — directories under `.cursor/skills/` (excluding `_templates`, `services`). Plugin-distributed framework skills are not project-side.
- `skills.entries[]` — every `SKILL.md`, parse frontmatter (`name`, `description`).
- `services[]` — directories under `.cursor/skills/services/`.
- `code.signals[]` (only if `codebase/` exists, and only when running with `--deep`):
   - top-level `package.json`/`pyproject.toml` deps, framework, entrypoints.
   - architecture-relevant directories (`api/`, `auth/`, `db/`, etc.).

For each `kb.entries[i]` compute a freshness score:

```
freshness = 0.5 ^ ((today − max(updated, last_referenced)) / 14)
```

### 2. Run checks

| ID | Check | Severity |
| --- | --- | --- |
| D1 | `kb.domains` ⊆ `registry.domains` (slugs) | high |
| D2 | `skills.domains` ⊆ `registry.domains` | high |
| D2m | `memory.domains` ⊆ `registry.domains` | high |
| D3 | every `kb.entries[i].domain` is in `registry.domains` | high |
| D3m | every memory daily-note bullet's `domain` tag is in `registry.domains` | medium |
| D4 | every `kb.entries[i].schema` is one of the five schemas | medium |
| D5 | `superseded_by` and `supersedes` are reciprocal | low |
| D6 | no two `concept` entries have the same `id` and conflicting definitions | medium |
| D7 | no active `decision` contradicted by a more recent active `decision` in same domain (look for keyword pairs) | high (advisory) |
| D8 | no `policy` violated by another `policy` (rule conflict) | high |
| D9 | every `service` skill referenced in a domain skill is present in `services/` | medium |
| D10 | every `fieldnote` with `recurrence >= 3` has either a linked `policy` or an open promotion proposal | medium |
| D11 | every active KB entry has `freshness ≥ 0.06` (advisory; 14-day half-life replaces the binary 180-day rule) | low |
| D12 | for each `decision` mentioning a tech choice, codebase reflects it (deep mode only) | high |
| D13 | every active `policy` mentioning code is satisfied by the codebase (deep mode only, advisory) | medium |
| D14 | no KB entry has `quarantine: true` — quarantined entries must be reviewed and cleared | high |
| D15 | no KB entry with `trust: low` and `provenance != direct` is older than 14 days without a `last_referenced` bump (review gate) | medium |
| D16 | every memory `[lesson-candidate]` recurring ≥ 3 days has a fieldnote written or open promotion proposal | medium |
| D17 | every memory `[decision-candidate]` older than 14 days has a `decision` entry or open promotion proposal | medium |
| D18 | no memory entry contradicts an active `policy` or `decision` | high |
| D19 | no commitment is past `due` with no resolution or extension | medium |
| D20 | any domain with ≥ 3 daily entries tagged with it over the last 14 days but no `memory/<domain>/` folder gets an "earn the folder" advisory | low |
| D21 | no daily note is older than 30 days and undistilled | low |

### 3. Build the report

Group by severity. For each item:

```
[D3 / high] kb.entries:knowledge/marketing/launch-plan.md
  domain `marketing` not in registry.
  → Resolution options:
     a) add domain `marketing` via domain-registry skill
     b) move entry to `research/` (closest active parent)
     c) deprecate entry
```

Summarize counts at the top.

### 4. Propose, don't apply

End the report with a list of proposals the user can approve in batch (e.g. "approve a, c, d?"). Never edit files in this skill.

## Output format

```markdown
# Drift scan — <YYYY-MM-DD HH:MM>

## Summary
- 3 high, 2 medium, 4 low
- 1 unscoped domain folder, 0 contradictions, 0 unsatisfied policies, ...

## High
[D3 / high] ...
[D7 / high] ...

## Medium
...

## Low (advisory)
...

## Proposals
1. <action>
2. <action>
```

## Modes

- `--shallow` (default): layers 1–4 only (registry, knowledge, memory, scaffolding).
- `--deep`: includes layer 5 (codebase). Slower; reads dependency manifests and a few key directories.

## Anti-patterns

- Running mutations from this skill. Use `domain-registry`, `knowledge-base`, or `scaffolding-author`.
- Treating advisory (low) items as failures.
- Reporting without proposals.
