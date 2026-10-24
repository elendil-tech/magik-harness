# Changelog

Releases of magik-harness. The design of record is [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

## 2.0.1 — 2026-10-24

GitHub is the only distribution channel. There is no npm package and none is planned.

### Changed

- **Running the CLI.** `npx github:elendil-tech/magik-harness <command>` is the documented form everywhere: the README, `--help`, the docs, `/magik-harness-doctor`, and the `harness` and `harness-fit` skills. `npx magik-harness` and `magik-harness@<version>` never worked, because the package was never published. A tag pins a release (`…#v2.0.1`), and a clone plus `npm link` puts `magik-harness` on the PATH.
- **The package is private.** `package.json` says `"private": true` and has no `publishConfig`, so an accidental `npm publish` is refused. A test keeps it so, and fails if a doc, skill or source file goes back to the registry form.
- **Releases are tags**: `v2.0.0` and `v2.0.1`. The roadmap no longer has a publish step.

In a project, `magik-harness upgrade` refreshes the two skills, and `doctor` reports them as differing until then. The [fit notes](skills/harness-fit/references/versions.md) say what to change in a project's own files.

## 2.0.0 — 2026-10-24

Tracks `harness@2`. magik-harness continues the Cursor plugin `magik-repo` (the 1.x line) as a harness that does not depend on any one tool. The idea is unchanged: a code repo that points at an external vault of knowledge and memory, plus a few rules an agent follows. 2.0 makes it installable by anyone, into a project or onto a whole machine, for Cursor, Claude Code, Codex or any agent that reads `AGENTS.md` and Agent Skills. The Cursor plugin remains as optional packaging.

### Added

- **A CLI**: `magik-harness install | upgrade | doctor | status | resolve | init | uninstall | list | primer` ([docs/CLI.md](docs/CLI.md)). Plain ES modules, no runtime dependencies, Node 18.18 or newer, no build step, so it runs as is from a clone or straight from GitHub with `npx`. Every command that writes has `--dry-run`; most have `--json`; exit codes are `0` ok, `1` failed, `2` usage error, and a usage error writes nothing.
- **Fitting, as text an agent follows.** The CLI puts the harness on; the new `harness-fit` skill fits it to the project: survey, plan, strap on, adjust, check, hand over. It brings a project's own files in line with the one layout the CLI knows (scripts, tests, docs and CI settings that name old paths, hook scripts and primer blocks from earlier setups, duplicated instructions, homemade versions of what the harness provides) and it keeps a project fitted after every upgrade. It is instructions only: a `SKILL.md` and four references (`fitted`, `drift`, `stages`, `versions`), installed with every profile, with a `/magik-harness-fit` command for Cursor and a guide for people in [docs/FITTING.md](docs/FITTING.md). There are no migration commands and no code that reads an older layout. A test builds a real install and checks that `fitted.md` names everything the installer writes; another requires `versions.md` to have an entry for the current version.
- **Two first-class scopes.** *Project*: `.magik/` (pointer, lock, runtime, backups), skills in `.agents/skills/`, a primer block in `AGENTS.md`, a managed `.gitignore` block, tool registrations; all committed, so every clone and worktree has it. *Global*: `~/.magik/` and the machine-level files of each tool, nothing in any repository; a repository is covered when its project has a folder in the vault (`<vault>/<project>/{knowledge,memory}`), and `init` creates it. Both can coexist; a per-session lock keeps the two session hooks from injecting twice. `MAGIK_HOME` relocates the machine-level directory.
- **Tool adapters.** Cursor (**verified** against `cursor-agent` 2026.10.01), Claude Code and Codex (experimental: implemented from documentation, covered by file-level tests), and a generic adapter for anything that reads `AGENTS.md` and `.agents/skills`. `--tools auto` detects what is configured. [docs/TOOLS.md](docs/TOOLS.md) says what each tool receives and how a status is earned.
- **One session hook for every tool**: `.magik/runtime/session-start.mjs --format cursor|claude|text`. It prints a marker line (`magik-harness session context v…`) so an agent can tell it ran, the resolved paths, today's memory (capped; default 4000 bytes), the git sync state and next steps. It never fails a session (any error prints `{}` and exits 0, with the reason on stderr), takes about 80 ms with Node's startup included, and deduplicates against a second registration of itself.
- **Profiles and packs.** `minimal` (the delivery loop and git protocol; no vault) and `knowledge` (everything). Opt-in packs: `worktrees` (a location convention plus a fail-closed audit) and `ci-runners` (an example CI policy). `--pack-dir` adds your own packs without touching this package.
- **Ownership you can trust.** A lock file records a hash of every file the installer wrote; a file you edited is never overwritten without `--force`, and anything replaced or removed is first copied to `.magik/backups/<timestamp>/`. Blocks inside files you own (`AGENTS.md`, `.gitignore`) are marked and replaced in place. Entries in `hooks.json` and `settings.json` are merged key for key, in order, with the file's indentation and final newline. Files the installer seeds for you (the pointer, the vault index) are tracked too, so `uninstall --purge` removes them only while unedited. The project lock carries no path of this machine (`~/…` for anything under your home), because it is committed. The CLI never touches what it does not own, which a test pins.
- **`doctor`**: checks resolution, the lock, managed files against their hashes, hook registration and a real run of the hook, skill lint, the primer's size and git-ignored managed paths, each with the command that fixes it. When anything fails or warns, it ends with a hint to run the `harness-fit` skill. `--strict` and `--json` for CI.
- **Detection that respects git.** A tool that is only auto-detected is skipped, with a note, when git ignores its hook file (a repo that lets a generator own a git-ignored `.claude/`, say), so an install never ends up half-shared. `--tools <tool>` forces it and warns.
- **Docs**: a README that explains the harness with the picture of a harness on a horse (the parts, the actions, fitting at the start, middle and end of a project, drift), [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md), [docs/CLI.md](docs/CLI.md), [docs/TOOLS.md](docs/TOOLS.md), [docs/FITTING.md](docs/FITTING.md), a new banner and social card.
- **Tests**: more than 300, none touching your real home directory or your real repositories (each runs in throwaway directories with a fake `HOME`). They cover the resolver, the hook, both scopes, `doctor`, the plan/apply/lock machinery, a lint of every skill, and the fit skill against what the installer writes. CI runs them on Linux with Node 22.

### Changed

- **Name**: `magik-repo` is now `magik-harness`, in the repository, the package, the CLI and the plugin manifest.
- **Pointer**: `.cursor/harness.json` is now `.magik/harness.json`, schema `magik-harness/harness@2`; the overlay is `.magik/harness.local.json`. Only that location is read. Resolution order: overlay over the project pointer, then the machine's `~/.magik/config.json`, then nothing.
- **Rules became skills**, so they reach every tool, not just Cursor: `agentic-work` → `agentic-e2e-loop`, `memory` → `harness-memory`; `harness`, `knowledge-base`, `kb-conventions`, `kb-search`, `kb-sanitize` and `kb-code-sync` keep their names; `ci-runners` and `worktrees` are now opt-in packs (`ci-runners`, `worktree-audit`).
- **The primer** (always-on text) is one short block in `AGENTS.md`: about 0.9 KB for `minimal`, 3 KB for `knowledge`, with a 5 KB budget that `doctor` enforces. It used to be spread across rules only Cursor loaded.
- **The hook** is `.magik/runtime/session-start.mjs`, and knowledge-profile context now also names the `agentic-e2e-loop` skill, so a global Cursor install, which has no primer file, still tells the agent about the loop.
- **Cursor plugin packaging** is optional and generated from the same content: `pnpm install-plugin`. It supplies the core skills and the `/magik-harness-*` commands (`fit`, `doctor`, `kb-sanitize`, `kb-code-sync`).
- **CI** (`.github/workflows/test.yml`): one Linux job on Node 22, `pull_request` only, draft pull requests skipped, concurrency cancelling superseded runs, a timeout on every job, documentation-only changes skipped.

### Removed

- The Cursor plugin as the only way to get the harness, its `rules/` directory and its setup hook script.
- Nothing is removed from your vault.

### Verified

- Against `cursor-agent` 2026.10.01, with a canary only the channel under test could supply: the `AGENTS.md` primer, project skills, the project `sessionStart` hook and its memory injection, the global hook with the per-project vault convention, `~/.agents/skills`, silence in a repository the harness does not cover, and exactly one context line when both scopes are installed. Also verified, as a negative: rule files in `~/.cursor/rules/` do not reach the model, so a global install writes none and the Cursor adapter says so ([docs/TOOLS.md](docs/TOOLS.md#cursor)).
- A global install on a real machine round-trips: `~/.cursor/hooks.json` (with other tools' hooks in it) is restored byte for byte by `uninstall`.
- The `harness-fit` skill, end to end: a headless `cursor-agent -p --trust --force "Fit the harness to this project."` over a clone of a real project with an older layout. The agent branched, committed the install, kept the project's own vault mounts and autonomy, replaced the older pointer, hook, primer block and ignore block, adapted a guard test and a doc, ran `doctor` and the project's test, and left CI alone with a note. Two real projects were then fitted by following the same skill, one of them with its own worktree and vault scripts, which now ask the resolver instead of reading the pointer themselves.
