# Shipping, CI and merge conflicts

Detail for step 6 of the `agentic-e2e-loop` skill. Watching CI and correcting failures is **in-loop work**, not garnish. A merge with red checks, or a failed post-merge deploy left unfixed, is an incomplete ship.

## Before merge: PR CI

1. Open the PR as a **draft**. Checkpoints on the branch carry `[skip ci]`. Mark the PR ready once your local checks pass; that is the one CI run.
2. After opening or updating the PR, **watch** the required checks until they finish. Scope your attention to the pipelines this change triggers, not every unrelated workflow.
3. On failure: read the failing job's logs (`gh run view <id> --log-failed` on GitHub), reproduce that job's exact commands locally, fix the root cause on the feature branch, verify locally, push **once**, and re-watch.
4. Merge only when the checks are green and any human gate has passed.

## CI is a budget

Hosted CI minutes are usually metered, and every job rounds up to a whole minute. Treat a full CI run as a deliberate, milestone-level action, never as a debugger.

- **Verify locally first.** Run the project's CI-equivalent commands (lint, typecheck, tests, build) before any push whose purpose is "see if CI passes".
- **One fix, one run.** Do not push or dispatch again while a run on the same ref is still going; superseded runs that get cancelled still bill the minutes they used.
- **Rerun, do not re-dispatch.** For a flaky or infrastructure failure, re-run the failed jobs (`gh run rerun <id> --failed`) instead of pushing an empty commit or dispatching a new run.
- **No CI-as-debugger.** No `workflow_dispatch` loops, empty commits or throwaway pushes to "see what happens".
- **Stop after three.** After three consecutive red runs on one branch, stop. Report the failing job, what was tried and roughly how many minutes were burned, and continue only if the user says so.

Where CI is free (for example a public repository) the cap relaxes, but verifying locally first still saves wall-clock time. A project's own CI document may set stricter limits; follow the stricter one. Teams with an opinionated runner policy can install the `ci-runners` pack, which adds one.

## After merge: integration and deploy

When the project runs checks or a deploy on the integration branch after merge:

1. Confirm the merge landed and watch the post-merge pipeline.
2. If it fails, **fix forward** on the integration branch (or a hotfix branch that merges immediately), to the same bar as PR CI. Do not walk away from a broken tip.

## Merge conflicts are in-loop

Parallel agents, worktrees and independent vault checkouts make conflicts expected. Resolving them is part of the work.

### During ship (code)

1. Do not declare the ship complete while conflict markers or an unfinished merge or rebase remain.
2. Integrate against the project's integration branch with a normal merge or rebase. Resolve with full context (`kb-search` plus the intent of the conflicting change), re-run verification, then continue the PR or merge.
3. "Someone else can fix the conflicts" is not a close-out.

### During KB sync (vault)

When the vault has its own git remote and pull, rebase or a PR hits conflicts:

1. Treat resolution as part of step 7, to the same bar as code.
2. Pull or rebase onto the vault's integration branch before publishing; resolve entry conflicts so the living entries stay coherent (`knowledge-base`, `kb-conventions`), and re-check links and `_index.md` if you touched them.
3. Parallel worktrees with independent vault checkouts must not clobber each other. Publish through the vault's normal git workflow and resolve conflicts instead of force-pushing over peers.

If a conflict is truly judgment-heavy (competing product decisions), surface it to a human. Mechanical and obvious resolutions stay autonomous.
