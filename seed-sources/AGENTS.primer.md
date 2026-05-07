> **Project Harness primer.** This project uses [magik-repo](https://github.com/codeisalifestyle/magik-repo-plugin) — a five-component layout with knowledge, memory, workspace, codebase, and worker scaffolding in a single repo.

## Five components

**Project layer:**

1. `knowledge/` — *what is true / intended* — interpretations, ground truth (git tracked).
2. `codebase/` — *what is shipped* (git tracked, nested code repo; may be empty).
3. `workspace/` — *what was produced* — craft artifacts: drafts, PDFs, media (git ignored, runtime-personal).

**Harness layer:**

4. `.cursor/` — *how you operate* — rules, skills, agents, commands, hooks (git tracked).
5. `memory/` — *what the agent has lived through this session* — thought artifacts: daily notes, commitments, distillations (git ignored, runtime-personal — created on first write).

One rule covers the split: **tracked = the durable substrate we agree on, build, and ship; ignored = agent-runtime output**. `workspace/` is craft, `memory/` is thought. Neither syncs across machines or contributors; anything that needs to cross runtimes goes through promotion to `knowledge/` (for memory) or stays the team's discretion (for workspace).

The single source of truth for project domains is `knowledge/_meta/domains.md`. Read it before any domain-relevant work.

## Organize like a human (the five principles)

Folder management — adding, renaming, merging, splitting, deprecating any unit under `knowledge/`, `.cursor/skills/<domain>/`, or an earned `memory/<domain>/` — is **judged contextually**, not by counts. Every structural proposal answers all five principles in writing, and the user approves:

1. **Coherence** — items belong together because they share *concepts*, not just tags.
2. **Boundary** — the unit can be defined in one sentence, including what it *excludes*.
3. **Granularity** — matches the granularity of sibling units at the same level.
4. **Persistence** — still makes sense in 6 months. Project-shaped concerns are *tags*, not folders.
5. **Discoverability** — naming and placement help a fresh contributor, not just satisfy tidiness.

Numeric signals (e.g., "≥ 3 tagged entries", recurrence counts) are *prompts* to evaluate via the principles — never verdicts on their own. The five operations (Add / Rename / Merge / Split / Deprecate) are owned by the `domain-registry` skill; single-skill creation and subagent authoring stay in `scaffolding-author`. See `rules/scaffolding.mdc` and `rules/domains.mdc`.

**Spinal binding:** KB entries and *domain* skills sync strictly to the registry — every `knowledge/<x>/` and `.cursor/skills/<x>/` (domain skill) folder must correspond to an active slug. Service skills (`.cursor/skills/services/<service>/`) and task skills follow their own taxonomies; they don't sync.

**Cross-domain content:** prefer `applies_to:` + `links:` on a primary-owner entry (Pattern A); use a project tag for transient cross-cutting concerns (Pattern B); reserve a meta-domain folder (Pattern C — e.g., `compliance/`) only when no single domain is the natural owner, the concern persists, and it passes all five principles independently.

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

A task that skips step 2 is in violation of the harness contract. "Reading" a file means **invoking a Read tool** on it; recalling its contents from prior context does not count.

## Mandatory protocols (executable, not advisory)

The three protocols below are non-negotiable. Each one names a failure mode that a previous eval run actually caught — they exist because the agent has slipped on them.

### 1. Tool-truthful narration

Every claim of action MUST correspond to a tool invocation in the same turn.

- ✗ "I've set up the marketing domain."
- ✗ "Added the entry to memory."
- ✗ "Updated the registry."
- ✓ A `Write` / `Edit` / `Read` tool call that *actually performed* the work, followed by a confirmation referencing it.

If you have not yet invoked the tool, write **"Proposed:"** or **"Plan:"** — never past tense. Past-tense narration without a corresponding tool invocation is a contract violation.

### 2. Propose-then-apply for structural change

Adding / removing / renaming a domain, subagent, skill folder, or rule = **two-turn flow**.

The trigger is the *intent*, not the verb. Phrasings like "set things up for X", "start working on X", "add X to the harness", "let's track X going forward" — when X is a new domain or new structural piece — all require the two-turn flow. Read the user message for what would actually change, not for whether they said "propose" or "apply".

Shape:

```
Turn N (propose):
  Your VERY FIRST output must begin with the heading "## Proposed change".
  No conversational preamble before it. List every concrete edit:
    - Add domain `marketing` to knowledge/_meta/domains.md
    - Create knowledge/marketing/_index.md
    - Create workspace/marketing/

  End with: "Apply? (yes / amend / cancel)"

  Do NOT invoke Write / Edit in this turn. Even reading the
  registry to inform the proposal is fine, but no mutations.

Turn N+1 (apply, only after explicit "yes" / "go ahead" / "do it"):
  <actually invoke Write / Edit on each item; confirm by listing the
  files written, taken from the structured tool output, not narrated>
```

A single turn that *both* proposes *and* claims to apply is invalid. So is a turn that applies without a prior proposal.

`fieldnote` writes and `[lesson-candidate]` memory captures are routine — they don't require the propose-then-apply flow. Anything else structural does.

### 3. Memory-first for in-conversation signals

When the user articulates a lesson, observation, decision, or policy *during a conversation*:

1. Write it to today's `memory/daily/<YYYY-MM-DD>.md` **as it surfaces**, with the appropriate tag (`[lesson-candidate]`, `[observation]`, `[decision-candidate]`, `[policy-candidate]`, `[commitment]`) and a domain tag.
2. Do **not** fast-path the same signal directly to `knowledge/<domain>/` or `.cursor/rules/` — the promotion path is `memory/daily/` → `/distill` proposal → user approval → `knowledge/<domain>/`.
3. The "as it surfaces" cadence is per-turn, not per-conversation. If three lessons surface across three turns, three separate writes happen.

Direct `knowledge/<domain>/` writes are reserved for cases where the user is explicitly authoring a KB entry (e.g. "let's add a fieldnote for X"). In-conversation signals always stage in memory first.

## Default behavior

- Place artifacts under `workspace/`, never at repo root.
- Place code under `codebase/`, never at repo root.
- Capture observations and lessons live in today's `memory/daily/<YYYY-MM-DD>.md`. Promotion to `knowledge/` happens via `/distill` with user approval.
- Before `/compact`, flush in-conversation lessons to today's daily note.
- Propose structural changes (new domain, new subagent, deletions, memory promotions). Never silently apply them.
