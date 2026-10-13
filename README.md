<div align="center">

<img src="./assets/banner.png" alt="magik-harness: a harness for AI coding agents" width="100%" />

<p>
  <a href="https://github.com/codeisalifestyle/magik-repo-plugin/releases">
    <img alt="Version" src="https://img.shields.io/badge/version-2.0.0-8A2BE2?style=for-the-badge" />
  </a>
  <a href="https://github.com/codeisalifestyle/magik-repo-plugin/blob/main/LICENSE">
    <img alt="License" src="https://img.shields.io/badge/license-MIT-22c55e?style=for-the-badge" />
  </a>
  <img alt="Node" src="https://img.shields.io/badge/node-%E2%89%A518.18-339933?style=for-the-badge&logo=nodedotjs&logoColor=white" />
  <img alt="Runtime dependencies" src="https://img.shields.io/badge/runtime%20deps-0-0ea5e9?style=for-the-badge" />
</p>

**A repo, a vault, and a few rules the agent follows.**
One CLI installs the harness into a project or onto your whole machine. It works with Cursor, Claude Code, Codex, or any agent that reads `AGENTS.md`.

**Try the Magik!**

</div>

---

## What it is

A **harness** wraps an ordinary code repository with the few things an AI coding agent needs to work well in it, and nothing more. Your repo stays a normal repo. The harness adds:

