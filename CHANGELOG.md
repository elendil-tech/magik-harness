# Changelog

Releases of magik-harness. The 1.x line, when this was the Cursor plugin `magik-repo`, is in [docs/history/CHANGELOG-v1.md](docs/history/CHANGELOG-v1.md).

## 2.0.0 — unreleased (2026-10-13)

Tracks `harness@2`. **The harness is no longer a Cursor plugin.** It was a plugin because that was the first tool it ran in; the idea (a code repo that points at an external vault of knowledge and memory, plus a few rules an agent follows) never depended on Cursor. 2.0 renames it to **magik-harness** and makes it installable by anyone, into a project or onto a whole machine, for Cursor, Claude Code, Codex or any agent that reads `AGENTS.md` and Agent Skills. The Cursor plugin remains as optional packaging. Migrating from 1.x: [docs/MIGRATION.md](docs/MIGRATION.md).

### Added

- **A CLI**: `magik-harness install | upgrade | doctor | status | resolve | init | uninstall | list | primer` ([docs/CLI.md](docs/CLI.md)). Plain ES modules, no runtime dependencies, Node 18.18 or newer, no build step, so `npx magik-harness …` runs as is. Every command that writes has `--dry-run`; most have `--json`; exit codes are `0` ok, `1` failed, `2` usage error, and a usage error writes nothing.
- **Two first-class scopes.** *Project*: `.magik/` (pointer, lock, runtime, backups), skills in `.agents/skills/`, a primer block in `AGENTS.md`, a managed `.gitignore` block, tool registrations; all committed, so every clone and worktree has it. *Global*: `~/.magik/` and the machine-level files of each tool, nothing in any repository; a repository is covered when its project has a folder in the vault (`<vault>/<project>/{knowledge,memory}`), and `init` creates it. Both can coexist; a per-session lock keeps the two session hooks from injecting twice. `MAGIK_HOME` relocates the machine-level directory.
- **Tool adapters.** Cursor (**verified** against `cursor-agent` 2026.10.01), Claude Code and Codex (experimental: implemented from documentation, covered by file-level tests), and a generic adapter for anything that reads `AGENTS.md` and `.agents/skills`. `--tools auto` detects what is configured. [docs/TOOLS.md](docs/TOOLS.md) says what each tool receives and how a status is earned.
- **One session hook for every tool**: `.magik/runtime/session-start.mjs --format cursor|claude|text`. It prints a marker line (`magik-harness session context v…`) so an agent can tell it ran, the resolved paths, today's memory (capped; default 4000 bytes), the git sync state and next steps. It never fails a session (any error prints `{}` and exits 0, with the reason on stderr), takes about 80 ms with Node's startup included, and deduplicates against a second registration of itself.
- **Profiles and packs.** `minimal` (the delivery loop and git protocol; no vault) and `knowledge` (everything). Opt-in packs: `worktrees` (a location convention plus a fail-closed audit) and `ci-runners` (an example CI policy). `--pack-dir` adds your own packs without touching this package.
- **Ownership you can trust.** A lock file records a hash of every file the installer wrote; a file you edited is never overwritten without `--force`, and anything replaced or removed is first copied to `.magik/backups/<timestamp>/`. Blocks inside files you own (`AGENTS.md`, `.gitignore`) are marked and replaced in place. Entries in `hooks.json` and `settings.json` are merged key for key, in order, with the file's indentation and final newline. Files the installer seeds for you (the pointer, the vault index) are tracked too, so `uninstall --purge` removes them only while unedited. The project lock carries no path of this machine (`~/…` for anything under your home), because it is committed.
- **`doctor`**: checks resolution, the lock, managed files against their hashes, hook registration and a real run of the hook, skill lint, the primer's size, git-ignored managed paths and 1.x leftovers, each with the command that fixes it. `--strict` and `--json` for CI.
- **Migration from 1.x in one `install`** (pointer, overlay, hook, primer and ignore blocks), with a plan first, backups, and every ambiguous case either kept with a loud warning or refused with exit code 2.
- **Docs**: a new README, [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md), [docs/CLI.md](docs/CLI.md), [docs/TOOLS.md](docs/TOOLS.md), [docs/MIGRATION.md](docs/MIGRATION.md), a new banner and social card.
- **Tests**: more than 300, none touching your real home directory or your real repositories (each runs in throwaway directories with a fake `HOME`). They cover the resolver, the hook, both scopes, migration from a 1.9.1 fixture, `doctor`, the plan/apply/lock machinery and a lint of every skill. CI runs them on Linux, macOS and Windows on Node 22, and on Node 18 and 24 on Linux.

### Changed

- **Name**: `magik-repo` is now `magik-harness`. The repository keeps its URL until it is renamed.
- **Pointer**: `.cursor/harness.json` is now `.magik/harness.json`, schema `magik-harness/harness@2` (a superset; `harness@1` is still read). The overlay is `.magik/harness.local.json`. Resolution order: overlay over the project pointer, then the machine's `~/.magik/config.json`, then nothing.
- **Rules became skills**, so they reach every tool, not just Cursor: `agentic-work` → `agentic-e2e-loop`, `memory` → `harness-memory`, `harness`, `knowledge-base` and `kb-conventions` keep their names; `ci-runners` and `worktrees` are now opt-in packs (`ci-runners`, `worktree-audit`). `kb-search`, `kb-sanitize` and `kb-code-sync` keep their names. A new `harness-setup` skill helps an agent install or repair the harness.
- **The primer** (always-on text) is one short block in `AGENTS.md`: about 0.8 KB for `minimal`, 3 KB for `knowledge`, with a 5 KB budget that `doctor` enforces. It used to be spread across rules only Cursor loaded.
- **The hook** is `.magik/runtime/session-start.mjs` (was `.cursor/hooks/session-start.js`), and knowledge-profile context now also names the `agentic-e2e-loop` skill, so a global Cursor install, which has no primer file, still tells the agent about the loop.
- **Cursor plugin packaging** is optional and generated from the same content: `pnpm install-plugin`. It supplies the core skills and the `/magik-harness-*` commands (`setup`, `doctor`, `kb-sanitize`, `kb-code-sync`).
- **CI** (`.github/workflows/test.yml`): `pull_request` only, concurrency cancelling superseded runs, a timeout on every job, documentation-only changes skipped.

### Removed

- The Cursor plugin as the only way to get the harness; `hooks/setup.ts`; the `/magik-repo-*` commands; the `rules/` directory; the Cursor-logo banner assets.
- Nothing is removed from your vault, and 1.x projects keep working until you migrate.

### Verified

- Against `cursor-agent` 2026.10.01, with a canary only the channel under test could supply: the `AGENTS.md` primer, project skills, the project `sessionStart` hook and its memory injection, the global hook with the per-project vault convention, `~/.agents/skills`, silence in a repository the harness does not cover, and exactly one context line when both scopes are installed. Also verified, as a negative: rule files in `~/.cursor/rules/` do not reach the model, so a global install writes none and the Cursor adapter says so ([docs/TOOLS.md](docs/TOOLS.md#cursor)).
- A global install on a real machine round-trips: `~/.cursor/hooks.json` (with other tools' hooks in it) is restored byte for byte by `uninstall`.
