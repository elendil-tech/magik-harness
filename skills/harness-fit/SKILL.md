---
name: harness-fit
description: >-
  Fit the magik-harness to a project or a machine, and keep it fitted. Installs it on a new, half-built or
  long-running project; adapts the project's own files to what the harness expects; removes drift: leftovers
  of an older layout, hand-made versions of what the harness now provides, duplicated instructions, scripts and
  docs that name old paths. Use when the user asks to harness, set up, install, update, upgrade, adapt, align,
  migrate or repair the harness, after `magik-harness upgrade`, when `magik-harness doctor` warns, or when the
  session context says the harness is missing or broken.
---

# Fit the harness

The CLI lays the straps; you adjust the fit. `magik-harness` writes the files it owns (the pointer, runtime, skills, primer block, hook entry and lock) and checks them by hash, the same way every time. It cannot see the rest of the project: the scripts, tests, docs, CI settings and older instructions around them. That part is yours. You do it with your ordinary tools, by reading and editing files; no script does it for you.

Never write a managed file by hand. Everything you change is a normal, reviewable change to the project's own files.

## 0. Before you start

- Run `git status` and note the branch. Work on a branch of its own (for example `chore/harness-fit`), not the default branch, and leave the user's unrelated changes alone. The diff is the undo.
- Decide which kind of fit this is (see [stages.md](references/stages.md)): a **new** project, a project **in progress**, a **late-stage** project (years of setup, perhaps an earlier version of this harness or a homemade one), or a **re-fit** (already installed; it was just upgraded, `doctor` warns, or something feels off).
- For a machine-wide fit, add `--scope global` to every command and survey the home files listed in [fitted.md](references/fitted.md) instead of the repo. Ask before changing anything outside `~/.magik`, `~/.agents/skills` and the tool files the installer manages.
- Do not open `.env` files or credentials while you survey. Search by name and pattern only.

## 1. Survey (read only)

1. Run `magik-harness status`, then `magik-harness doctor --json` (use `npx magik-harness` when it is not on PATH). They say what is installed, at which version, and what is broken, each with its fix command.
2. Compare the project with [fitted.md](references/fitted.md): what a fitted project looks like.
3. Hunt for drift with [drift.md](references/drift.md): what to search for, why it matters and what to do. Search the whole repository, not only `.cursor/`.
4. Read [versions.md](references/versions.md) for every release after the project's installed version (`version` in `.magik/lock.json`; no lock means the full fit).

## 2. Plan

Write the plan before you touch anything, as four short lists: what the CLI will do, what you will change, what you will remove, what you will keep and why. Show it to the user. Ask only what the project cannot answer, one question at a time, each with a default:

- **Scope.** Project (committed: every clone, worktree and teammate gets it) or global (this machine only, nothing committed). Both can coexist.
- **Profile.** `knowledge` (a vault with a knowledge base and memory, plus the delivery loop) or `minimal` (the loop and git protocol only).
- **Vault** (knowledge profile). An existing folder or a new one, `~` allowed. **Layout:** one vault for many projects (`--layout multi`, the default) or for this project alone (`--layout single`). **Access:** a local path, or `--access-via mcp`.
- **KB autonomy.** `open` (default: keep the KB current without asking, surface only large or destructive changes), `ask` or `readonly`.
- **Tools** (`--tools auto` detects them) and **packs** (`magik-harness list`).
- Any removal you cannot prove is a copy of something the harness provides.

An existing pointer already holds the vault, layout, access and autonomy: use them and do not ask again. When nobody can answer (a headless run), take every default, leave out of the plan any removal you could not prove, list those as follow-ups, and say so in the report.

## 3. Strap on (the CLI)

1. Carry over what exists. A pointer in an older place moves with `git mv` to `.magik/harness.json` (see the pointer entry in [drift.md](references/drift.md)); `install` never overwrites a pointer and takes the vault from it.
2. Preview with `magik-harness install <options> --dry-run` and show the plan. When a lock already exists, use `upgrade` instead.
3. Apply it: the same command without `--dry-run` (add `--yes` when nobody is there to answer a prompt). Report its output and exit code as they are. Do not pass `--force` unless the user agreed: it overwrites edited files, after making a backup.

## 4. Adjust the fit (your part)

Work through the plan, finding by finding:

- **Carry over, then remove.** Before you delete an older file, keep what in it is specific to this project: in `AGENTS.md` outside the managed block, in a project skill, or in the project's own scripts.
- **Replace the homemade with the harness's.** Where the project has its own version of something the harness now provides (finding the vault, a session hook, a copy of a harness skill), delete it and call the harness's: `magik-harness resolve --json`, the runtime, the shipped skill.
- **Fix every reference.** Scripts, tests, docs, CI, Docker and linter ignore lists, and knowledge-base pages that describe the harness setup (at the autonomy the pointer grants; otherwise list them as follow-ups).
- **Keep what is the project's.** Its own rules, skills and tooling stay as they are.
- If a managed file is wrong, fix the cause and run `upgrade` (or `upgrade --force` once the user agrees; it backs the file up first). Do not patch it by hand.

## 5. Check the fit

1. `magik-harness doctor`: no failures, and every warning fixed or explained.
2. Run the project's own checks the way its docs say (tests, lint, pre-commit). Drift in the project's files shows up there.
3. Search again for the old names and paths from the survey. Nothing should be left except in a changelog.
4. Run the hook by hand: `node .magik/runtime/session-start.mjs --format text` (`~/.magik/runtime/session-start.mjs` at global scope). Its output starts with `magik-harness session context`.

## 6. Hand over

- Commit in the project's commit style (conventional by default), for example `chore(harness): fit the project to magik-harness <version>`. Do not push or merge unless asked.
- Report in ten lines or fewer: what changed, what you kept and why, what the user has to decide.
- If a memory store resolves, add one line to today's note (skill `harness-memory`).

## Fit again when

`magik-harness upgrade` has run, a release has shipped, `doctor` warns, a session starts without the `magik-harness session context` heading, or a new tool or teammate joins. A re-fit is the same loop, usually short: survey, apply the version notes, check.
