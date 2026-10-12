---
name: worktree-audit
description: >-
  Inventory every git worktree across all repos (the durable root, Cursor's
  disposable root, Orca's default root, legacy sibling folders), classify each one
  (DONE, ACTIVE, OPEN-PR, DIRTY, UNPUSHED, STANDING, IN-USE, NEW, REVIEW), list strays
  (orphan `.vault` clones, unregistered checkouts), warn when Cursor's janitor is near
  its cap, and remove finished worktrees through a fail-closed guard (dry run by
  default, never `--force`). Use for worktree sprawl, "where did that go?", disk or
  Cursor-cap questions, before and after bulk agent runs, before removing any worktree
  or `.vault` clone, and as the monthly review. Policy text lives in rule `worktrees`.
---

# Worktree audit

One tool, two verbs: **`inventory`** (read-only) and **`remove`** (dry run unless
`--apply`). It needs `git`, `python3` and `lsof` (macOS and Linux; not Windows); `gh` adds
PR state (without it, "merged" means git ancestry only, which squash merges defeat).

```bash
WT=~/.cursor/plugins/local/magik-repo/skills/worktree-audit/scripts/wt_audit.py   # installed copy
python3 "$WT" inventory --prs            # everything, with PR state
```

Policy (where worktrees live, how they end): rule `worktrees`. This skill is the procedure.

## 1. Inventory

```bash
python3 "$WT" inventory --prs                    # all repos under ~/Projects (WT_REPOS_ROOT)
python3 "$WT" inventory --prs --only falconproxy # one repo (the registry still covers all repos)
python3 "$WT" inventory --sizes                  # + MB per worktree (slow)
python3 "$WT" inventory --json                   # machine-readable
```

It discovers repos from `~/Projects/*` **and** from any worktree found in the roots, so a
repo that lives elsewhere still shows up. Per worktree: branch, **WHERE** (`durable`,
`cursor`, `orca`, `legacy`, `other`), **VERDICT**, `DIRTY` (tracked+untracked), `UNPUSHED`
(commits on no remote), PR, age and whether a `.vault` sibling exists.

| Verdict | Meaning | Do |
| --- | --- | --- |
| `primary` | the main checkout | never removed; note dirty/behind |
| `STANDING` | name in `WT_PROTECT` (default `dev,dev2,dev3`) | never touch; if it sits in the Cursor root, tell the owner |
| `IN-USE` | a process has the directory open (editor, shell, dev server) | not now |
| `DIRTY` | uncommitted or untracked files | commit and push, or decide with the owner |
| `UNPUSHED` | commits that exist on no remote branch (a merged PR's exact tip is exempt, see `DONE`) | push first (`wip: … [skip ci]`) |
| `OPEN-PR` | its PR is open | keep |
| `ACTIVE` | pushed, not merged, no PR known | keep (run with `--prs` to learn more) |
| `NEW` | no commits of its own yet, created within `WT_FRESH_DAYS` (2) | keep |
| `REVIEW` | PR closed unmerged, or merged but the local tip differs | human decision |
| `DONE` | clean; everything is on a remote and merged (ancestry **or** the PR's head commit; a PR merged at exactly this tip counts even when the head branch was deleted on merge) | remove (§3) |
| `MISSING` | registered but the folder is gone | `git worktree prune` |
| `LOCKED` | `git worktree lock` | leave |

The **Strays** block lists what sits in a worktree root but belongs to no repo:
`orphan-vault` (a `<name>.vault` clone whose worktree is gone), `unregistered-checkout`,
`non-checkout-dir` (look inside before deleting — it may hold artifacts). Empty
placeholder folders are only counted. The **Summary** shows the Cursor janitor line: what
Cursor's janitor counts in its root against `cursor.worktreeMaxCount`, and which entries are
"next to go". It counts folders, as Cursor does — anything with a resolvable `.git` (a
`<id>.vault` clone, a checkout git does not register, a symlink to a worktree), but not empty
or broken folders — so it can differ from `git worktree list`. Over the cap it says how many
the next cleanup removes (excess + 4; no dirty or unpushed check, no trash). An **`ALIAS`**
line names a symlink in the Cursor root: it counts as a second worktree, and `git worktree
remove` on it deletes the real one — remove the link itself (`rm`, no `-r`).

## 2. Decide

1. Inventory with `--prs`. Read the janitor line first: standing lanes or PR-bearing work
   in the Cursor root is the urgent finding.
2. `DONE` → remove (§3). `REVIEW` / `ACTIVE` → look at the PR or ask; do not guess.
3. Strays: orphan vaults go through the same guard (§3); anything else — look, then ask.
4. Anything outside the durable root is legacy: let it finish, tear it down, create the
   next one in `~/worktrees` (rule `worktrees`).
5. Finish by reporting what was removed, what remains and why, and the disk reclaimed.

## 3. Guarded removal

```bash
python3 "$WT" remove <path> --delete-branch --vault            # dry run: read the plan
python3 "$WT" remove <path> --delete-branch --vault --apply    # then execute
python3 "$WT" remove ~/worktrees/app/old.vault --apply         # an orphan vault clone
```

It **refuses** (exit 2, nothing touched) when:

- the path is the primary checkout, not a registered worktree, locked, or a standing lane;
- the path is a symlink: git would delete the worktree the link points to, so pass the real
  path, or `rm` the link itself (never `rm -r`) to drop only the link;
- a process has it open (editors, shells, dev servers; file watchers are ignored);
- there is any uncommitted or untracked file, or any commit that exists on no remote
  (checked per worktree HEAD, not repo-wide) — or git cannot answer that question: an
  unknown push state is never read as "nothing unpushed". The one exemption is a PR merged
  at exactly the local HEAD (GitHub keeps that tip under `refs/pull/<n>/head`, so a deleted
  head branch loses nothing); a commit made after the merge is still unpushed work;
- the PR is still open (`--allow-open-pr`), or the work is not merged / is brand new
  (`--allow-unmerged`) — a merged PR counts only when its head commit equals the local tip;
- ignored files exist that are not known-regenerable (`node_modules`, build output, the
  generated `.cursor/harness.local.json`, …): check provisioning recreates them, then
  `--accept-ignored` — hand-made `.env*` or a local `.aar` is exactly what this catches;
- the worktree has a devstack identity (`.devstack.local`): tear the stack down with the
  repo's wrapper first (`worktree.sh rm <branch>`), then `--stack-torn-down`;
- for `--vault` / orphan vaults: uncommitted or unpushed commits, stashes, local-only
  ignored files (e.g. `memory/` notes — rescue them first), a live worktree beside it, a
  vault checkout that is itself a linked worktree, or a vault sibling that is a symlink.

`--delete-branch` runs `git branch -D` only for `DONE` work (tip merged and on a remote, or
the exact tip of a merged PR), so squash merges are handled and nothing unpushed can be lost. It never pushes, deletes remote
branches, touches stashes, or uses `--force`.

If the repo ships its own teardown (`worktree.sh rm`, `.cursor/worktree/teardown.sh`), prefer
it — it also stops stacks and removes the vault — then re-run the inventory to confirm.

## 4. What the tool cannot see

- **Branches without a worktree.** Unpushed commits on a local branch nobody has checked out
  are invisible here: `git -C <repo> log --branches --not --remotes --oneline` (repo-wide).
- **Stashes** are repo-global: `git -C <repo> stash list` before retiring a repo's last worktree.
- **Docker stacks.** Removing a worktree can orphan its stack; use the repo's reaper
  (falconproxy: `devstack.sh reap`; Docker must be running).
- **Non-GitHub remotes** have no PR state; merged means ancestry only — treat `ACTIVE` as unknown.

## 5. One-time setup

- Orca: Settings → General → Workspace → *Workspace Directory* `~/worktrees`, *Nest
  Workspaces* on; register every active repo (Orca stays the single visible index). Orca
  1.4+ keeps its settings in `profiles/<profile>/profile-state.db` (SQLite, under
  `~/Library/Application Support/orca`); `orca-data.json` beside it is only the copy from
  before the migration and goes stale. The inventory reads the live store, read-only, and
  falls back to the legacy file only when there is no store. Prefer Orca's UI: the store is
  hash-checked, so a hand edit that skips the hash and revision bookkeeping is rejected on
  load, and nothing may edit it while Orca runs.
- Env (optional): `WORKTREES_HOME`, `WT_REPOS_ROOT` (colon-separated), `WT_PROTECT`,
  `ORCA_WORKSPACES`, `WT_FRESH_DAYS`.
- Leave Cursor's `cursor.worktree*` settings alone; the durable root is the fix, not a bigger cap.
- Run the inventory monthly, and before spawning many parallel agents.

## Related

- Rule: `worktrees` (location and lifecycle policy)
- Rule: `agentic-work` (cleanup step, multi-machine sync)
- Skill: `agentic-e2e-loop` (where cleanup sits in the loop)
