# Project Harness

A project‑level (not just code‑level) AI harness for Cursor. It gives a **single repo** the structure, knowledge, and worker scaffolding to operate as an entire **business / project**, with code as one optional component.

> **Scope.** This harness wraps a project. It does **not** modify Cursor's internal harness. It only provides a folder layout, a knowledge schema, and `.cursor/` agent configuration that lets agents work coherently inside that layout.

---

## 1. Conceptual model

A project repo has four conceptual components. Three are folders, one is a process:

| Component | Where | Git | Purpose |
| --- | --- | --- | --- |
| **Knowledge base** | `knowledge/` | tracked | Foundational definitions and ground truth, organized by **project domain** (engineering, brand, product, legal, finance, …). The reference layer. |
| **Workspace** | `workspace/` | **ignored** | Operational artifacts/assets — pdfs, svgs, ai/eps, csvs, mp4s, research reports, contracts, drafts, ad campaigns. The "company drive". |
| **Codebase** *(optional)* | `codebase/` | tracked | Standard code repo, simply nested one level under the project root. CI/CD attaches here. |
| **Worker / agent** | *process* | n/a | The AI agent. Configured via `.cursor/` (rules, skills, agents, commands, hooks). |

Mental rule of thumb:

- **Knowledge** = *what is true / intended*.
- **Workspace** = *what was produced*.
- **Codebase** = *what is shipped (if SaaS)*.
- **`.cursor/`** = *how the worker operates*.

### Why one repo

A business is currently fragmented across Notion / Confluence (knowledge), Drive (artifacts), GitHub (code), and Jira (tasks). Agents lose context at every boundary. This harness collapses the first three into one repo so an agent has full context with no integration tax. Users who prefer external tools can adapt the harness — out of scope here, but the conceptual separation still holds.

---

## 2. Folder structure (seed)

```
.
├── AGENTS.md                  # Top-level instructions every agent reads first
├── README.md
├── .gitignore
├── .cursor/                   # Worker / agent scaffolding (tracked)
│   ├── rules/                 # Always-on behavior (harness, kb, drift, scaffolding)
│   ├── skills/
│   │   ├── _core/             # Self-management skills (harness-level)
│   │   ├── _templates/        # Skill-type templates (service / domain / task)
│   │   ├── services/          # External-service skills
│   │   └── <domain>/          # Project-domain skills (created on demand)
│   ├── agents/                # Subagent configurations
│   ├── commands/              # Slash commands
│   └── hooks/                 # Cursor hooks
├── knowledge/                 # Knowledge base (tracked)
│   ├── _index.md
│   ├── _meta/
│   │   ├── domains.md         # Central domain registry (the project's domain tree)
│   │   ├── glossary.md        # Canonical terms
│   │   └── schemas/           # Document schemas (concept, decision, policy, spec, fieldnote)
│   └── <domain>/              # Domain knowledge (created on demand)
├── workspace/                 # Business artifacts (gitignored)
│   ├── README.md
│   └── <domain>/              # Created on demand
└── codebase/                  # Optional code (tracked, attached to CI/CD)
```

The seed is deliberately thin. **Domain folders are not pre-created** under `knowledge/`, `.cursor/skills/`, or `workspace/` — they appear as the project grows. The single source of truth for "which domains exist and how nested they are" is `knowledge/_meta/domains.md`.

---

## 3. Domains as the central spine

Every component except `workspace/` is organized by **project domain** (engineering, product, brand, legal, finance, marketing, sales, strategy, …). A project's depth across domains is a meaningful signal of complexity.

`knowledge/_meta/domains.md` is the **domain registry**. It is a tree of domains and subdomains plus per-domain status (active / deprecated), purpose, and pointers to where it lives across the harness.

Two layers must stay aligned with the registry:

- `knowledge/<domain>/…`
- `.cursor/skills/<domain>/…`

`workspace/` may follow domain organization for human convenience but is **not required** to mirror the registry — it stores artifacts of any shape.

When the registry changes, a **drift scan** reconciles knowledge, skills, and (optionally) workspace.

---

## 4. Knowledge base

Per-domain documents follow one of five **schemas** (`knowledge/_meta/schemas/`):

| Schema | Use for |
| --- | --- |
| `concept` | A defined idea, capability, or object in the project. |
| `decision` | A decision made, its rationale, and trade-offs. (ADR-style.) |
| `policy` | A rule that constrains future work. |
| `specification` | A formal spec for a product feature, contract clause, brand element, etc. |
| `fieldnote` | Time-stamped lessons, mistakes, surprises, "do this / never do this again". Fuels the memory loop. |

Schema frontmatter includes `id`, `domain`, `status`, `created`, `updated`, `links`. Index files (`_index.md`) live at the root of each domain.

### Memory

We deliberately do **not** build a custom memory store — Cursor's harness already manages session memory. The KB's `fieldnote` schema is the **persistent project memory** layer: durable, auditable, agent-readable observations the harness can reference across sessions.

---

## 5. Workspace

Long-term artifact storage. Always gitignored. Shape and naming are user-driven; agents may organize by domain, project, date, or campaign. The harness includes a `workspace/README.md` describing conventions but does not enforce subfolders.

When an artifact in `workspace/` materially changes the truth of a domain (e.g., a finalized brand guide PDF), the **drift scan** flags that the corresponding `knowledge/<domain>/` entry should be updated — not by tracking the artifact, but by tracking the *implication*.

---

## 6. Codebase

Optional. A standard code repo, nested at `codebase/`. It runs its own tooling (lockfiles, CI, linters). The harness does **not** prescribe a stack. Drift control is light here — it only checks that architectural decisions in `knowledge/engineering/` are not contradicted by `codebase/` (and vice versa).

---

## 7. Agent scaffolding (`.cursor/`)

