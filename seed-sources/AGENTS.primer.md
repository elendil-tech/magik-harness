> **Project Harness primer.** This project uses [magik-repo](https://github.com/codeisalifestyle/magik-repo-plugin) — a five-component layout with knowledge, memory, workspace, codebase, and worker scaffolding in a single repo.

## Five components

**Project layer:**

1. `knowledge/` — *what is true / intended* (git tracked).
2. `workspace/` — *what was produced* — operational artifacts (git ignored).
3. `codebase/` — *what is shipped* (git tracked, nested code repo; may be empty).

**Harness layer:**

4. `memory/` — *what the agent has lived through* — daily notes, commitments, distillation audit trail (git tracked).
5. `.cursor/` — *how you operate* — rules, skills, agents, commands, hooks.

The single source of truth for project domains is `knowledge/_meta/domains.md`. Read it before any domain-relevant work.

## Available rules (request on demand)

The harness ships eight `.mdc` rules — request the one whose description fits the task:

- `harness` — the five-component model and hard rules.
- `domains` — how to read / propose changes to the domain registry.
- `knowledge-base` — when and how to write KB entries (five schemas).
- `memory` — the agent-writable short-term lane, session lifecycle, compaction safety, promotion contract.
- `skills-organization` — service / domain / task skill typing and placement.
- `scaffolding` — when to add a skill, subagent, or domain.
- `drift-control` — drift definitions and reconciliation protocol across the five layers.
- `subagents` — domain-shaped subagent contract.

## First-use checklist

1. Run `/init-harness` if `AGENTS.md` lacks the harness primer block — it is idempotent and safe to re-run.
2. Run `/audit` to pick starting domains and seed the registry.
3. Use `/kb-add` to write KB entries, `/distill` to consolidate memory into the KB, `/drift-scan` to reconcile drift.

## Read first (mandatory before substantive work)

Before any task that produces, modifies, or commits content:

1. `knowledge/_meta/domains.md` — what domains exist.
2. **Run `kb-search` over the task description.** Read every active `decision`, `policy`, or `specification` it surfaces. If a `policy` would be violated, stop and surface the conflict before proceeding.
3. Scan today's and yesterday's `memory/daily/*.md` and `memory/commitments.md` for unflushed context.
4. Relevant `.cursor/skills/<domain>/` — domain & task skills available.

A task that skips step 2 is in violation of the harness contract.

## Default behavior

- Place artifacts under `workspace/`, never at repo root.
- Place code under `codebase/`, never at repo root.
- Capture observations and lessons live in today's `memory/daily/<YYYY-MM-DD>.md`. Promotion to `knowledge/` happens via `/distill` with user approval.
- Before `/compact`, flush in-conversation lessons to today's daily note.
- Propose structural changes (new domain, new subagent, deletions, memory promotions). Never silently apply them.
