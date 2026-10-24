<div align="center">

<img src="./assets/banner.png" alt="magik-harness: a harness for AI coding agents" width="100%" />

<p>
  <a href="https://github.com/elendil-tech/magik-harness/releases">
    <img alt="Version" src="https://img.shields.io/badge/version-2.0.1-8A2BE2?style=for-the-badge" />
  </a>
  <a href="https://github.com/elendil-tech/magik-harness/blob/main/LICENSE">
    <img alt="License" src="https://img.shields.io/badge/license-MIT-22c55e?style=for-the-badge" />
  </a>
  <img alt="Node" src="https://img.shields.io/badge/node-%E2%89%A518.18-339933?style=for-the-badge&logo=nodedotjs&logoColor=white" />
  <img alt="Runtime dependencies" src="https://img.shields.io/badge/runtime%20deps-0-0ea5e9?style=for-the-badge" />
</p>

**A repo, a vault, and a few rules the agent follows.**
One CLI puts the harness on a project or on your whole machine, and an agent fits it to that project. It works with Cursor, Claude Code, Codex, or any agent that reads `AGENTS.md`.

**Try the Magik!**

</div>

---

## In thirty seconds

```bash
npx github:elendil-tech/magik-harness install --vault ~/vaults/my-project     # tack up: put the harness on
```

Then tell your agent: **"Fit the harness to this project."** It adjusts the project to the harness, checks the result, and hands you a commit to review.

## The idea: a harness for a horse

Think of your project as a horse and your AI agent as its rider.

The rider is skilled, but new to this horse at the start of every ride. It does not know the horse's history, what was decided last month or what happened yesterday, and it will not remember today tomorrow. A harness is the gear between horse and rider that fixes that, without changing the horse.

