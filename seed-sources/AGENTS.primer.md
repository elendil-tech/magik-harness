> **Harness primer.** This is a normal code repo wired to [magik-repo](https://github.com/codeisalifestyle/magik-repo-plugin) — a light harness. Two external services back the agent: a **knowledge base** (the project's human-authored ground truth) and **memory** (the agent's running log). Both live in an external vault pointed to by `.cursor/harness.json`.

## How it's wired

- `.cursor/harness.json` (tracked) names the `vault` and the `knowledge` / `memory` mounts. Resolve it, expand a leading `~`, and reach each store at `join(vault, mount)` for `accessVia: path`, or via MCP for `accessVia: mcp`.
- **Knowledge base** = ground truth: decisions, policies, specs, project/business context. Human-authored.
- **Memory** = the agent's log of what happened and was learned. Agent-owned.
- If a store is unreachable, say so and proceed with what you have — never block. If the manifest is absent, the repo isn't harnessed: offer `/magik-repo-setup`.

## The rules (there are only three)

1. **Read the KB before substantive work.** Before producing, modifying, or committing anything domain-relevant, run the `kb-search` skill over the task. Your training priors are not this project's ground truth. If an active policy would be violated, stop and surface it. Skipping this because "I already know" is the failure mode this harness exists to catch.
2. **Keep the KB in sync — at the autonomy the manifest grants.** It's human-authored ground truth; `knowledge.autonomy` in `.cursor/harness.json` (default **`open`**) tunes how freely you write it on your own initiative. `open`: keep the KB in step with your work as you go — add/update the entries your task touches, no permission needed — surfacing only large or destructive restructurings. `ask`: write only on request or an approved `/magik-repo-kb-sanitize` / `/magik-repo-kb-code-sync` proposal. `readonly`: report, never write. Whatever the setting, never silently reorganize structure or rewrite others' entries. See `knowledge-base`.
3. **Memory is yours; the KB is theirs.** Write observations and lessons to today's `memory/daily/<date>.md` as they surface. Never auto-promote memory into the KB — find past notes later with your own search. Durable, shared truth belongs in the KB, not memory; if a memory note should become ground truth, offer to record it in the KB instead.

## Commands

- `/magik-repo-setup` — point this repo at a vault (interactive).
- `/magik-repo-kb-sanitize` — heal the KB from the inside (conflicts, legacy remnants, links).
- `/magik-repo-kb-code-sync` — check the KB against the code.

## Rules to request on demand

- `harness` — the operating model, manifest resolution, the three rules.
- `knowledge-base` — how to read and maintain the KB (and what `knowledge.autonomy` permits); the structure floor.
- `memory` — the agent-owned log, capture cadence, why memory never auto-promotes.