- **A vault**: plain-Markdown folders outside the repo (an Obsidian vault, any git repo of notes). It holds a **knowledge base** (the project's ground truth: decisions, policies, specs) and **memory** (the agent's running log, one file per day).
- **A pointer** (`.magik/harness.json`) that says where the vault is. It is tracked, so every clone and every git worktree resolves the same vault.
- **A primer**: a short, always-on block in `AGENTS.md` with four rules (gather context first, keep the KB in sync, memory is for recency, close the loop).
- **Skills** in the open [Agent Skills](https://agentskills.io) format: the procedures behind those rules, loaded on demand.
- **A session hook**: a small zero-dependency Node script that injects today's memory, the vault paths and the git state when a session starts.

Everything is a plain file. `magik-harness` is the tool that installs, upgrades, checks and removes those files without ever overwriting yours.

## Quick start

You need Node 18.18 or newer. There is nothing to build and nothing to install first.

```bash
# in a project: files go into the repo, meant to be committed
npx magik-harness install --vault ~/vaults/my-project

# or once for the whole machine: files go under your home directory, no repo is touched
npx magik-harness install --scope global --vault ~/vaults

# no vault at all: just the delivery loop and the git protocol
npx magik-harness install --profile minimal

# see what it would do first, check the result afterwards
npx magik-harness install --vault ~/vaults/my-project --dry-run
npx magik-harness doctor
```

Pin a version with `npx magik-harness@2.0.0 ...`. Straight from GitHub (no npm needed):

```bash
npx github:codeisalifestyle/magik-repo-plugin install --vault ~/vaults/my-project
```

Then start a session in your tool. The first lines of the agent's context come from the hook and begin with `magik-harness session context`; [docs/TOOLS.md](docs/TOOLS.md#checking-it-in-a-live-session) shows how to confirm that on purpose.

## Project scope or global scope

Both are first-class, and you can use both.

| | Project (default) | Global (`--scope global`) |
| --- | --- | --- |
| Where files go | inside the repo | under your home directory |
| Committed? | yes, teammates, CI and every worktree get it | no, nothing in any repo |
| Pointer | `.magik/harness.json` | `~/.magik/config.json` (one vault, one folder per project) |
| Primer | managed block at the top of `AGENTS.md` | each tool's user-level instruction file |
| Skills | `.agents/skills/` | `~/.agents/skills/` |
| Per-project step | none | `magik-harness init` creates the project's vault folders |
| Choose it when | the repo should carry its own harness | you want every repo covered, or the repos are not yours to change |

When both are installed they do not fight: the project pointer wins, same-name skills collapse, and a per-session marker keeps the two hooks from injecting the context twice.

## What a project install writes

```text
AGENTS.md                    managed primer block at the top; the rest is yours
.gitignore                   managed block (ignores the per-machine overlay)
.magik/
  harness.json               the pointer (yours after creation)
  harness.local.json         optional per-machine override (gitignored)
  lock.json                  every managed file with a content hash
  runtime/                   the session hook: three small .mjs files
  backups/                   copies of anything replaced or removed (gitignored)
.agents/skills/<skill>/      the skills
.cursor/hooks.json           one merged entry   (when Cursor is a target)
.claude/ and CLAUDE.md       settings entry, skills copy, @AGENTS.md import (Claude Code)
```

## Commands

| Command | What it does |
| --- | --- |
| `install` | set up a project or the machine; migrates a 1.x install in the same pass |
| `upgrade` | re-apply with newer content, keeping your edits |
| `doctor` | read-only health check with a fix command for everything it reports |
| `status` | one screen: installs found, versions, what resolves here |
| `resolve` | where this project's knowledge base and memory live, and why |
| `init` | create the project's folders in the vault |
| `uninstall` | remove what was installed; your vault is never touched |
| `list` | profiles, skills, packs and tool adapters |
| `primer` | print the primer text, for tools without a primer file |

Every mutating command supports `--dry-run`, and every command except `primer` supports `--json`. Exit codes are `0` ok, `1` failure or an unhealthy `doctor`, `2` usage error. The full reference is [docs/CLI.md](docs/CLI.md).

## Works with

| Tool | Primer | Skills | Session hook | Status |
| --- | --- | --- | --- | --- |
| **Cursor** (IDE and `cursor-agent`) | `AGENTS.md` | `.agents/skills` | `.cursor/hooks.json` | verified against `cursor-agent` 2026.10 |
| **Claude Code** | `CLAUDE.md` imports `AGENTS.md` | `.claude/skills` copy | `.claude/settings.json` | experimental: implemented from the documented formats |
| **Codex CLI** | `AGENTS.md` | `.agents/skills` | none; the primer tells the agent to run the script by hand | experimental |
| **Anything else** that reads `AGENTS.md` | `AGENTS.md` | `.agents/skills` | `node .magik/runtime/session-start.mjs --format text` | the open conventions |

"Verified" means observed in a live session; "experimental" means covered by file-level tests but not yet run against the live tool. The details are in [docs/TOOLS.md](docs/TOOLS.md).

## Skills and packs

The `knowledge` profile installs eight skills; `minimal` installs two (`harness`, `agentic-e2e-loop`); `harness-setup` is added at global scope.

| Skill | Use it for |
| --- | --- |
| `harness` | the operating model, how the pointer resolves, the four rules in full |
| `kb-search` | the pre-task gate: read the KB, then check it against the code and the live state |
| `knowledge-base` | how to read and maintain the KB, and what the autonomy setting allows |
| `kb-conventions` | an optional metadata standard: frontmatter, tags, relations |
| `kb-sanitize` | heal the KB from the inside: conflicts, duplicates, broken links |
| `kb-code-sync` | check the KB against the code for drift |
| `harness-memory` | the running log: cadence, layout, why it never auto-promotes into the KB |
| `agentic-e2e-loop` | orient, implement, verify, ship, sync knowledge, clean up |

Opt-in **packs** (`--packs worktrees,ci-runners`) add opinionated bundles: a worktree location convention with a fail-closed audit (`worktrees`), and an example CI policy for private repos on a free plan (`ci-runners`). A team can keep its own packs in a private repo and install them with `--pack-dir`.

## Safe by construction

- **It owns only what it can prove it owns.** Every managed file is recorded with a hash. A file you edited is never overwritten without `--force`, and `--force` makes a backup first.
- **It merges, it does not replace.** Your `AGENTS.md`, `.gitignore`, `hooks.json`, `settings.json` and `~/.codex/AGENTS.md` keep every line of yours, and uninstall hands them back byte for byte.
- **Dry run first.** `--dry-run` prints the plan and writes nothing.
- **Fail open, never silent.** A hook error never blocks a session. A harness that is configured but broken (for example a repo cloned without its vault) says so, loudly, in the session context. A repo with no harness stays quiet.
- **No network, no credentials.** The CLI and the hook read the pointer, the vault folders it names and the git state. Secrets never belong in the pointer or the vault.

## Optional: the Cursor plugin

The Cursor plugin in this repo (`.cursor-plugin/`) is a convenience for people who live in Cursor: the skills and four slash commands (`/magik-harness-setup`, `/magik-harness-doctor`, `/magik-harness-kb-sanitize`, `/magik-harness-kb-code-sync`). It is not required and it cannot replace the CLI: the harness lives in your files, not in the IDE. To try it from a checkout:

```bash
node scripts/install-plugin.mjs        # copies it to ~/.cursor/plugins/local/magik-harness
node scripts/install-plugin.mjs --uninstall
```

## Coming from magik-repo 1.x

`npx magik-harness install` in a 1.x project migrates it in one pass: the pointer and overlay move to `.magik/`, the old hook script is replaced, both managed blocks are replaced in place, and everything it removes is backed up. A hook script you edited is kept and `doctor` tells you. See [docs/MIGRATION.md](docs/MIGRATION.md).

## Development

```bash
pnpm install
pnpm check          # tsc --noEmit, then the whole test suite
node scripts/run-tests.mjs install    # only test files whose name contains "install"
```

Plain ESM JavaScript, checked with `tsc --checkJs`, no build step, zero runtime dependencies; the tests are TypeScript run with `tsx` on `node:test`. The design of record is [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md); what is shipped is in the [CHANGELOG](CHANGELOG.md) and what is deferred is in the [ROADMAP](ROADMAP.md).

```text
bin/        the CLI entry point
src/        the installer: plan, apply, lock, adapters, commands
runtime/    what gets copied into a project: resolver, git context, session hook
skills/     the core skills        packs/   opt-in skill packs
content/    primers, profiles, the vault starter
tests/      one suite per concern, each run against throwaway directories with a fake HOME
docs/       architecture, CLI, tools, migration
```

## License

[MIT](LICENSE)
