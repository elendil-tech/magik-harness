# magik-harness CLI reference

```text
magik-harness <command> [options]
```

Run it without installing anything: `npx github:elendil-tech/magik-harness <command>`. The harness is distributed from GitHub only, so there is no npm package. This page writes `magik-harness <command>` for short; to have that on your PATH, clone the repository and run `npm link` once. Pin a release with a tag: `npx github:elendil-tech/magik-harness#v2.0.1 <command>`. `magik-harness <command> --help` (or `magik-harness help <command>`) prints the options of one command; this page is the longer version of those texts. `magik-harness --version` prints the version; with no command at all it prints the command list and exits `2`.

- [Conventions](#conventions)
- [install and upgrade](#install-and-upgrade)
- [uninstall](#uninstall)
- [doctor](#doctor)
- [status](#status)
- [resolve](#resolve)
- [init](#init)
- [list](#list)
- [primer](#primer)
- [Environment variables](#environment-variables)
- [Recipes](#recipes)

## Conventions

| | |
| --- | --- |
| Exit codes | `0` success (warnings allowed) · `1` something failed: a failed check, an install problem, a failed hook self-test, a cancelled prompt · `2` usage error (unknown option or command, bad value, a profile or pack that does not exist). A usage error writes nothing. |
| `--dry-run` | on every command that writes: print the plan, change nothing, exit `0` |
| `--json` | on every command except `primer`: one JSON document on stdout instead of the human text. Errors still go to stderr. |
| `--project-root <dir>` | act on a project other than the one the current directory is in. Default: the git root of the current directory (inside a linked worktree, that worktree's own root), or the directory itself when it is not a repo. |
| Scopes | `--scope project` (default) acts on the repo; `--scope global` acts on your home directory. See [ARCHITECTURE.md](ARCHITECTURE.md#4-scopes-project-and-global). |
| Idempotence | running `install` twice changes nothing the second time, and says so |
| Prompts | only a bare `install` in a terminal (it asks for a vault) and a global `install` in a terminal (it confirms before writing to your home directory). `--yes` or `--json` turns them off; when stdin or stdout is not a terminal it never prompts. |

## install and upgrade

```text
magik-harness install [options]
magik-harness upgrade [options]
```

`install` sets up the harness. `upgrade` is `install` with every setting taken from the lock file (profile, packs, tools, skills directory, pack directories): it refreshes managed files with newer content, restores a managed file that was deleted, and removes managed files that a newer version no longer ships. Edits you made are kept unless you pass `--force`. `upgrade` fails with a usage error when nothing is installed yet.

### Scope

| Option | |
| --- | --- |
| `--scope project\|global` | project: files in the repo, meant to be committed (default). global: files under your home directory; nothing in any repo. |
| `--project-root <dir>` | the project to install into |

### What to install

| Option | |
| --- | --- |
| `--profile minimal\|knowledge` | `minimal`: the delivery loop and git protocol, no vault (skills `harness`, `harness-fit`, `agentic-e2e-loop`). `knowledge`: everything, with a knowledge base and memory in a vault. Default: `knowledge` when a vault is known (`--vault`, an existing pointer), otherwise `minimal`. An existing install keeps its saved profile. |
| `--packs a,b` | opt-in skill packs (`magik-harness list` shows them): `worktrees`, `ci-runners` |
| `--pack-dir <dir>` | an extra directory of pack folders (`<dir>/<pack>/pack.json` and `<dir>/<pack>/skills/`), for a team's own policy bundles. Remembered in the lock, home-relative when it is under your home directory. |
| `--tools <list>` | `auto` (default), `none`, or a comma list of `cursor`, `claude`, `codex`, `generic`. `auto` detects `.cursor/`, `.claude/`, `CLAUDE.md` and `.codex/` in the project (or the same folders in your home for `--scope global`), and falls back to `cursor` with a note. A detected tool is skipped (with a note) when git ignores its hook file, such as a generated `.claude/`, because clones and worktrees would never get it; naming it with `--tools` installs it anyway and warns. `generic` (`AGENTS.md` and `.agents/skills`) is always part of the install. `none` writes no tool-specific files. |
| `--skills-dir <dir>` | where skills are written (default `.agents/skills`). When that folder is git-ignored and Cursor is a target, the installer picks `.cursor/skills` and says so; the choice is saved. |

### Vault (knowledge profile)

| Option | |
| --- | --- |
| `--vault <dir>` | the vault folder. `~` is supported. Created if missing. A path under your home directory is stored as `~/…` so the tracked pointer works on other machines; an absolute path elsewhere is stored as given, with a note that it will not resolve on other machines (per-machine paths belong in `.magik/harness.local.json`). |
| `--layout multi\|single` | `multi` (default): this project's stores are `<vault>/<project>/knowledge` and `<vault>/<project>/memory`. `single`: `<vault>/knowledge` and `<vault>/memory`. |
| `--knowledge-mount <path>`, `--memory-mount <path>` | override either mount (relative to the vault) |
| `--access-via path\|mcp` | `path` (default): local folders. `mcp`: the mounts are logical ids reached through an MCP server you configure yourself, not folders; without `--vault` the pointer's `vault` is `null` and nothing is created on disk. |
| `--kb-autonomy open\|ask\|readonly` | how freely the agent may write the KB on its own initiative (default `open`). Written to the pointer when it is created. |

The vault options only matter when the pointer is created. If `.magik/harness.json` already exists it is never rewritten; a different `--vault` is ignored with a note that names the file to edit.

### Safety

| Option | |
| --- | --- |
| `--dry-run` | print the plan, write nothing |
| `--force` | overwrite managed files you edited and paths the installer did not create; a backup is made first |
| `--yes`, `-y` | no prompts |
| `--json` | the plan as JSON (see below). Unless `--dry-run` is given the plan is still applied. |

### What `install` does, in order

1. Builds a **plan** from the disk: for every file, block and JSON entry it would manage, `create`, `update`, `merge`, `unchanged`, `keep` (you edited it), `conflict` (it exists and is not ours) or `remove`, with a reason.
2. Prints the plan (`--dry-run` stops here).
3. Applies it; anything it replaces or removes is copied to `.magik/backups/<timestamp>/` first (`~/.magik/backups/` at global scope).
4. Writes the lock file last.
5. Runs the installed session hook once with a synthetic payload (`hook self-test`). A failing hook makes the exit code `1`.

`install` manages only what it can prove it owns. Anything else in the project (an older pointer location, a hook script from an earlier setup, instructions that repeat the primer, scripts that name old paths) is left exactly as it was. Bringing those in line is the agent's work, done with the `harness-fit` skill: ask your agent to run it ([FITTING.md](FITTING.md)). A re-run of `install` that changed something prints the same hint.
### `install --json`

```json
{
  "command": "install",
  "dryRun": true,
  "scope": "project",
  "tools": ["cursor"],
  "profile": "knowledge",
  "packs": [],
  "skillsDir": ".agents/skills",
  "notes": ["no tool configuration detected; defaulting to cursor (pass --tools to change)"],
  "items": [
    { "type": "file", "action": "create", "path": ".magik/runtime/resolve.mjs", "key": ".magik/runtime/resolve.mjs", "reason": "new", "group": "runtime" },
    { "type": "seed", "action": "create", "path": ".magik/harness.json", "key": ".magik/harness.json", "reason": "new (yours from now on)" },
    { "type": "block", "action": "create", "path": "AGENTS.md", "key": "AGENTS.md#primer", "reason": "new file" }
  ]
}
```

`type` is one of `file`, `block` (a marked section of a file you own), `json` (one entry merged into a JSON file), `seed` (a file that is yours after creation), `remove`, `dir`, `notice`. `action` is one of `create`, `update`, `insert`, `merge`, `unchanged`, `keep`, `conflict`, `remove`, `skip`, `notice`. A `notice` carries `level` (`info` or `warn`).

## uninstall

```text
magik-harness uninstall [--scope project|global] [--purge] [--force] [--dry-run] [--json]
```

Removes what the lock file lists: managed files that are unmodified, the marked blocks (the text outside the markers is untouched), and its own entries in JSON files (everything else in them is preserved key for key, in order, with the file's indentation). A file that install created and that is now empty is deleted (`file created by magik-harness and now empty`); a file that existed before keeps all of its own content. The vault is never touched. With no lock file there is nothing to do: it says so and exits `0`.

| Option | |
| --- | --- |
| `--purge` | also remove the pointer or global config and the vault's starter `_index.md`, but only while they are still exactly what install wrote. An edited one is kept (it is real work). |
| `--force` | remove modified managed files, and with `--purge` edited pointers and indexes too. Everything removed this way is backed up first. |

Files you modified are **kept** and reported (`modified locally; kept`). Running it twice is fine.

## doctor

```text
magik-harness doctor [--scope project|global|all] [--strict] [--json] [--project-root <dir>]
```

Read-only. Prints one line per check, grouped by area, with the fix command under anything that is not fine:

```text
resolution
  ok   project acme: harness active via project
  ok   vault /home/me/vaults/acme

project install
  ok   installed v2.0.1: profile knowledge, tools cursor, packs none
  ok   20 managed files present
  ok   up to date with this CLI
  ok   hook registered in .cursor/hooks.json
  ok   session hook runs: emits the session context
  ok   9 skill folder(s) checked, all valid
  ok   primer present in AGENTS.md (3159 bytes)
  ok   no managed path is git-ignored

global install
  ..   not installed (~/.magik/lock.json does not exist)
       fix: magik-harness install --scope global --vault <dir>

Healthy: 0 failure(s), 0 warning(s).
```

When something is wrong the line says what (`FAIL` for broken, `!!` for a warning), and a `fix:` line under it gives the command that repairs it whenever there is one:

```text
resolution
  ok   project acme: harness active via project
  FAIL vault /home/me/vaults/acme does not exist
  FAIL Vault not found: /home/me/vaults/acme (from "~/vaults/acme"). Knowledge and memory are unavailable until it exists. Clone or create it, or point this machine elsewhere in .magik/harness.local.json (key `vault`). Check with `magik-harness doctor`.
```

Levels: `ok`, `info` (no action needed), `warn` (works, but something is off), `fail` (broken). The exit code is `1` when anything failed, or when anything warned and `--strict` is set. `--scope all` (default) checks both scopes and treats a missing install as information. The checks are listed in [ARCHITECTURE.md](ARCHITECTURE.md#11-doctor). When something fails or warns, or nothing is installed, the output ends with a hint to ask your agent to run the `harness-fit` skill: the CLI checks the files it owns, the skill handles the rest.

```json
{
  "command": "doctor",
  "version": "2.0.1",
  "ok": true,
  "failures": 0,
  "warnings": 0,
  "checks": [
    { "area": "project install", "level": "ok", "message": "20 managed files present" },
    { "area": "project install", "level": "fail", "message": "1 managed file(s) missing, e.g. .agents/skills/harness/SKILL.md", "fix": "magik-harness upgrade" }
  ]
}
```

## status

```text
magik-harness status [--json] [--project-root <dir>]
```

One screen: whether the project and the machine have an install (version, profile, tools, packs, and a hint when the CLI is newer), then what resolves for this project (the same text as `resolve`). `--json` gives `{ cliVersion, installs: [...], resolution: {...} }`. Always exits `0`.

## resolve

```text
magik-harness resolve [--json] [--project-root <dir>]
```

Prints where this project's knowledge base and memory live, which source decided it (`project`, `global` or `none`), the vault, each mount with its access mode and autonomy, and any warnings. It is the same code the session hook runs. Exit `1` when there are warnings (for example the vault folder is missing), otherwise `0`. `--json` prints the full resolution object (`active`, `source`, `projectName`, `vaultDir`, `vaultExists`, `knowledge`, `memory`, `mounts`, `warnings`, ...).

## init

```text
magik-harness init [--create-vault] [--dry-run] [--json] [--project-root <dir>]
```

Creates the project's `knowledge/` and `memory/` folders in its vault and a first `knowledge/_index.md`, for whichever pointer or global config resolves. It never overwrites. This is the per-project step of a global install (`<vault>/<project>/…`), and it repairs a project install whose vault folders were deleted.

A missing vault folder is refused by default, because it usually means the vault has not been cloned yet; `--create-vault` creates it. Without any pointer or global config it says what to run first (exit `1`).

## list

```text
magik-harness list [--json] [--pack-dir <dir>]
```

Profiles, core skills with their descriptions, packs with their requirements, and the tool adapters with their verification status. `--json` shape: `{ version, profiles, skills: [{ name, description }], packs: [{ name, description, skills, requires }], tools: [{ id, label, status }] }`.

## primer

```text
magik-harness primer [--scope project|global] [--profile minimal|knowledge]
```

Prints the primer text, rendered for a scope and profile, for tools that need it pasted into their own instruction file (a tool `install` has no adapter for, or a hosted agent's custom instructions).

## Environment variables

| Variable | Used by | Meaning |
| --- | --- | --- |
| `MAGIK_HOME` | CLI, hook | relocates the machine-level state (`~/.magik`): config, lock, runtime, backups. The registered global hook points at the relocated runtime. |
| `MAGIK_PROJECT_DIR` | hook | the project directory to resolve, ahead of anything the host passes |
| `CURSOR_PROJECT_DIR`, `CLAUDE_PROJECT_DIR` | hook | the host's own variable for the workspace, used when the payload has none |
| `MAGIK_DEBUG` | CLI | print a stack trace for an unexpected error instead of a one-line message |
| `MAGIK_TODAY` | hook | `YYYY-MM-DD` to use instead of today's date (tests, replaying a day) |

### The session hook

`install` registers `.magik/runtime/session-start.mjs` (or `~/.magik/runtime/session-start.mjs` for a global install) with each tool. A tool runs it at the start of a session, passing a JSON payload on stdin. You can run it yourself to see exactly what the agent would be given:

```text
node .magik/runtime/session-start.mjs [--format cursor|claude|text] [--max-memory-bytes <n>] [--no-git] [--project-root <dir>] < payload.json
```

`--format cursor` and `--format claude` print the JSON each tool expects (`{"additional_context": "…"}` for Cursor, `{"hookSpecificOutput": {"hookEventName": "SessionStart", "additionalContext": "…"}}` for Claude Code); `text` (the default) prints the context as plain text. With nothing to say, or on any error, it prints `{}` (or nothing for `text`) and exits `0`: a harness problem never blocks a session. Its first line is always `magik-harness session context v<version>`, which is how to tell, from inside a live session, that it ran.

The hook decides which project it is for by `--project-root`, then `MAGIK_PROJECT_DIR`, the payload's `workspace_roots[0]`, `CURSOR_PROJECT_DIR`, `CLAUDE_PROJECT_DIR`, the payload's `cwd`, and finally the process's own directory.

## Recipes

**Check a repo in CI.** Fails when the harness rotted: a managed file missing or hand-broken, the hook not registered, a skill that fails its lint, a managed path that got git-ignored. A CI machine has no vault, so the `resolution` area (which checks the vault folder) is left out:

```bash
npx github:elendil-tech/magik-harness#v2.0.1 doctor --scope project --json \
  | jq -e '[.checks[] | select(.level == "fail" and .area != "resolution")] | length == 0'
```

Add `or .level == "warn"` inside the `select` to fail on warnings too. With the vault cloned, `doctor --scope project --strict` alone does it.

**Install non-interactively on a new machine** (scripts, dotfiles, a dev container):

```bash
npx github:elendil-tech/magik-harness install --scope global --vault ~/vaults --tools cursor,claude --yes
```

**Preview, then apply, in a script:**

```bash
npx github:elendil-tech/magik-harness install --vault ~/vaults/acme --dry-run --json | jq '.items[] | select(.action != "unchanged")'
npx github:elendil-tech/magik-harness install --vault ~/vaults/acme --yes
```

**Give a whole team a policy bundle** without touching this package: keep `<repo>/packs/<name>/pack.json` and `skills/`, then `install --pack-dir <repo>/packs --packs <name>`.

**Move a project to another vault** (this machine only): put `{ "vault": "~/elsewhere" }` in `.magik/harness.local.json` (git-ignored). The tracked pointer stays as it is.

**Fit a project that already has a setup of its own** (an older layout, hand-made hooks, duplicated instructions): `npx github:elendil-tech/magik-harness install`, then ask your agent to run the `harness-fit` skill. After an `upgrade`, ask it again. [FITTING.md](FITTING.md) says what to expect.

**Undo everything:** `magik-harness uninstall` (and `--scope global`). Add `--purge` to drop the pointer too. Your vault and any file you edited stay.
