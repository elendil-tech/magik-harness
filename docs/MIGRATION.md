# Migrating from magik-repo 1.x

magik-repo 1.x was a Cursor plugin: rules and skills supplied by the plugin, a pointer and a hook script copied into each project's `.cursor/`. magik-harness 2.0 is the same idea made independent of any one tool: a CLI installs a small, owned set of files into a project (or onto a machine), and Cursor, Claude Code, Codex and anything else that reads `AGENTS.md` and Agent Skills can use them.

**Your vault does not change.** The knowledge base and memory formats, the folder layout, the autonomy levels, the git protocol and the CI policy content all carry over. Only the files around the repo moved.

- [What moved](#what-moved)
- [Migrating a project](#migrating-a-project)
- [What to expect, and the cases that need a decision](#what-to-expect-and-the-cases-that-need-a-decision)
- [If you used the Cursor plugin](#if-you-used-the-cursor-plugin)
- [Projects with their own tooling around the pointer](#projects-with-their-own-tooling-around-the-pointer)
- [Rolling back](#rolling-back)

## What moved

| 1.x | 2.0 |
| --- | --- |
| Package `magik-repo`, a Cursor plugin | `magik-harness`, a CLI (`npx magik-harness`) and, optionally, the same content packaged as a Cursor plugin |
| Pointer `.cursor/harness.json`, schema `magik-repo/harness@1` | `.magik/harness.json`, schema `magik-harness/harness@2` (a superset; `harness@1` is still read) |
| Overlay `.cursor/harness.local.json` | `.magik/harness.local.json` (git-ignored) |
| Hook script `.cursor/hooks/session-start.js`, registered in `.cursor/hooks.json` | `.magik/runtime/session-start.mjs`, same registration point; one script serves Cursor, Claude Code and plain text |
| Rules `agentic-work`, `harness`, `memory`, `knowledge-base`, `kb-conventions`, `ci-runners`, `worktrees` (Cursor-only) | Skills `agentic-e2e-loop`, `harness`, `harness-memory`, `knowledge-base`, `kb-conventions`; `ci-runners` and `worktree-audit` are opt-in packs. Skills load in every tool; rules did not. |
| Skills `kb-search`, `kb-sanitize`, `kb-code-sync` | unchanged names, now in `.agents/skills/` |
| Always-on text in the plugin's rules | the **primer**: one short block in `AGENTS.md` |
| Setup by the `/magik-repo-setup` command | `magik-harness install`; `/magik-harness-setup` remains a thin wrapper for Cursor |
| Project only | project **or** global (`--scope global`), or both |
| `.cursor/` for everything | `.magik/` for the harness; tool files stay where each tool expects them |

## Migrating a project

From the root of the project (use a branch; the changes are meant to be committed):

```bash
git switch -c chore/magik-harness-2
npx magik-harness install --dry-run     # read the plan first
npx magik-harness install               # apply it
npx magik-harness doctor                # must be healthy
git add -A && git commit -m "chore: migrate to magik-harness 2"
```

Reading the plan: `+` create, `~` update or merge, `-` remove, `!` kept or conflicting (with the reason). In one pass the install:

1. moves `.cursor/harness.json` to `.magik/harness.json`, rewriting it to schema `@2` and **keeping your mounts and autonomy as they were**; moves `.cursor/harness.local.json` to `.magik/harness.local.json`;
2. replaces the 1.x hook with `.magik/runtime/` and re-registers it in `.cursor/hooks.json` (your other hooks stay); the old script is deleted only if it is byte-identical to a release that was shipped, after a backup;
3. replaces the primer block in `AGENTS.md` and the managed block in `.gitignore` in place (everything outside the markers is untouched); `.gitignore` lines the old block carried that are not duplicated elsewhere are kept under a `# Kept from magik-repo 1.x` comment, for you to edit or delete;
4. writes the skills to `.agents/skills/` and records everything in `.magik/lock.json`;
5. runs the new hook once as a self-test.

A second `install` changes nothing. The project's tests and CI, if they referenced the old paths, are your next stop: see [below](#projects-with-their-own-tooling-around-the-pointer).

Then confirm in a live session that the tool really runs it: [TOOLS.md](TOOLS.md#checking-it-in-a-live-session).

## What to expect, and the cases that need a decision

**A 1.x hook you edited.** It is kept, not deleted, and the plan warns that session context will arrive **twice** (old and new hook both registered). Either fold your edits into the vault or the primer, or remove it: `magik-harness install --drop-legacy-hook` (the script is backed up to `.magik/backups/<time>/` first).

**A pointer that is not valid JSON.** The install stops with exit code 2 and changes nothing, because guessing would silently drop your knowledge base. Fix the file, or pass `--vault <dir>` (or `--profile minimal`) to go on without it; with `--vault` the unreadable pointer is left exactly as it was and `doctor` keeps failing until you fix it.

**Keep the old pointer for now.** `--keep-legacy-pointer` leaves `.cursor/harness.json` in place. The resolver reads both paths, so nothing breaks; a later plain `install` finishes the move.

**Before you migrate at all.** A 1.x pointer already resolves under 2.0 (the old path is still read), and `doctor` says to migrate. You can upgrade the tooling machine by machine.

**`.agents/` is git-ignored in the repo.** The install chooses `.cursor/skills/` instead and says so, because a git-ignored folder would not reach clones and worktrees. Override with `--skills-dir`.

**Worktrees.** The pointer must be **tracked** so that every worktree and clone resolves the same vault: commit `.magik/harness.json`. `doctor` warns when it is not. A worktree made before the commit has no pointer until you merge or rebase.

## If you used the Cursor plugin

1.x was installed as `~/.cursor/plugins/local/magik-repo` (or from the marketplace). 2.0 does not need it: the content it supplied now lives in the project's `.agents/skills/` and the `AGENTS.md` primer, which every tool reads.

- You can keep the plugin form: `pnpm install-plugin` in a clone of this repository installs the 2.0 content as a plugin named `magik-harness` into `~/.cursor/plugins/local/`. It supplies the core skills and the `/magik-harness-*` commands (the opt-in packs come from the CLI), and no longer supplies rules.
- Remove the old `magik-repo` plugin folder once you have switched; while both are installed, Cursor offers two sets of same-named skills. The installer never touches the old folder, so the two can sit side by side while you migrate.
- **Anything that calls a script by its plugin path breaks.** For example a user rule that runs `~/.cursor/plugins/local/magik-repo/skills/ci-runners/scripts/ci_usage.py`: the CI policy is now the opt-in `ci-runners` pack, and the script lives with its skill, at `.agents/skills/ci-runners/scripts/ci_usage.py` in a project that installed the pack, or `~/.agents/skills/ci-runners/scripts/ci_usage.py` after `magik-harness install --scope global --packs ci-runners`. Update such references when you switch; until then keep the old plugin installed.
- User-level (machine-wide) setup is new: `magik-harness install --scope global --vault ~/vaults` covers every repository that has a folder in that vault, without committing anything. See [TOOLS.md](TOOLS.md) for what each tool receives.

## Projects with their own tooling around the pointer

If a repository has scripts, tests or docs that read `.cursor/harness.json` or `.cursor/hooks/session-start.js` directly (a worktree setup script, a guard test, a doc that names the path), update them after migrating:

- read `.magik/harness.json` first and fall back to `.cursor/harness.json`; the fields you used in `harness@1` (`vault`, `knowledge.mount`, `memory.mount`, `mounts`) are unchanged in `harness@2`;
- the overlay is `.magik/harness.local.json`; the fallback is `.cursor/harness.local.json`;
- the resolution order is: overlay over the project pointer, then the machine's `~/.magik/config.json` convention, then nothing. [ARCHITECTURE.md](ARCHITECTURE.md#5-the-pointer-and-how-it-resolves) has the exact rules; `magik-harness resolve --json` prints the result so a script need not re-implement them;
- a guard test that asserts the pointer's schema string should accept `magik-harness/harness@2` (and `magik-repo/harness@1` if you want a transition period).

## Rolling back

- Nothing is deleted without a copy: every file the install replaced or removed is under `.magik/backups/<timestamp>/` (git-ignored), under its original relative path.
- `git revert` of the migration commit restores the repository as it was; the vault was never touched.
- `magik-harness uninstall` removes what 2.0 added (and `--purge` also the pointer); files you edited are kept and reported.
