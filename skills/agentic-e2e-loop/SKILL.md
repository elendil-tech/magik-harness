---
name: agentic-e2e-loop
description: >-
  Full end-to-end agentic work loop for harnessed repos: gather context (kb-search),
  strategize, implement, verify locally (programmatic or human-in-the-loop for taste),
  ship (commit/push/merge/CI), sync the knowledge base, and clean up. Applies in
  Cursor IDE, Orca worktrees, and any other agent surface — not tied to a specific
  orchestrator. Use whenever starting or closing substantive work so the loop
  always completes.
---

# Agentic E2E loop (magik-repo)

Completion means **merged + KB updated + cleaned up**, not “code written.” This loop
applies whether you are in the primary Cursor IDE chat, an Orca worktree agent, or
any other agent surface that uses this harness.

## Loop

```
1. Orient       kb-search — KB + code + live services (rule 1)
2. Strategize   how to tackle the work for *this* project + sound engineering practice
3. Implement    scoped change only
4. Verify       always — cadence is the agent's call (as-you-go for large work;
                end-loaded for small). See Verification below.
5. HITL gate    only when taste/creative — raise approval; drafts + back-and-forth OK
6. Ship         commit → push → PR → merge → confirm CI green
                (resolve code merge conflicts as part of shipping — not afterthought)
7. KB sync      update durable knowledge/docs so the vault matches what landed
                (resolve vault/KB merge conflicts as part of sync — not afterthought)
8. Clean up     worktrees, ephemeral stacks, temp branches — leave the workspace tidy
```

## Verification

### Programmatic (no human required)

Use when the outcome is objectively checkable: unit/integration/e2e tests, typecheck,
lint, local stacks, health checks, deterministic assertions. Run these autonomously.
Do not block on a human for green checks.

### Human-in-the-loop (required)

Raise an **approval gate** to the human when work involves taste or human representation:

- visual / product design
- brand, positioning, voice
- marketing or product copy
- front-end visual decisions
- anything that represents the human or their brand

For creative work: produce **2–3 drafts** (or variants), summarize differences, and
**wait for explicit approval or steering**. Expect a back-and-forth until approved —
that is part of the loop, not a failure. After approval, still run programmatic checks
before shipping.

Programmatically verifiable tasks skip the HITL gate.

## Merge conflict resolution (code + KB)

Resolving merge conflicts is **in-loop work**, not a follow-up. Parallel agents,
worktrees, and vault checkouts make conflicts expected.

### During Ship (code repo)

When rebase/merge/PR integration hits conflicts in the **code** repo:

1. Treat conflict resolution as part of step 6 — do not declare ship complete while
   conflict markers or an unfinished merge/rebase remain.
2. Prefer integrating against the project's integration branch (`develop` / `main`)
   with a normal merge or rebase; fix conflicts with full context (kb-search + the
   conflicting change's intent), re-run verification, then continue the PR/merge.
3. Never leave half-merged trees or “someone else can fix conflicts” as the close-out.

### During KB sync (vault)

When the vault is versioned (its own git remote) and pull/rebase/PR on the KB hits
conflicts:

1. Treat conflict resolution as part of step 7 — same bar as code.
2. Pull/rebase onto the vault’s integration branch (often `master` / `main`) before
   or while publishing; resolve entry conflicts so living surfaces stay coherent
   (`knowledge-base` / `kb-conventions`); re-check links/`_index.md` if touched.
3. Parallel Orca worktrees with independent vault checkouts must not clobber each
   other: publish via the vault’s normal git workflow; resolve conflicts instead of
   force-pushing over peers.

If a conflict is truly judgment-heavy (competing product decisions), surface it —
but mechanical and obvious resolutions stay autonomous.

## KB sync (after ship)

Before treating the task as closed, bring the knowledge base (and any project docs that
are ground truth) in line with what actually shipped:

1. Identify entries touched by the work (specs, policies, architecture, runbooks, glossary).
2. Update or add them per `knowledge.autonomy` and `rules/knowledge-base.mdc` /
   `rules/kb-conventions.mdc` — prefer editing living surfaces; supersede decision records.
3. If code and KB disagree, reconcile (inline judgment, or escalate with
   `/magik-repo-kb-code-sync` for a full pass).
4. Commit/push KB changes in the vault’s own workflow when the vault is versioned;
   **resolve any vault merge conflicts as part of this step**; do not leave durable
   truth only in chat or memory.

Skip only when the change truly has **no** durable-knowledge impact (e.g. pure typo in
a comment with no behavioral or operational meaning). When in doubt, sync.

## Shipping & cleanup

- Prefer merging to the project's integration branch (often `develop` or `main`) once
  verification (+ HITL if required) passes and CI is green.
- **Resolve code merge conflicts as part of shipping** (see above) — unfinished
  conflict state means ship is not done.
- Run **KB sync** after the merge is confirmed (so the KB describes what is actually on
  the integration branch), including vault conflict resolution when needed.
- Tear down ephemeral environments and worktrees when the task is done.
- If an orchestrator is in use (e.g. Orca), signal completion with that tool's
  completion message — do not invent a fake subcommand. Example pattern:
  `orca orchestration send --type worker_done …` then `task-update --status completed`.

## Anti-patterns

- Declaring done without local verification
- Auto-merging taste/creative work without human approval
- Blocking a purely programmatic task on a human
- Shipping without updating the KB when durable truth changed
- Leaving merge conflicts in the code repo or vault for “later”
- Force-pushing over peers to dodge KB or code conflict resolution
- Leaving worktrees / stacks / branches behind after merge
