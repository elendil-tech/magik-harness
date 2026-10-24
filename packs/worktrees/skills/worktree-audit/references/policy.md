# Worktree policy: one durable root, a disposable Cursor root, audited teardown

Worktrees are how parallel agents stay isolated (`agentic-e2e-loop`: one branch = one
worktree = one worker). They sprawl because every tool picks its own default location
and nobody owns the list. This rule fixes **where** they live and **how they end**.
Procedures and tooling: the `worktree-audit` skill (`../SKILL.md`).

## The roots

| Root | Created by | Lifespan | Use it for |
| --- | --- | --- | --- |
| `~/worktrees/<repo>/<name>` — the **durable root** (`$WORKTREES_HOME`, default `~/worktrees`) | Orca, a repo's wrapper (`worktree.sh new`), or `git worktree add` for repos without one | until the PR merges, then torn down | everything with a PR, unpushed work, or a reason to come back |
| `~/.cursor/worktrees/<repo>/<id>` | Cursor "new worktree" sessions | **disposable** — Cursor's janitor may delete any worktree here | short agent runs; nothing here is ever the only copy |
| anything else (`~/Projects/<repo>-worktrees`, `~/orca/workspaces`, `/tmp`, inside another checkout) | legacy defaults, ad-hoc `git worktree add` | — | nothing new. Legacy worktrees finish where they are, then get torn down |

Cursor's location is hard-coded: no setting moves it, and its "new worktree" sessions
land there. Its janitor looks nowhere else — it walks `<root>/<repo>/<id>`, two levels
deep — so the durable root is never counted or touched. What follows was checked against
Cursor 3.24 (app code and logs); re-check after a major update.

- **It counts folders, not git registrations.** Every `<repo>/<id>` that holds a `.git` and
  resolves to a repository counts, whoever created it (a standing lane, a `<id>.vault`
  clone). A symlink to a worktree counts as a second one.
- **Past `cursor.worktreeMaxCount`** (default 25, machine-wide; also
  `cursor.worktreesGlobalMaxSizeGb`, swept every `cursor.worktreeCleanupIntervalHours`,
  default 6) it removes the excess **plus 4** in one go: worktrees no live agent is
  attached to first, then the oldest by last access. Only a worktree under 10 minutes old,
  or one with an agent running in it, is spared.
- **It checks nothing before deleting.** No dirty or unpushed check: it runs
  `git worktree remove` (a refusal is ignored), then deletes the folder recursively, with
  no trash. Assume anything in this root can vanish at any sweep.

Raising the cap only delays the sweep; the durable root is the fix.

**Promote or expire.** A Cursor-root worktree that earns a PR or a second day is
promoted: commit and push, remove it (clean), then
`git worktree add ~/worktrees/<repo>/<name> <branch>` (or let Orca create it). Anything
not promoted may vanish; make sure that costs nothing.

## Rules

1. **Create inside the durable root only.** Orca first (Settings → General → Workspace →
   *Workspace Directory* = `~/worktrees`, *Nest Workspaces* on → `<root>/<repo>/<name>`);
   the repo's wrapper when it has one (it provisions deps, trust and the vault); otherwise
   `git worktree add ~/worktrees/<repo>/<name> -b <branch> origin/<base>`. Never in `/tmp`,
   in another checkout, or in a new sibling folder of the repo.
2. **One branch = one worktree.** `<name>` is the branch with `/` replaced by `-`. Check
   `git worktree list` and reuse before creating.
3. **A vault checkout lives beside its worktree** as `<name>.vault` (when a harness vault has its own git checkout per worktree) and
   shares its lifecycle: created with it, removed with it, never left behind.
4. **Never move a worktree that has a stack.** A repo may derive its stack identity from
   the worktree *path* (for example a compose project name or a devstack hash pinned in a marker file such as `.devstack.local`,
   while the repo's reaper recomputes it from the current path). `git worktree move` then makes a
   live stack look orphaned and the reaper tears it down. Legacy worktrees finish in
   place; the next one is created in the durable root.
5. **Standing lanes belong to the repo owner** (`dev`, `dev2`, `dev3`, anything a repo's
   `AGENTS.md` calls standing): never remove, reset, prune, move or delete their branches.
   If one sits in the Cursor root, tell the repo owner — standing lanes are the oldest worktrees
   there, so the janitor takes them first.
6. **Nothing lives only in a worktree.** Before leaving, commit and push (WIP:
   `git commit -m "wip: … [skip ci]"`, see `agentic-e2e-loop`). Ignored files (`.env*`, local
   config, build outputs, a local `.aar`) are not backed up: the repo's provisioning must be
   able to recreate them, and an irreplaceable hand-made one gets called out *before* teardown.
7. **Teardown order**, once the PR is merged: repo teardown / stack down → `git worktree remove`
   (never `--force`; never `rm -rf` a registered worktree) → `git branch -d` (a squash merge
   defeats ancestry — use `-D` only after the PR shows MERGED **with the same tip**) →
   remove the `<name>.vault` sibling → `git worktree prune`.
8. **Audit before deleting.** Run the `worktree-audit` skill (`inventory`, then the guarded
   `remove`). It fails closed on dirty trees, commits that exist on no remote, open PRs,
   directories in use and unexpected ignored files. `git branch --merged` is not evidence
   for squash-merged work — compare the PR's head commit.
9. **Stashes are repo-global**: never carry work between worktrees with `git stash`.
10. **Keep one index.** Register every active repo in Orca (external worktrees: show) so it
    lists them, and run the inventory monthly and whenever disk, sprawl, Cursor's cap or
    "where did that go?" comes up.
11. **No links inside the Cursor root.** Cursor counts a symlink to a worktree as a second
    worktree against the cap, and `git worktree remove` on the link deletes the real one.
    If an old path has to keep working, put the link outside `~/.cursor/worktrees`. The
    inventory flags every alias.

## For repo wrappers

A repo that ships its own wrapper defaults its root to
`${WORKTREES_HOME:-$HOME/worktrees}/<repo>`, keeps `WT_ROOT` as the override, and warns
(not moves) about worktrees outside it.

## Related

- Skill `worktree-audit` (inventory, classification, guarded removal): `../SKILL.md`
- Skill `agentic-e2e-loop` (cleanup, multi-machine sync, no stash across worktrees)
