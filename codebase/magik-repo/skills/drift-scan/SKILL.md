---
name: drift-scan
description: >-
  Detect and report drift across the four harness layers — domain registry,
  knowledge base, agent scaffolding, and (optionally) codebase. Produces a
  triage report with severity and proposed resolutions. Use on demand, after
  large KB writes, after registry changes, or as part of /audit.
---

# Drift scan

Drift = two layers that should agree, disagreeing. This skill produces a structured report of drift items and suggested resolutions. It does **not** mutate state; resolutions are proposals.

## Layers

1. **Registry** — `knowledge/_meta/domains.md`
2. **Knowledge** — `knowledge/<domain>/`
3. **Scaffolding** — `.cursor/skills/<domain>/`, `.cursor/rules/`, `.cursor/agents/`
4. **Codebase** — `codebase/` (only if present)

`workspace/` is excluded from drift control.

## Procedure

### 1. Build the inventory

Collect:

- `registry.domains[]` — slugs, status, paths, subdomains.
- `kb.domains{}` — directories under `knowledge/` (excluding `_meta`).
- `kb.entries[]` — every `*.md` not under `_meta`, parse frontmatter (`schema`, `domain`, `status`, `id`, `links`, `supersedes`, `superseded_by`).
- `skills.domains{}` — directories under `.cursor/skills/` (excluding `_templates`, `services`). Plugin-distributed framework skills are not project-side.
- `skills.entries[]` — every `SKILL.md`, parse frontmatter (`name`, `description`).
- `services[]` — directories under `.cursor/skills/services/`.
- `code.signals[]` (only if `codebase/` exists, and only when running with `--deep`):
   - top-level `package.json`/`pyproject.toml` deps, framework, entrypoints.
   - architecture-relevant directories (`api/`, `auth/`, `db/`, etc.).

### 2. Run checks

| ID | Check | Severity |
| --- | --- | --- |
| D1 | `kb.domains` ⊆ `registry.domains` (slugs) | high |
| D2 | `skills.domains` ⊆ `registry.domains` | high |
| D3 | every `kb.entries[i].domain` is in `registry.domains` | high |
| D4 | every `kb.entries[i].schema` is one of the five schemas | medium |
| D5 | `superseded_by` and `supersedes` are reciprocal | low |
| D6 | no two `concept` entries have the same `id` and conflicting definitions | medium |
| D7 | no active `decision` contradicted by a more recent active `decision` in same domain (look for keyword pairs) | high (advisory) |
| D8 | no `policy` violated by another `policy` (rule conflict) | high |
| D9 | every `service` skill referenced in a domain skill is present in `services/` | medium |
| D10 | every `fieldnote` with `recurrence >= 3` has either a linked `policy` or an open promotion proposal | medium |
| D11 | every active KB entry updated within 180 days (advisory) | low |
| D12 | for each `decision` mentioning a tech choice, codebase reflects it (deep mode only) | high |
| D13 | every active `policy` mentioning code is satisfied by the codebase (deep mode only, advisory) | medium |

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

- `--shallow` (default): layers 1–3 only.
- `--deep`: includes layer 4 (codebase). Slower; reads dependency manifests and a few key directories.

## Anti-patterns

- Running mutations from this skill. Use `domain-registry`, `knowledge-base`, or `scaffolding-author`.
- Treating advisory (low) items as failures.
- Reporting without proposals.
