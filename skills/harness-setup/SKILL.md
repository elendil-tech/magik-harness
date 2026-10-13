---
name: harness-setup
description: >-
  Install, repair or upgrade the magik-harness for one project or for a whole machine. Walks the user
  through choosing project or global scope, picking a vault, previewing with a dry run, running the
  installer, and verifying with doctor. Use when the user asks to harness a repo or set up the harness,
  when the session context says no harness is installed, when `magik-harness doctor` reports a problem,
  or when a magik-repo 1.x install needs migrating.
---

# Set up the harness

A short **conversation**, then one deterministic install by the CLI. Do not write the managed files (`.magik/`, the skills folder, the `AGENTS.md` primer block, hook registrations) by hand; the installer owns them and records hashes so upgrades keep the user's edits.

## 0. Look first

Run `npx magik-harness doctor` (or `magik-harness doctor` when it is installed). It reports what exists, what is broken, and the exact fix for each problem. If something is already installed, prefer `magik-harness upgrade` over a fresh install, and fix what `doctor` flags rather than reinstalling.

## 1. Ask (one compact question at a time, with defaults)

1. **Scope.** *Project*: the harness lives in this repo (committed), so every clone, worktree and teammate gets it. *Global*: it lives on this machine under `~/.magik` and the tool's user config, and works in every repo without committing anything. Default to project for a repo the user shares; offer global for personal setups. Both can coexist.
2. **Knowledge and memory, or just the loop?** With a vault the install gives the agent a knowledge base and memory (`--profile knowledge`). Without one it installs only the delivery loop and git protocol (`--profile minimal`).
3. **Vault location** (knowledge profile). An existing vault or a new folder, `~` allowed, for example `~/vaults/acme`. A missing folder is created for a new project pointer.
4. **Layout.** One vault for many projects (stores at `<project>/knowledge` and `<project>/memory`, `--layout multi`, the default) or a vault for this project alone (`knowledge` and `memory`, `--layout single`).
5. **Access.** A local path (default), or `--access-via mcp` for a remote store wired through the user's MCP configuration (the vault scaffolding is then skipped).
6. **KB autonomy.** `open` (default): the agent keeps the KB in step with its work and surfaces only large or destructive changes. `ask`: writes only on request or an approved proposal. `readonly`: never writes. When unsure, keep `open`.
7. **Tools.** Normally let the installer detect them (`--tools auto`). Choose explicitly for `cursor`, `claude`, `codex` or `generic` (any agent that reads `AGENTS.md` and Agent Skills).

## 2. Preview, then apply

Always preview first. The plan lists every file and says why:

```bash
npx magik-harness install --scope project --vault ~/vaults/acme --dry-run
```

Show the user the plan, then run it again without `--dry-run`. For a machine-wide install use `--scope global`; it asks before touching the home directory and backs up every file it modifies. Surface the CLI's output and exit code as they are.

## 3. Verify

```bash
npx magik-harness doctor
```

All checks should pass. Then tell the user, for a **project** install, to review `git status` and commit what was added: `.magik/`, the skills folder, `AGENTS.md`, `.gitignore` and the tool's hook configuration. Those files are what make every other clone and worktree work. For a **global** install, tell them to start a new agent session, and to run `magik-harness init` inside a project to create its vault folders.

## 4. Edge cases

- **magik-repo 1.x install** (`.cursor/harness.json` and a `session-start.js` hook): `install` migrates it in one pass. The pointer and overlay move to `.magik/`, the hook is replaced, the old primer block is replaced. A locally modified 1.x hook is kept unless you pass `--drop-legacy-hook`. Pass `--keep-legacy-pointer` only when other tooling still reads `.cursor/harness.json`.
- **Skills folder is git-ignored** (some repos let a generator own `.agents/`): the installer falls back to `.cursor/skills` and says so; `--skills-dir <dir>` overrides.
- **Files that already exist and were not written by the installer** are reported as conflicts and left alone. `--force` overwrites them after making a backup.
- **A pack or two** (`--packs worktrees,ci-runners`) adds opinionated skills; `magik-harness list` shows what is available.
- **No Node on the machine**: the harness needs Node 18 or newer for the installer and the hook. Without it, the primer text (`magik-harness primer`, run elsewhere) can still be pasted into `AGENTS.md`, and the skills copied into `.agents/skills/`, but there is no session hook.

## 5. Afterwards

Suggest the user author the project's foundational context in the knowledge base (decisions, policies, specs), and mention `kb-sanitize` and `kb-code-sync` for keeping it healthy.
