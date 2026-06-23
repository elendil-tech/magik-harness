> **Harness primer.** This is a normal code repo wired to [magik-repo](https://github.com/codeisalifestyle/magik-repo-plugin) — a light harness. Two external services back the agent: a **knowledge base** (the project's tracked, human-authored ground truth) and **memory** (the agent's gitignored running log). Both live in an external vault pointed to by `.cursor/harness.json`.

## How it's wired

- `.cursor/harness.json` (tracked) names the `vault` and the `knowledge` / `memory` mounts. Resolve it, expand a leading `~`, and reach each store at `join(vault, mount)` for `accessVia: path`, or via MCP for `accessVia: mcp`.
- **Knowledge base** = ground truth: decisions, policies, specs, project/business context. Git-tracked. Human-authored.
- **Memory** = the agent's log of what happened and was learned. Gitignored. Agent-owned.
- If a store is unreachable, say so and proceed with what you have — never block. If the manifest is absent, the repo isn't harnessed: offer `/magik-repo-setup`.

## The rules (there are only three)

1. **Read the KB before substantive work.** Before producing, modifying, or committing anything domain-relevant, run the `kb-search` skill over the task. Your training priors are not this project's ground truth. If an active policy would be violated, stop and surface it. Skipping this because "I already know" is the failure mode this harness exists to catch.
2. **Don't silently restructure the KB.** It's human-authored. Read it always; write or reshape it **only when the user asks**, or when they approve a `/magik-repo-kb-sanitize` / `/magik-repo-kb-code-sync` proposal. Adding an entry the user requested is fine; quietly reorganizing or rewriting entries is not.
3. **Memory is yours; the KB is theirs.** Write observations and lessons to today's `memory/daily/<date>.md` as they surface. Never auto-promote memory into the KB — find past notes later with your own search. Memory is gitignored by design; if asked to commit/share it, redirect the durable content to the KB instead.

## Commands

- `/magik-repo-setup` — point this repo at a vault (interactive).
- `/magik-repo-kb-sanitize` — heal the KB from the inside (conflicts, legacy remnants, links).
- `/magik-repo-kb-code-sync` — check the KB against the code.

## Rules to request on demand

- `harness` — the operating model, manifest resolution, the three rules.
- `knowledge-base` — how to read and (when asked) write the KB; the structure floor.
- `memory` — the agent-owned log, capture cadence, why memory never auto-promotes.
