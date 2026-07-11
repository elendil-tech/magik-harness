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
7. KB sync      update durable knowledge/docs so the vault matches what landed
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

## KB sync (after ship)

Before treating the task as closed, bring the knowledge base (and any project docs that
are ground truth) in line with what actually shipped:

1. Identify entries touched by the work (specs, policies, architecture, runbooks, glossary).
2. Update or add them per `knowledge.autonomy` and `rules/knowledge-base.mdc` /
   `rules/kb-conventions.mdc` — prefer editing living surfaces; supersede decision records.
3. If code and KB disagree, reconcile (inline judgment, or escalate with
   `/magik-repo-kb-code-sync` for a full pass).
4. Commit/push KB changes in the vault’s own workflow when the vault is versioned;
   do not leave durable truth only in chat or memory.

Skip only when the change truly has **no** durable-knowledge impact (e.g. pure typo in
a comment with no behavioral or operational meaning). When in doubt, sync.

## Shipping & cleanup

- Prefer merging to the project's integration branch (often `develop` or `main`) once
  verification (+ HITL if required) passes and CI is green.
- Run **KB sync** after the merge is confirmed (so the KB describes what is actually on
  the integration branch).
- Tear down ephemeral environments and worktrees when the task is done.
- If an orchestrator is in use (e.g. Orca), signal completion with that tool's
  completion message — do not invent a fake subcommand. Example pattern:
  `orca orchestration send --type worker_done …` then `task-update --status completed`.

## Anti-patterns

- Declaring done without local verification
- Auto-merging taste/creative work without human approval
- Blocking a purely programmatic task on a human
- Shipping without updating the KB when durable truth changed
- Leaving worktrees / stacks / branches behind after merge
