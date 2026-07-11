---
name: agentic-e2e-loop
description: >-
  Full end-to-end agentic work loop for harnessed repos: gather context (kb-search),
  strategize, implement, verify locally (programmatic or human-in-the-loop for taste),
  ship (commit/push/merge/CI), and clean up. Applies in Cursor IDE, Orca worktrees,
  and any other agent surface — not tied to a specific orchestrator. Use whenever
  starting or closing substantive work so the loop always completes.
---

# Agentic E2E loop (magik-repo)

Completion means **merged + cleaned up**, not “code written.” This loop applies
whether you are in the primary Cursor IDE chat, an Orca worktree agent, or any
other agent surface that uses this harness.

## Loop

```
1. Orient       kb-search — KB + code + live services (rule 1)
2. Strategize   how to tackle the work for *this* project + sound engineering practice
3. Implement    scoped change only
4. Verify       always — cadence is the agent's call (as-you-go for large work;
                end-loaded for small). See Verification below.
5. HITL gate    only when taste/creative — raise approval; drafts + back-and-forth OK
6. Ship         commit → push → PR → merge → confirm CI green
7. Clean up     worktrees, ephemeral stacks, temp branches — leave the workspace tidy
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

## Shipping & cleanup

- Prefer merging to the project's integration branch (often `develop` or `main`) once
  verification (+ HITL if required) passes and CI is green.
- Tear down ephemeral environments and worktrees when the task is done.
- If an orchestrator is in use (e.g. Orca), signal completion with that tool's
  completion message — do not invent a fake subcommand. Example pattern:
  `orca orchestration send --type worker_done …` then `task-update --status completed`.

## Anti-patterns

- Declaring done without local verification
- Auto-merging taste/creative work without human approval
- Blocking a purely programmatic task on a human
- Leaving worktrees / stacks / branches behind after merge
