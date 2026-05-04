# Memory — index

Memory is the agent's running-state layer of the harness — what the agent has *lived through* this project. It sits beside the worker (`.cursor/`) as the agent's running state, distinct from the worker's *config*. Both together form the harness layer, distinct from the project layer (`knowledge/`, `workspace/`, `codebase/`).

`memory/` is **git-tracked**: cross-machine continuity, PR review as the human gate, and reproducibility all depend on it. It is *not* a business artifact drive (that's `workspace/`).

## Layout

```
memory/
├── _index.md               ← this file
├── daily/
│   └── YYYY-MM-DD.md       ← date-anchored running notes; entries tagged by domain inline
├── commitments.md          ← short-lived dated follow-ups
└── distillations/
    └── YYYY-MM-DD.md       ← audit trail of memory-distill runs (which proposals, which approvals)
```

`memory/<domain>/` may earn a folder via the same "≥ 3 durable artifacts" rule that governs `knowledge/<domain>/` and `.cursor/skills/<domain>/`. Until earned, daily notes stay flat and entries are domain-tagged inline.

## What goes here

| Tag | Lane | Promotes to |
| --- | --- | --- |
| `[observation]` | Live note about something noticed | nothing by default; raw signal for distill |
| `[lesson-candidate]` | A gotcha, surprise, or non-obvious finding worth remembering | `fieldnote` in `knowledge/<domain>/` |
| `[decision-candidate]` | A choice that was made and the alternatives | `decision` in `knowledge/<domain>/` |
| `[concept-candidate]` | A defined object/role/capability emerging from the work | `concept` in `knowledge/<domain>/` |
| `[commitment]` | Short-lived, dated follow-up | `commitments.md` (never durable) |

## What does NOT go here

- Operational artifacts (drafts, PDFs, CSVs, contracts) → `workspace/`.
- Code → `codebase/`.
- Curated ground truth (decisions, policies, specs, definitions, durable lessons) → `knowledge/<domain>/`.
- Skills, rules, hooks → `.cursor/`.

If you write a `[lesson-candidate]` and it gets promoted, the durable home is `knowledge/<domain>/<id>.md`. The note in `memory/daily/` stays as the chronological record.

## Daily-note format

```markdown
---
date: YYYY-MM-DD
session: <cursor-session-id-or-short-tag>
---

- [observation] [engineering] middleware rewrite breaks on `/` paths in next.config
- [decision-candidate] [engineering] use Postgres for primary store; alts: SQLite, Mongo
- [commitment] [marketing] launch copy review by Fri 2026-05-08
- [lesson-candidate] [engineering] never `drizzle push` against prod; use migrate
```

One bullet per signal. Domain tag is required when the entry is domain-relevant. Free-form prose is allowed but discouraged — distill works best when entries are atomic.

## Session lifecycle

| Phase | Required action |
| --- | --- |
| **Session start** | Run `kb-search` over the task; read today's and yesterday's daily notes. |
| **During work** | Append signals to today's daily note as they happen. |
| **Before `/compact`** | Flush in-conversation lessons to today's note (the pre-compact hook handles this when present). |
| **Session end** | Optionally run `/distill` to propose promotions to the KB. |

See `rules/memory.mdc` for the full contract.

## Retention

- Active `daily/` keeps the last 30 days verbatim.
- Older notes are pruned by `memory-distill` after their durable signals have been promoted; git history is the archive.
- `commitments.md` is pruned automatically when entries are resolved or pass their `due` date with no further activity.
- `distillations/` is append-only — it is the audit trail of what was promoted and what was rejected.

## Trust model

- Anything in `memory/` is **agent-suggested**, not authoritative.
- Promotion to `knowledge/` always requires user approval (no auto-apply).
- Items sourced from external content (web fetches, tool output) should be tagged inline as `[external]` so distill can flag them for stricter review.
