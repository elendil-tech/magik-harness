---
name: agentic-e2e-loop
description: >-
  The end-to-end work loop for a harnessed repo: orient, strategize, implement, verify, involve a
  human only where taste is needed, ship (commit, push, PR, watch CI, fix, merge), sync the knowledge
  base, and clean up (tear down a worktree or reset the primary checkout). Includes the multi-machine
  git protocol: pull before working, cloud-save with WIP commits, never stash across worktrees. Use
  when starting or closing substantive work, when pushing or opening a PR, when watching or re-running
  CI, when pausing or switching machines, and when deciding whether a human approval gate is needed.
---

# The agentic end-to-end loop

Completion means **merged, checks green, knowledge updated, workspace tidy**. It does not mean "code written" or "PR opened". The loop is the same in an IDE chat, a CLI session, a worktree agent or an orchestrator's worker.

## The loop

```
1. Orient       git state; kb-search (KB + code + live services) when the harness has a KB
2. Strategize   an approach that fits this project and sound engineering practice
3. Implement    a scoped change only
4. Verify       always. As you go for large work, at the end for small work
5. Human gate   only for taste or brand work: drafts, then explicit approval
6. Ship         commit, push, PR, watch CI, fix failures, merge; resolve code conflicts here
7. KB sync      make durable knowledge match what landed; resolve vault conflicts here
8. Clean up     tear down an ephemeral worktree, or reset the primary checkout
```

## 1. Orient

- `git status`, the current branch, and whether it tracks an upstream (`git rev-parse --abbrev-ref @{u}`).
- If the branch is behind origin, `git pull --ff-only` **before** editing. Never build on a stale branch.
- If the harness has a knowledge base, load `kb-search` (rule 1 of the harness). The KB is the start of context; corroborate it against the code and live state.

## 4. Verify

**Programmatic checks need no human.** Tests, types, lint, builds, local stacks, health checks and deterministic assertions run autonomously. Skipping verification is never an option; only its cadence is yours to choose.

**Reproduce CI locally.** Run the same commands the project's CI runs before you push. CI confirms; it is not where you debug.

## 5. The human gate

Raise an approval gate when the artifact needs **taste** or represents a person or brand: visual or product design, copy and voice, front-end look and feel, positioning.

Stay interactive. For creative work produce **two or three drafts**, summarize how they differ, and wait for explicit approval or steering. A back-and-forth is part of the loop, not a failure. After approval, still run the programmatic checks before shipping. Do **not** auto-merge taste work on your own judgment, and do **not** block programmatically verifiable work on a human.

## 6. Ship

Commit, push, open a PR (as a draft until local checks pass), **watch CI, fix failures**, then merge, and confirm the post-merge pipeline when the project has one (fix forward if it fails). Resolve merge conflicts as part of shipping: never leave conflict markers or an unfinished merge or rebase, and never force-push over peers to dodge a conflict. Details, the CI discipline and the stop-after-three rule are in `references/shipping-and-ci.md`.

## 7. KB sync

After the merge, durable knowledge must not lag the code:

1. Identify the entries the work touched (specs, policies, architecture, runbooks, glossary).
2. Update or add them at the autonomy the pointer grants, following `knowledge-base` and `kb-conventions`. Edit living entries in place; supersede decision records, never rewrite them.
3. If code and KB disagree beyond what you touched, reconcile inline or escalate to the `kb-code-sync` skill.
4. If the vault is versioned, pull or rebase, resolve entry conflicts, then push. Do not leave durable truth only in chat or memory.

Skip only when the change has genuinely no durable-knowledge impact. When in doubt, sync.

## 8. Clean up

| Surface | After merge and KB sync |
| --- | --- |
| **Ephemeral worktree** (a `git worktree`, an orchestrator's worktree, a throwaway clone) | Tear it down, with its stacks and any sibling vault checkout. Do not "return" it to the integration branch |
| **Primary or long-lived checkout** | Check out the integration branch (`main`, `develop`, ...), pull to match the remote, delete the local feature branch, prune stale remotes. It is reused, not torn down |

Staying on the feature branch during the task is correct. Leaving the primary checkout on a merged feature branch is an incomplete close-out.

## Multi-machine and worktree protocol

Work often alternates between machines (a laptop and a remote dev box) and between worktrees. **GitHub (`origin`) is the relay.**

- **Orient on start**: as in step 1. Pull with `--ff-only` if behind.
- **Cloud-save on pause or context switch**: never leave uncommitted or unpushed work. Commit with a Conventional Commit or a descriptive checkpoint, `git commit -m "wip: <checkpoint> [skip ci]"`, then `git push`. The `[skip ci]` keeps intermediate checkpoints from triggering CI where CI is metered. Unpushed commits cannot travel between machines.
- **No global stash across worktrees**: the stash stack is shared by every worktree of a repository (`.git/refs/stash`), so stashing in one and popping in another contaminates both. Use a temporary WIP commit on the branch instead.
- **Prune finished worktrees**: when a feature branch merges, delete the local branch and remove the worktree. The `worktrees` pack (`worktree-audit`) adds a guarded way to do it.

## Orchestrators

If a coordinator or worker tool is in use, signal completion through that tool's real API; do not invent subcommands. The loop itself does not depend on any orchestrator.

## Anti-patterns

- Declaring done without verifying locally.
- Auto-merging taste or brand work without human approval, or blocking a programmatic task on a human.
- Shipping while durable truth changed and the KB was not updated.
- Leaving merge conflicts in the code repo or the vault for "later", or force-pushing over peers.
- Calling a ship done while PR CI is red, or ignoring a failed post-merge deploy.
- Leaving worktrees, stacks or branches behind; leaving the primary checkout on a merged feature branch.
- Building on a stale branch without checking git state; pausing or switching machines without pushing a checkpoint.
- Using `git stash` to move work across worktrees.
- Pushing again after a red run without reading the logs and reproducing the failure locally; using CI as a debugger.