### Skills — typed and domain-organized

Skills are differentiated by **type** and located by **domain**:

| Type | Purpose | Structure |
| --- | --- | --- |
| **Service skill** | How to use an external service (Stripe, Resend, Vercel, Notion, …). | 1) Context, 2) Connection (CLI / API / MCP), 3) Procedure & status checks, 4) Verification & error handling. |
| **Domain skill** | High-level guidance for a domain — its tools, services, and recurring procedures. | One per domain (`<domain>/_domain/SKILL.md`). |
| **Task skill** | Deterministic procedure for a specific task, often with scripts. | `<domain>/<task-name>/SKILL.md` (+ optional `scripts/`). |

Layout:

```
.cursor/skills/
├── _core/                     # Harness self-management (see §8)
├── _templates/                # service / domain / task scaffolds for skill-author
├── services/<service>/SKILL.md
└── <domain>/
    ├── _domain/SKILL.md       # The domain skill (optional)
    └── <task>/SKILL.md        # Task skills under their domain
```

### Rules

Always-on behavioral rules live in `.cursor/rules/`. The seed ships with:

- `harness.mdc` — what this repo *is*, and the four-component model.
- `domains.mdc` — how to read/write the domain registry; how to decide on new domains.
- `knowledge-base.mdc` — when and how to write KB entries; schema usage.
- `skills-organization.mdc` — service / domain / task typing and placement.
- `scaffolding.mdc` — the self-scaffolding decision protocol.
- `drift-control.mdc` — drift definitions and the reconciliation protocol.

### Subagents, commands, hooks

- `agents/` — subagent configs created on demand (the harness ships none in the seed).
- `commands/` — `/audit`, `/drift-scan`, `/kb-add` for quick invocation of core skills.
- `hooks/` — empty by default; users add their own.

---

## 8. Self-adaptive behavior

The harness must **evolve with the project**. Five core skills under `.cursor/skills/_core/` carry the self-adaptive logic:

| Skill | Responsibility |
| --- | --- |
| `domain-registry` | Read / mutate `knowledge/_meta/domains.md`. Decide when to add, split, deprecate, or rename a domain. |
| `knowledge-base` | Create / update / prune KB entries per schema. Detect duplicates, contradictions, stale entries. |
| `drift-scan` | Detect drift between `knowledge` ↔ `.cursor/skills` ↔ `codebase` ↔ (lightly) `workspace`. Produce a reconciliation report. |
| `scaffolding-author` | Author new skills (service / domain / task), decide skill type, decide placement, decide when to spawn a subagent vs. a skill. |
| `harness-audit` | Periodic holistic review combining the above; recommends restructures (upscale / downscale / merge / deprecate). |

### Decision questions the harness asks itself

These guide the core skills:

- *Skill creation:* "Does a task repeat? Have we fallen for the same trap twice? Could a script encode it? Does it belong as a service / domain / task skill?"
- *Skill maintenance:* "Is any skill outdated, deprecated, redundant, or scope-overlapping?"
- *Subagent creation:* "Is there a coherent role with its own tools and a measurable success signal? Or is this just a skill?"
- *Domain creation:* "Have ≥ N (default 3) durable artifacts of similar nature accumulated? Is there a clear scope boundary? Does an existing domain already cover it?"
- *Domain pruning:* "Has anything been written here in M months? Are its docs contradicted elsewhere?"
- *Knowledge writes:* "Is this a `decision` (one-time, why), `policy` (rule), `concept` (definition), `spec` (formal), or `fieldnote` (lesson)?"
- *Drift:* "Does any KB entry contradict the codebase, a skill, or another KB entry? If so, which is canonical, and what is the resolution?"

User involvement is the brake: the harness **proposes** restructures and KB writes; the user **confirms** structural changes (new domain, new subagent, deletions). Routine writes (fieldnotes, skill scaffolds) can be automatic per project preference.

---

## 9. Version control strategy

| Path | Tracked? | Why |
| --- | --- | --- |
| `knowledge/` | yes | Changes in intent / ground truth must be auditable. |
| `.cursor/` | yes | Worker configuration is part of the project. |
| `codebase/` | yes | Standard code VCS. CI/CD attaches here, not at root. |
| `workspace/` | **no** | Operational artifacts; lifecycle and size make tracking inappropriate. |
| `workspace/.gitkeep` | yes | So the directory exists on clone. |

A change to `knowledge/<domain>/` is a meaningful event — analogous to how a code change is a meaningful event. Reviewing diffs of the KB is how the project reviews its own thinking.

---

## 10. Installing this harness in a new project

This repo is a **template**. Three install paths:

```bash
# 1. degit (fastest, no git history)
npx degit <owner>/ai-harness my-new-project

# 2. git clone + reset
git clone <owner>/ai-harness my-new-project
cd my-new-project && rm -rf .git && git init

# 3. as a git template repo (GitHub UI: "Use this template")
```

After install, run the bootstrap interactively:

```
> /audit
```

The audit skill performs a first-time-setup pass: confirms project name & description, asks which domains to seed, and writes a starter `knowledge/_meta/domains.md`.

See `bundles/manifest.md` for what the seed includes.

---

## 11. Out of scope

- Custom memory infrastructure (Cursor handles session memory; KB `fieldnote` handles persistent memory).
- External-tool sync (Notion / Confluence / Drive integrations).
- Code-level CI/CD opinions inside `codebase/`.
- Multi-repo or polyrepo project layouts.

---

## 12. Further reading

- `AGENTS.md` — top-level instructions all agents read first.
- `.cursor/rules/` — the rule set.
- `knowledge/_meta/domains.md` — the live domain registry.
- `knowledge/_meta/schemas/` — the five document schemas.
- `bundles/manifest.md` — packaging manifest.
