# AGENTS.md

You are operating inside a **project harness** — a single repo that contains an entire project's knowledge, artifacts, optional code, and worker configuration. Read `README.md` once for the conceptual model. This file is the operating contract.

## The four components

1. **`knowledge/`** — *what is true / intended* (git tracked).
2. **`workspace/`** — *what was produced* (git ignored, shaped freely).
3. **`codebase/`** — *what is shipped* (optional, standard code repo, git tracked).
4. **`.cursor/`** — *how you operate* (rules, skills, agents, commands, hooks; tracked).

Domains (engineering, product, brand, legal, finance, marketing, sales, strategy, …) are the spine. The single source of truth for which domains exist is `knowledge/_meta/domains.md`.

## Default behavior

- **Always read `knowledge/_meta/domains.md` first** when starting work that touches a domain. Treat anything outside the registry as an unscoped concept.
- **Reference `knowledge/<domain>/`** before producing domain-relevant work. If ground truth is missing, propose a `concept`, `decision`, `policy`, `specification`, or `fieldnote` entry (see `knowledge/_meta/schemas/`).
- **Consult `knowledge/_meta/subdomain-catalogue.md`** before proposing a subdomain split. The catalogue is advisory; subdomains earn their folder via the same threshold (≥ 3 durable artifacts).
- **Place artifacts under `workspace/`** — never at repo root, never inside `knowledge/`.
- **Place code under `codebase/`** — never at repo root.
- **`.cursor/skills/`** is typed: `services/<service>/`, `<domain>/_domain/`, `<domain>/<task>/`. Don't drop skills at the top level.
- **Capture lessons as `fieldnote` entries** when you make a non-trivial mistake, find a non-obvious gotcha, or repeat the same fix. This is the project's persistent memory.

## Subagents

Subagents are **domain-shaped by default** — `marketing-agent`, `sales-agent`, `engineering-agent`. Conceptually each is a human worker hired for that domain. They inherit:

- read access to `knowledge/<domain>/`, `knowledge/_meta/`, `.cursor/skills/<domain>/`, services
- write access to `knowledge/<domain>/` (entries) and `workspace/<domain>/`
- codebase access read-only (engineering agent: read-write inside `codebase/`)

Cross-domain work and structural harness changes stay with the main agent. See `.cursor/rules/subagents.mdc`.

## When in doubt

Use the **core skills** in `.cursor/skills/_core/`:

- `domain-registry` — anything about adding / renaming / deprecating a domain.
- `knowledge-base` — writing, updating, or pruning KB entries.
- `drift-scan` — when knowledge, skills, codebase, or workspace appear to disagree.
- `scaffolding-author` — when authoring a new skill or considering a subagent.
- `harness-audit` — periodic holistic review (or first-time setup).

Slash commands wrap these: `/audit`, `/drift-scan`, `/kb-add`.

## Rules of engagement

- **Propose structural changes; do not make them silently.** New domains, deletions, subagents, or large refactors of the registry need user confirmation.
- **Routine writes are fine.** Fieldnotes, schema-conformant KB updates, skill scaffolding from templates can proceed without confirmation unless the user has set otherwise.
- **Keep templates thin.** Do not pre-create domain folders the project has not earned. A domain exists when it has accumulated content (≥ 3 durable artifacts is a useful default).
- **Memory:** rely on Cursor's session memory for short-term context; rely on `knowledge/<domain>/_fieldnotes/` (or top-level `fieldnote` entries) for persistent memory.

## Git policy

- `knowledge/` and `.cursor/` are tracked and reviewed.
- `codebase/` is tracked under its own conventions; CI/CD attaches here, not at repo root.
- `workspace/` is gitignored. Never add it back unless explicitly asked.

## What this repo is *not*

- A meta project about itself. Domains are *project domains* (engineering, brand, etc.), not harness components.
- A container for code only. Code is one optional component.
- An external-service replacement. Notion / Drive / Jira can still be used; the harness does not enforce their absence.