| On the horse | In magik-harness | What it does |
| --- | --- | --- |
| **The horse** | your project, the code repo | stays an ordinary horse: nothing about your code or your folders is imposed |
| **The rider** | the agent: Cursor, Claude Code, Codex, any tool that reads `AGENTS.md` | skilled, but new to this horse every ride |
| **The stable** | the **vault**: plain-Markdown folders outside the repo (an Obsidian vault, any git repo of notes) | where the horse's records live: a care book, the **knowledge base** (decisions, policies, specs: the project's ground truth), and a ride log, **memory** (what happened, one file a day) |
| **The lead rope** | the **pointer**, `.magik/harness.json` | ties this horse to its stable. It is tracked, so every clone and every git worktree finds the same stable |
| **The saddle** | the **primer**, a short block in `AGENTS.md` | what the rider sits on every ride: four rules (gather context first, keep the KB in sync, memory is for recency, close the loop) |
| **The girth** | the **session hook** and the **lock** | holds the saddle in place and tells the rider, at the start of every ride, whether it is still tight: today's memory, the vault paths, the git state, and a loud warning when something has come loose |
| **Stirrups and reins** | **skills**, in the open [Agent Skills](https://agentskills.io) format | what the rider reaches for to steer: procedures loaded on demand |
| **Saddlebags** | **packs** | optional kit for a particular journey (worktrees, a CI policy), strapped on when needed |

Two jobs get the gear onto the horse, and they are deliberately different:

- **Tacking up** is mechanical: the same straps, put on the same way, every time. That is the **CLI**. It writes only files it can prove are its own, records a hash of each, and never overwrites anything you changed.
- **Fitting** is judgment. No two horses have the same back, and a saddle that fits one slides on another. That is the **`harness-fit` skill**: text an agent follows to adjust the project around the straps (scripts, docs, CI settings, older instructions) and to keep it adjusted.

## Not every horse is the same

A harness can go on at any time, and what the fitting involves depends on when.

| Moment | The horse | What the fitting does |
| --- | --- | --- |
| **A foal**: a new project | nothing to adjust yet, no habits | tack up, build the stall, check. A few minutes |
| **A horse in training**: a project in progress | code, docs, CI, scripts, and perhaps instructions for agents of its own | look first, then strap on; carry over what is worth keeping; take away only what is now a copy; fix what still names old paths |
| **A veteran**: a late-stage project | years of tack: an older version of this harness (the Cursor plugin it started as, `magik-repo`, included), a homemade one, several tools' instruction files, scripts wrapped around all of it | the same, slower: step by step, checking the project after each, and anything doubtful is kept and listed for you |

**The action that starts it is one sentence to your agent:** "Fit the harness to this project." (In Cursor, `/magik-harness-fit`; `install` and `doctor` both end with the hint.) The fitting then goes:

1. **Look at the horse.** Survey: what is installed, what a fitted project looks like, and a search of the whole repo for old tack and copies. Nothing changes yet.
2. **Plan the fit.** Written down and shown to you: what the CLI will do, what the agent will change, remove and keep, and why. You are asked only what the project cannot answer.
3. **Strap on.** The CLI runs, dry run first.
4. **Adjust.** The agent carries over what is yours, removes what is now a copy, and fixes every script, test, doc and CI setting that names an old path.
5. **Walk it round the paddock.** `doctor`, the project's own checks, a run of the session hook, a second search for the old names.
6. **Hand back the reins.** One commit on a branch of its own, a short report, and a list of what you decide. Nothing is pushed or merged unless you ask.

There are no migration commands and no scripts for this. The package knows one layout; anything that does not match it is drift, and the agent adjusts it in a diff you can read. [docs/FITTING.md](docs/FITTING.md) shows what to expect.

## The saddle slips: keeping it fitted

A saddle that fit last month can have shifted to one side: the horse changes, the rider changes, straps stretch. Projects drift the same way, so the harness has ways to notice and to straighten it.

| What slips | Like | What notices it | What straightens it |
| --- | --- | --- | --- |
| A managed file is edited or reformatted | a strap stretching | `magik-harness doctor`, which checks the hashes in the lock | `upgrade` (it backs the file up first), or the agent moves your edit into a file of your own |
| The harness is upgraded and the project is not | the maker ships a better strap | `doctor` and `status` say the install is behind | `upgrade`, then "fit the harness again": the skill carries release notes of what each version asks of a project |
| Scripts, docs or CI still name old paths | the saddle shifted to one side | the fitting's search for them, or a guard test that pins a layout | the agent updates them |
| Someone pastes the instructions into a second file | two saddles on one horse | the fitting's list of duplicates | the copy goes |
| A clone has no vault | the stable door is locked | the session hook warns, loudly, at the start of the session; `doctor` fails | clone the vault, or point this machine at it in `.magik/harness.local.json` |
| The knowledge base no longer matches the code | worn shoes | `kb-code-sync` | `kb-sanitize` and `kb-code-sync` propose, you approve |

Nothing runs in the background. The checks run when you or the agent ask, and `doctor --strict` is safe in CI.

## Quick start

You need Node 18.18 or newer and git. There is nothing to build and nothing to install first.

```bash
# in a project: files go into the repo, meant to be committed
npx github:elendil-tech/magik-harness install --vault ~/vaults/my-project

# or once for the whole machine: files go under your home directory, no repo is touched
npx github:elendil-tech/magik-harness install --scope global --vault ~/vaults

# no vault at all: just the delivery loop and the git protocol
npx github:elendil-tech/magik-harness install --profile minimal

# see what it would do first, check the result afterwards
npx github:elendil-tech/magik-harness install --vault ~/vaults/my-project --dry-run
npx github:elendil-tech/magik-harness doctor
```

magik-harness is distributed from GitHub only: there is no npm package, on purpose. `npx` fetches it straight from this repository, so the commands above run the latest `main`. Pin a release with a tag (`npx github:elendil-tech/magik-harness#v2.0.1 doctor`). For a short command, clone the repository and run `npm link` once; then `magik-harness <command>` works anywhere, which is how the rest of this page writes it.

Then start a session in your tool. The first lines of the agent's context come from the hook and begin with `magik-harness session context`; [docs/TOOLS.md](docs/TOOLS.md#checking-it-in-a-live-session) shows how to confirm that on purpose. If the project already had a setup of its own, now is the time for "Fit the harness to this project."

## Commands: what each one is in the stable

| Command | In the stable | What it does |
| --- | --- | --- |
| `install` | **Tack up** | put the harness on a project or on the machine; `--dry-run` first |
| the `harness-fit` skill | **Fit the saddle** | adjust the project to the harness and keep it adjusted: ask your agent |
| `upgrade` | **Fit new tack** | refresh the managed files with newer content, keeping your edits; then fit again |
| `doctor` | **Check the girth** | read-only health check, with a fix command for everything it reports |
| `status` | **Read the stall door** | one screen: installs found, versions, what resolves here |
| `resolve` | **Follow the lead rope** | where this project's knowledge base and memory live, and why |
| `init` | **Build the stall** | create the project's folders in the vault |
| `uninstall` | **Take the tack off** | remove what was installed; the horse and the stable are never touched |
| `list` | **Open the tack room** | profiles, skills, packs and tool adapters |
| `primer` | **The rider's handbook** | print the primer text, for tools without a primer file |

Every mutating command supports `--dry-run`, and every command except `primer` supports `--json`. Exit codes are `0` ok, `1` failure or an unhealthy `doctor`, `2` usage error. The full reference is [docs/CLI.md](docs/CLI.md).

## Skills: the modular part

Everything the rider reaches for is a skill: a folder with a `SKILL.md`, in the open [Agent Skills](https://agentskills.io) format, loaded only when the task calls for it. The `knowledge` profile installs nine; `minimal` installs three (`harness`, `harness-fit`, `agentic-e2e-loop`).

| Skill | In the stable | Use it for |
| --- | --- | --- |
| `harness` | the manual for the whole outfit | the operating model, how the pointer resolves, the four rules in full |
| `harness-fit` | fitting the saddle | install, upgrade and re-align a project with the harness |
| `kb-search` | walking the course before the ride | the pre-task gate: read the KB, then check it against the code and the live state |
| `knowledge-base` | keeping the care book | how to read and maintain the KB, and what the autonomy setting allows |
| `kb-conventions` | a house style for the care book | an optional metadata standard: frontmatter, tags, relations |
| `kb-sanitize` | grooming | heal the KB from the inside: conflicts, duplicates, broken links |
| `kb-code-sync` | checking the shoes against the ground | check the KB against the code for drift |
| `harness-memory` | keeping the ride log | the running log: cadence, layout, why it never auto-promotes into the KB |
| `agentic-e2e-loop` | the whole ride, mounting up to cooling down | orient, implement, verify, ship, sync knowledge, clean up |

### Mounting more

Skills are the modular level of the harness: each one is a folder, and the harness has mount points for them. `--packs` mounts the opt-in bundles in this repo: `worktrees` (a worktree location convention with a fail-closed audit) and `ci-runners` (an example CI policy for private repos on a free plan). `--pack-dir` mounts bundles from anywhere, such as a team's private repo, and anything that follows the Agent Skills format will do. The pointer works the same way for knowledge: its `mounts` say which vault folders are mounted as which stores, so a project can read a shared company knowledge base next to its own.

That mechanism is meant to carry more than engineering practice. A whole **business OS** could mount on it: a bundle of skills for running a company, across the domains a business has (engineering, product, marketing, sales, strategy, legal and more) and the sub-domains inside each. That is not part of this repository and nothing here depends on it; it is only what the harness leaves room for.

## Project scope or global scope

Both are first-class, and you can use both. Project scope is tack that stays with the horse; global scope is tack the rider carries to every horse.

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

## Works with

| Tool | Primer | Skills | Session hook | Status |
| --- | --- | --- | --- | --- |
| **Cursor** (IDE and `cursor-agent`) | `AGENTS.md` | `.agents/skills` | `.cursor/hooks.json` | verified against `cursor-agent` 2026.10 |
| **Claude Code** | `CLAUDE.md` imports `AGENTS.md` | `.claude/skills` copy | `.claude/settings.json` | experimental: implemented from the documented formats |
| **Codex CLI** | `AGENTS.md` | `.agents/skills` | none; the primer tells the agent to run the script by hand | experimental |
| **Anything else** that reads `AGENTS.md` | `AGENTS.md` | `.agents/skills` | `node .magik/runtime/session-start.mjs --format text` | the open conventions |

"Verified" means observed in a live session; "experimental" means covered by file-level tests but not yet run against the live tool. The details are in [docs/TOOLS.md](docs/TOOLS.md).

## Safe by construction

- **It owns only what it can prove it owns.** Every managed file is recorded with a hash. A file you edited is never overwritten without `--force`, and `--force` makes a backup first.
- **It merges, it does not replace.** Your `AGENTS.md`, `.gitignore`, `hooks.json`, `settings.json` and `~/.codex/AGENTS.md` keep every line of yours, and uninstall hands them back byte for byte.
- **Dry run first.** `--dry-run` prints the plan and writes nothing.
- **The rest is left to an agent you can watch.** The CLI has no migration code. Older layouts and hand-made setups are fitted by the `harness-fit` skill, on a branch of its own, in a diff you review; it does not push, merge or delete what it cannot show to be a copy.
- **Fail open, never silent.** A hook error never blocks a session. A harness that is configured but broken (for example a repo cloned without its vault) says so, loudly, in the session context. A repo with no harness stays quiet.
- **No network, no credentials.** The CLI and the hook read the pointer, the vault folders it names and the git state. Secrets never belong in the pointer or the vault.

## Optional: the Cursor plugin

The Cursor plugin in this repo (`.cursor-plugin/`) is a convenience for people who live in Cursor: the skills and four slash commands (`/magik-harness-fit`, `/magik-harness-doctor`, `/magik-harness-kb-sanitize`, `/magik-harness-kb-code-sync`). It is not required and it cannot replace the CLI: the harness lives in your files, not in the IDE. To try it from a checkout:

```bash
node scripts/install-plugin.mjs        # copies it to ~/.cursor/plugins/local/magik-harness
node scripts/install-plugin.mjs --uninstall
```

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
docs/       architecture, CLI, tools, fitting
```

## License

[MIT](LICENSE)
