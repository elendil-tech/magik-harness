> **Project Harness primer.** This project uses [magik-repo](https://github.com/codeisalifestyle/magik-repo) — a four-component layout with knowledge, workspace, codebase, and worker scaffolding in a single repo.

## Four components

1. `knowledge/` — *what is true / intended* (git tracked).
2. `workspace/` — *what was produced* (git ignored).
3. `codebase/` — *what is shipped* (git tracked, nested code repo; may be empty).
4. `.cursor/` — *how you operate* (rules, skills, agents, commands, hooks).

The single source of truth for project domains is `knowledge/_meta/domains.md`. Read it before any domain-relevant work.

## Available rules (request on demand)

The harness ships seven `.mdc` rules — request the one whose description fits the task:

- `harness` — the four-component model and hard rules.
- `domains` — how to read / propose changes to the domain registry.
- `knowledge-base` — when and how to write KB entries (five schemas).
- `skills-organization` — service / domain / task skill typing and placement.
- `scaffolding` — when to add a skill, subagent, or domain.
- `drift-control` — drift definitions and reconciliation protocol.
- `subagents` — domain-shaped subagent contract.

## First-use checklist

1. Run `/init-harness` if `AGENTS.md` lacks the harness primer block — it is idempotent and safe to re-run.
2. Run `/audit` to pick starting domains and seed the registry.
3. Use `/kb-add` to write KB entries; `/drift-scan` to reconcile drift.

## Default behavior

- Place artifacts under `workspace/`, never at repo root.
- Place code under `codebase/`, never at repo root.
- Capture lessons as `fieldnote` entries in the relevant `knowledge/<domain>/`.
- Propose structural changes (new domain, new subagent, deletions). Never silently apply them.
