> **Harness primer.** This is a normal code repo wired to [magik-repo](https://github.com/codeisalifestyle/magik-repo-plugin) — a light harness. Two external services back the agent: a **knowledge base** (the project's ground truth) and **memory** (the running log). Both live in an external vault pointed to by `.cursor/harness.json`.

## How it's wired

- `.cursor/harness.json` (tracked) names the `vault` and the `knowledge` / `memory` mounts. Resolve it, expand a leading `~`, and reach each store at `join(vault, mount)` for `accessVia: path`, or via MCP for `accessVia: mcp`.
- **Knowledge base** = ground truth: decisions, policies, specs, project/business context. Maintained at the level `knowledge.autonomy` grants.
- **Memory** = the running log of what happened and was learned. Written freely as work happens.
- If a store is unreachable, say so and proceed with what you have — never block. If the manifest is absent, the repo isn't harnessed: offer `/magik-repo-setup`.

## The rules (there are four)

1. **Gather full context before substantive work.** Before producing, modifying, or committing anything domain-relevant, run the `kb-search` skill — but the KB is the *start* of context, not the end. It states what *should* be true; corroborate it against the code (what the system actually does) and the live state of dependent services (read-only), and act on reality where they diverge. Your training priors are not this project's ground truth, and a stale KB isn't either. If an active policy would be violated, stop and surface it. Skipping this — or stopping at a KB search alone — is the failure mode this harness exists to catch.
2. **Keep the KB in sync — at the autonomy the manifest grants.** It's ground truth; `knowledge.autonomy` in `.cursor/harness.json` (default **`open`**) tunes how freely you write it on your own initiative. `open`: keep the KB in step with your work as you go — add/update the entries your task touches, no permission needed — surfacing only large or destructive restructurings. `ask`: write only on request or an approved `/magik-repo-kb-sanitize` / `/magik-repo-kb-code-sync` proposal. `readonly`: report, never write. Whatever the setting, never silently reorganize structure or rewrite entries wholesale. See `knowledge-base`.
3. **Memory is for recency; the KB is for durable truth.** Write observations and lessons to today's `memory/daily/<date>.md` as they surface. Never auto-promote memory into the KB — find past notes later with your own search. Durable, shared truth belongs in the KB, not memory; if a memory note should become ground truth, offer to record it in the KB instead.
4. **Close the agentic loop.** Orient → strategize → implement → verify → (human-in-the-loop if taste) → ship → **KB sync** → clean up. Completion means merged, CI/ship gates held, knowledge updated, and the workspace reset/tidy — not “code written.” Ship includes watching CI, fixing failures, then merging (fix-forward if post-merge integration fails). Taste/creative work (design, copy, brand, front-end look) raises an approval gate — often with 2–3 drafts and back-and-forth — before shipping. Programmatically verifiable work does not wait on a human. After merge, update durable KB entries the work touched. **Resolve code and vault/KB merge conflicts in-loop** (during ship and KB sync), not as a later chore. **Multi-machine & worktree synchronicity:** orient on start (`git pull --ff-only` if behind), cloud-save on pause (WIP commit `git commit -m "wip: <checkpoint> [skip ci]"` + push to origin), and never use global `git stash` across worktrees. Cleanup: tear down ephemeral worktrees; on the primary checkout, return to the integration branch (`develop`/`main`) and sync with remote. See `agentic-work` / `agentic-e2e-loop`.

## Commands

- `/magik-repo-setup` — point this repo at a vault (interactive).
- `/magik-repo-kb-sanitize` — heal the KB from the inside (conflicts, legacy remnants, links).
- `/magik-repo-kb-code-sync` — check the KB against the code.

## Rules to request on demand

- `harness` — the operating model, manifest resolution, the four rules.
- `knowledge-base` — how to read and maintain the KB (and what `knowledge.autonomy` permits); the structure floor.
- `memory` — the running log, capture cadence, why memory never auto-promotes.
- `agentic-work` — E2E loop, verification cadence, HITL gate for taste vs programmatic work.
