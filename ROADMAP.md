# Roadmap

What `magik-repo` does **not** ship today, grouped by theme. The CHANGELOG is the canonical record of what is shipped; this file captures what is deliberately deferred and why.

v1.0 is intentionally minimal — a pointer plus a janitor. The roadmap is mostly *optional power layers* on top of that floor, not core obligations.

## KB-structure templating (future)

- **Starter KB templates per project type.** `/magik-repo-setup` today scaffolds an empty `knowledge/_index.md`. A future layer could offer opinionated starting structures (e.g. SaaS, agency, library) — folders + seed entries the user can accept or ignore. Kept out of 1.0 to preserve the "harness is agnostic to KB structure" principle; templating must be opt-in and easy to discard.
- **`_index.md` auto-maintenance.** `/magik-repo-kb-sanitize` flags `_index.md` drift; a future option could regenerate the orientation map from the KB's actual shape on approval.

## Skill layer (future)

- **Skill templating.** Help users author project-specific skills (service / domain / task) with a guided scaffold — the capability the old `scaffolding-author` skill provided, reimagined as an opt-in helper rather than part of the core harness.
- **Skill-efficacy evals.** A way to score whether a user's authored skills actually change agent behavior. Lets users tune their own skills with real signal. (v1.0 removed the in-repo behavioral eval suite — see CHANGELOG — so this would be a fresh, opt-in capability rather than a revival of the old runner.)

## Memory (incremental)

- **Memory retention/pruning.** Memory grows unbounded. A future helper could summarize or prune old `memory/daily/` notes on request (never automatically — memory is the agent's, and pruning is destructive).
- **MCP-backed memory adapter.** `accessVia: mcp` is carried in the schema, but `/magik-repo-setup` only writes the manifest — wiring a remote memory store is left to the user's MCP config. A reference adapter could ship later if demand is clear.

## Setup rigor

- **JSON-merge for `.cursor/hooks.json`.** Today `/magik-repo-setup` skips seeding `hooks.json` when one exists and prints a notice. A proper JSON-merge that adds the `sessionStart` entry while preserving user hooks is a candidate follow-up.
- **Per-machine vault override UX.** The manifest supports a gitignored `.cursor/harness.local.json` override conceptually; first-class `/magik-repo-setup` support for setting one is deferred.
