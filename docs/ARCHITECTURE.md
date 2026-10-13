# magik-harness — architecture

Design of record for **2.0.0**. Where this document and the code disagree, fix one of them in the same change.

- [1. What a harness is](#1-what-a-harness-is)
- [2. Principles](#2-principles)
- [3. Delivery](#3-delivery)
- [4. Scopes: project and global](#4-scopes-project-and-global)
- [5. The pointer and how it resolves](#5-the-pointer-and-how-it-resolves)
- [6. The session hook](#6-the-session-hook)
- [7. Skills, profiles and packs](#7-skills-profiles-and-packs)
- [8. The primer](#8-the-primer)
- [9. Tool adapters and what is verified](#9-tool-adapters-and-what-is-verified)
- [10. Install lifecycle and ownership](#10-install-lifecycle-and-ownership)
- [11. Doctor](#11-doctor)
- [12. Fitting: how a project is brought in line](#12-fitting-how-a-project-is-brought-in-line)
- [13. Decision log](#13-decision-log)
- [14. Safety and privacy](#14-safety-and-privacy)
- [15. Non-goals](#15-non-goals)

## 1. What a harness is

A **harness** wraps an ordinary code repository with the few things an AI coding agent needs to work well in it, and nothing more. The repo stays a normal repo.

| Piece | What it is | Project scope | Global scope |
| --- | --- | --- | --- |
| **Vault** | Plain-Markdown folders outside the repo: a **knowledge base** (the project's ground truth) and **memory** (the agent's running log). | any folder, usually its own git repo | same |
| **Pointer** | A small JSON file saying where the vault is and which mounts belong to this project. | `.magik/harness.json` | `~/.magik/config.json` (convention) |
| **Primer** | A short always-on block of instructions: the four rules. | managed block in `AGENTS.md` | user-level instruction file of each tool |
| **Skills** | On-demand procedures in the open [Agent Skills](https://agentskills.io) format. | `.agents/skills/` | `~/.agents/skills/` |
| **Session hook** | A zero-dependency Node script that resolves the pointer and injects live context at session start. | `.magik/runtime/` | `~/.magik/runtime/` |
| **Lock** | What the installer manages, with content hashes. | `.magik/lock.json` | `~/.magik/lock.json` |

`magik-harness` is the tool that installs, upgrades, checks and removes those pieces. Bringing the rest of a project in line with them (an older layout, a hand-made setup, drift) is the `harness-fit` skill's job: text an agent follows, not code ([section 12](#12-fitting-how-a-project-is-brought-in-line)). The artifacts are plain files. Any agent runtime that reads `AGENTS.md` and Agent Skills can use them; thin adapters add the wiring that some runtimes need (hooks, instruction files).

The **four rules** the harness enforces live in the primer ([section 8](#8-the-primer)):

1. gather full context before substantive work (the KB is the start of context, not the end);
2. keep the KB in sync, at the autonomy the pointer grants;
3. memory is for recency, the KB is for durable truth, and memory never auto-promotes;
4. close the agentic loop (verify, ship, sync knowledge, clean up; multi-machine git hygiene).

## 2. Principles

1. **Self-contained artifacts.** Everything a session needs is a file in the repo (project scope) or in the user's home (global scope). Nothing depends on a plugin being installed, on the IDE, or on a particular machine. This removes the failure where the primer names a skill that the current tool never loaded.
2. **Agnostic core, adapters at the edge.** The core (pointer, runtime, skills, primer) assumes only `AGENTS.md`, Agent Skills and Node. Tool-specific files (hook registration, import shims, mirrors) are produced by adapters and are optional.
3. **Both scopes are first-class.** Same pieces, different roots. A user may use either or both.
4. **Fail open, never silent.** A hook error never blocks a session. A *configured but broken* harness (vault path missing) says so, loudly, in the session context. A repo with no harness stays quiet.
5. **The installer owns only what it can prove it owns.** Every managed file is recorded with a content hash. A file edited by hand is never overwritten without `--force`. User files and foreign JSON entries are merged around, never replaced.
6. **Zero runtime dependencies.** Node 18+ standard library only. The CLI runs straight from a git checkout (`npx github:…`) with no build step, and the runtime scripts copied into a project run with nothing installed.
7. **Cross-platform.** No symlinks by default (they need privileges on Windows), forward-slash keys in the lock, `path` APIs everywhere. CI runs Linux, macOS and Windows.
8. **Small always-on, large on-demand.** The primer stays under 5 KB. Detail lives in skills that load when the task needs them.

## 3. Delivery

| Channel | For whom | What it provides |
| --- | --- | --- |
| **CLI** `magik-harness` (`npx magik-harness …`) | everyone; the primary channel | the full install in either scope, plus `upgrade`, `doctor`, `status`, `uninstall`, `resolve`, `init`, `list` |
| **Repo-committed artifacts** | teammates, CI, other machines, other worktrees | after a project-scope install the repo carries everything; `git clone` is the whole installation |
| **Cursor plugin** (this repo, `.cursor-plugin/`) | Cursor users who want a one-click convenience | the skills and four slash commands (`fit`, `doctor`, `kb-sanitize`, `kb-code-sync`). No rules and no hooks: the plugin cannot install a pointer, and a primer that points at things only the plugin has is exactly the dependency the principles forbid |
| **By hand** | anyone | copy `skills/<name>` into `.agents/skills/` and paste `content/primer.knowledge.md` into `AGENTS.md`; everything else is optional |

Why the CLI is primary: skills installed into project or user folders are listed ahead of plugin skills when a tool caps the skill list (Cursor lists at most 150 up front and drops plugin skills first; observed), a plugin cannot reach `cursor-agent` runs or remote machines reliably, and a plugin cannot carry per-project state.

## 4. Scopes: project and global

### 4.1 Project scope (default)

Everything is written inside the repo and is meant to be **committed**.

```text
<repo>/
├── AGENTS.md                      managed primer block (top of file)
├── .gitignore                     managed block: ignores .magik/harness.local.json
├── .magik/
│   ├── harness.json               the pointer (tracked; yours after creation)
│   ├── harness.local.json         per-machine overlay (gitignored)
│   ├── lock.json                  managed files + hashes
│   ├── runtime/                   session-start.mjs, resolve.mjs, gitctx.mjs
│   └── backups/<timestamp>/…      copies of files the installer replaced or removed (gitignored)
├── .agents/skills/<skill>/        skills (canonical location)
├── .cursor/hooks.json             merged entry          (tool: cursor)
├── .claude/settings.json          merged entry          (tool: claude, experimental)
├── .claude/skills/<skill>/        mirror                (tool: claude)
└── CLAUDE.md                      `@AGENTS.md` import   (tool: claude)
```

Choose it when the repo should carry its own harness: teammates and CI get it for free, every git worktree has it, and a fresh machine needs only Node.

### 4.2 Global scope

Everything is written under the user's home. Nothing is written into any repo.

```text
~/
├── .magik/
│   ├── config.json                vault root + conventions (see 5.4)
│   ├── lock.json
│   ├── runtime/                   session-start.mjs, resolve.mjs, gitctx.mjs
│   └── backups/<timestamp>/…      copies of every user file the installer modified
├── .agents/skills/<skill>/        skills
├── .cursor/hooks.json             merged entry          (tool: cursor)
├── .claude/{settings.json,CLAUDE.md,skills/}            (tool: claude, experimental)
└── .codex/AGENTS.md               managed block         (tool: codex, experimental)
```

Cursor has no file-based user-level rules (a rule file in `~/.cursor/rules/` never reached the model in a live check; see [section 9](#9-tool-adapters-and-what-is-verified)), so a global install delivers the primer to Cursor through the session hook (which names the loop skill, the vault, memory and git state) and the skills, and prints the text to paste into Settings -> Rules if you want it always on. Claude Code and Codex get the primer in their own user-level files.

Choose it when you want every repo on the machine covered without committing anything, or when the repos are not yours to change. Per project, `magik-harness init` creates the vault folders for the convention layout (`<vault>/<project>/{knowledge,memory}`); until then the hook is silent in that repo.

### 4.3 Using both

Allowed and sensible: global for your own machine, project for a repo that should carry it. They do not fight:

- skills: the project copy and the user copy have the same name; tools collapse same-name skills;
- hooks: both run, the second sees a per-session marker and emits nothing ([section 6.3](#63-dedupe-when-two-hooks-fire));
- pointer: the project pointer wins over the global convention.

## 5. The pointer and how it resolves

### 5.1 Schema (`magik-harness/harness@2`)

```json
{
  "schema": "magik-harness/harness@2",
  "_doc": "Vault pointer. Secrets never go here. Spec: docs/ARCHITECTURE.md",
  "vault": "~/Projects/my-vault",
  "knowledge": { "mount": "my-project/knowledge", "accessVia": "path", "autonomy": "open" },
  "memory":    { "mount": "my-project/memory",    "accessVia": "path", "inject": { "maxBytes": 4000 } },
  "mounts": [
    { "name": "company", "role": "knowledge", "mount": "company/knowledge", "autonomy": "readonly" }
  ]
}
```

- `vault` is the vault root. A leading `~` expands to the home directory; a relative path is relative to the project root. `null` is allowed when every store is `accessVia: "mcp"`.
- `knowledge.autonomy` is `open` (default), `ask` or `readonly`. Unknown values are treated as `open`.
- `memory.inject.maxBytes` caps what the hook injects (default 4000; `0` injects only the path).
- `mounts[]` (optional) adds more stores. `role` is `knowledge` or `memory`. A project can read a shared company KB next to its own, each mount with its own autonomy.
- A pointer with another `schema` value is still read, as `harness@2`, with a note in the session context. The `harness-fit` skill sets the value.

### 5.2 Resolution order

For a session started in directory `D`:

1. **Project root**: `git rev-parse --show-toplevel` from `D` (fallback `D`). The **primary checkout** (`git rev-parse --git-common-dir`, parent) names the project; linked worktrees therefore resolve the same project name as the primary.
2. **Local overlay**: `.magik/harness.local.json`, deep-merged over the tracked pointer (objects merge, arrays and scalars replace). It exists for per-machine and per-worktree differences, for example a vault clone that lives somewhere else on this machine.
3. **Tracked pointer**: `.magik/harness.json`. No other location is read: a pointer anywhere else is invisible, and the fit moves it ([section 12](#12-fitting-how-a-project-is-brought-in-line)).
4. **Global config**: `~/.magik/config.json` (`$MAGIK_HOME` overrides the directory). With `layout: "per-project"` the stores are `<vault>/<project>/knowledge` and `<vault>/<project>/memory`. The harness is considered active for the repo only if the project folder exists in the vault.
5. **None**: the repo is not harnessed. No error, no output.

Every `resolve` result records which step produced it (`source`), so `doctor` and the session context can say *why* a path was chosen.

### 5.3 Failure modes

| Situation | Behaviour |
| --- | --- |
| No pointer, no global config | silent; harness inactive |
| Pointer found, `vault` path missing | **loud warning block** in the session context with the exact path and the fix command; the session continues |
| Vault found, knowledge or memory folder missing | warning for knowledge (nothing to read); memory is created lazily on first write, so only a note |
| Pointer unreadable or invalid JSON | loud warning naming the file and the parse error |
| `accessVia: "mcp"` | reported as remote; paths are not checked |

### 5.4 Global config (`magik-harness/config@1`)

```json
{
  "schema": "magik-harness/config@1",
  "vault": "~/Projects/my-vault",
  "layout": "per-project",
  "knowledge": { "autonomy": "open" },
  "memory": { "inject": { "maxBytes": 4000 } },
  "git": "harnessed"
}
```

`git` controls the hook's git-sync paragraph: `harnessed` (default for global; only in repos that resolve a vault), `always`, `never`. Project installs behave as `always`.

## 6. The session hook

`runtime/session-start.mjs` is a single file that any runtime can execute. It is copied into `.magik/runtime/` (or `~/.magik/runtime/`) so it needs nothing installed.

### 6.1 Inputs

- `argv`: `--format cursor|claude|text` (default `text`), `--max-memory-bytes N`, `--no-git`.
- `stdin` (optional): the JSON payload the host passes to hooks. Used for the workspace directory (`workspace_roots[0]`, `cwd`) and the session id.
- environment: `CURSOR_PROJECT_DIR`, `CLAUDE_PROJECT_DIR`, `MAGIK_PROJECT_DIR`, `MAGIK_HOME`.

The workspace directory matters in global scope: a user-level hook may run with a working directory unrelated to the repo, so the payload and project env vars take precedence over `process.cwd()`.

### 6.2 What it emits

One block, roughly 2–7 KB:

1. **Harness status**: resolved stores with absolute paths, autonomy, `source`, and warnings ([section 5.3](#53-failure-modes)). Always starts with the stable marker line `magik-harness session context v<version>` so adherence and probes can detect it.
2. **Today's memory**: `memory/daily/<date>.md`, capped at `maxBytes`. Over the cap, the *tail* is injected (the newest notes) with a note giving the shown/total size and the full path.
3. **Git sync context**: branch, dirty file count, ahead/behind, and the multi-machine protocol reminder (orient on start, cloud-save on pause with `[skip ci]` WIP commits, no global `git stash` across worktrees).
4. **Next steps**: the concrete skill to run (`kb-search` for substantive work), how to create the first KB entry when the harness is configured but empty, and, only when a WARNING is showing, a pointer to `doctor` and the `harness-fit` skill.

Output formats:

| `--format` | stdout |
| --- | --- |
| `cursor` | `{"additional_context": "<block>"}` |
| `claude` | `{"hookSpecificOutput": {"hookEventName": "SessionStart", "additionalContext": "<block>"}}` |
| `text` | the block as plain text (also the manual fallback: any agent with a shell can run it) |

When nothing resolves and the git policy says quiet, it prints `{}` (cursor/claude) or nothing (text). Any error is written to stderr and the process still exits 0 with that empty output.

### 6.3 Dedupe when two hooks fire

If both scopes are installed, both hooks run at session start. When the payload carries `session_id` or `conversation_id`, the first hook atomically creates `<tmpdir>/magik-harness/<sha1(id|source)>.lock`; a later hook with the same id and source emits nothing (`{}` for the JSON formats). Three details keep this from ever hiding context a session needs:

- a claim is honoured for **two minutes**; an older one is taken over, so a crashed or abandoned run cannot silence a later session that reuses the id;
- the payload's `source` (Claude Code sends `startup`, `resume`, `compact`, `clear`) is part of the key, so a resumed or compacted session gets its context again;
- without an id there is no dedupe at all (a duplicate block is harmless; a missing one is not).

## 7. Skills, profiles and packs

### 7.1 Core skills

| Skill | Purpose |
| --- | --- |
| `harness` | the operating model: pointer, resolution, the four rules in full, degradation |
| `kb-search` | the pre-task gate: gather context from KB, code and live state, reconcile drift |
| `knowledge-base` | how to read and maintain the KB; autonomy; the inclusion test; anti-patterns |
| `kb-conventions` | the recommended metadata standard: frontmatter, tags, relations |
| `kb-sanitize` | heal the KB from the inside (conflicts, duplicates, links) |
| `kb-code-sync` | check the KB against the code |
| `harness-memory` | the running log: cadence, layout, why it never auto-promotes |
| `agentic-e2e-loop` | orient → implement → verify → ship → KB sync → clean up, with the git protocol |
| `harness-fit` | install, upgrade and re-align a project (or the machine) with the harness: survey, plan, strap on, adjust, check, hand over ([section 12](#12-fitting-how-a-project-is-brought-in-line)) |

Every skill follows the Agent Skills format: folder name equals `name` (Cursor lists a skill by its **folder** name; observed), `description` explains *what and when*, long material goes under `references/`.

### 7.2 Profiles

| Profile | Skills | Primer | Vault |
| --- | --- | --- | --- |
| `minimal` | `harness`, `harness-fit`, `agentic-e2e-loop` | `primer.minimal.md` (under 1 KB: the loop and git protocol) | none; the hook reports git state only |
| `knowledge` (default when a vault is given) | all core skills | `primer.knowledge.md` (≈3 KB: the four rules) | required |

### 7.3 Packs

Opt-in bundles of opinionated skills, listed by `magik-harness list`, installed with `--packs a,b`:

| Pack | Skills | Notes |
| --- | --- | --- |
| `worktrees` | `worktree-audit` | worktree location convention, inventory of every worktree, fail-closed removal guard (needs `python3` and `git`; POSIX) |
| `ci-runners` | `ci-runners` | an opinionated policy for private GitHub repos: hosted pool first, managed runners as overflow, local-first CI. An *example* of a team policy delivered as a pack; adapt or skip |

A pack is `packs/<name>/pack.json` plus `packs/<name>/skills/<skill>/`. Packs are the extension point for team- or company-specific policy: a private repo can ship its own packs and install them with `--pack-dir`.

### 7.4 Where skills are written

- Canonical: `.agents/skills/<name>/` (project) and `~/.agents/skills/<name>/` (global). Cursor and Codex read it natively; it is the open convention.
- **Fallback**: if the canonical directory is git-ignored (some repos let a generator own `.agents/`), the installer picks `.cursor/skills/` when `cursor` is a target and tells you; `--skills-dir` overrides. The choice is stored in the lock.
- **Mirrors** are written only for tools that cannot read the canonical folder: `claude` gets `.claude/skills/<name>/` as a **copy** (never a symlink).
- The installer refuses to overwrite a skill folder it did not create (conflict), unless `--force`.

### 7.5 Skill budget

Core is nine skills: all nine in the `knowledge` profile, three in `minimal`. Descriptions are short and carry the trigger words. Packs are opt-in. A harness should cost a few dozen lines of the tool's skill list, not hundreds.

## 8. The primer

`content/primer.knowledge.md` is inserted as a managed block at the **top** of `AGENTS.md`:

```text
<!-- magik-harness:primer:start v=2.0.0 -->
…
<!-- magik-harness:primer:end -->
```

It contains the four rules, how the harness is wired (pointer location, resolution in two sentences, the manual fallback command for tools without hooks), and the list of skills to request on demand. Everything it names exists in the same install. It does not mention slash commands, plugins or any tool-specific path other than the pointer.

The block is replaced in place on upgrade. Text outside the markers is never touched, and a block with any other name is the project's own text: it is left alone (the fit skill's drift list covers older primer blocks).

## 9. Tool adapters and what is verified

Status vocabulary: **verified** = observed in a live session during v2 development (2026-10-13, `cursor-agent`); **documented** = stated in the vendor's documentation, not observed here; **experimental** = implemented from documentation and covered by file-level tests only.

| Capability | Cursor (IDE and `cursor-agent`) | Claude Code | Codex CLI | Others |
| --- | --- | --- | --- | --- |
| `AGENTS.md` primer | verified | via `CLAUDE.md` → `@AGENTS.md` (experimental) | documented (native) | most agents read it |
| Project skills | `.agents/skills` **verified**, also `.cursor/skills`, `.claude/skills`, `.codex/skills`, nested folders | `.claude/skills` mirror (experimental) | `.agents/skills` (documented) | Agent Skills convention |
| User skills | `~/.agents/skills` (verified) | `~/.claude/skills` mirror (experimental) | `~/.agents/skills` (documented) | |
| Session hook | `.cursor/hooks.json` `sessionStart` → `additional_context` (verified) | `.claude/settings.json` `SessionStart` (experimental) | none; manual fallback in the primer | none |
| User-level primer | **none as a file**: `~/.cursor/rules/*.mdc` is not read by `cursor-agent` (verified negative); user rules live in Settings | `~/.claude/CLAUDE.md` (experimental) | `~/.codex/AGENTS.md` (experimental) | |
| User-level hook | `~/.cursor/hooks.json` (**verified**) | `~/.claude/settings.json` (experimental) | none | |

`--tools` accepts `auto` (default: detect `.cursor/`, `.claude/`, `CLAUDE.md`, `.codex/` in the project, or the matching folders in home), a comma list of `cursor,claude,codex,generic`, or `none`. A project-scope tool that is only auto-detected is skipped, with a note, when git ignores its hook file (for example a generated, git-ignored `.claude/`): clones and worktrees would never get the registration. Naming the tool installs it and warns. `generic` is always implied: `AGENTS.md` + `.agents/skills`.

Cursor-specific facts the design relies on, each verified against `cursor-agent` with workspace trust:

- project hooks only run in a **trusted** workspace (if a session shows no `magik-harness session context` marker, trust the workspace first; see [TOOLS.md](TOOLS.md#checking-it-in-a-live-session));
- a skill is listed under its **folder** name, even if frontmatter `name` differs;
- project `.agents/skills`, `.cursor/skills`, `.claude/skills` and `.codex/skills` all load, including nested group folders;
- `AGENTS.md` and project `.cursor/rules/*.mdc` (always-apply) both reach the model;
- user-level rule **files** do not: a canary in an `alwaysApply` file in `~/.cursor/rules/`, and a rule file that was already there, were both invisible to the model. Global instructions for Cursor therefore travel through the session hook and the skills, or through Settings -> Rules by hand;
- `~/.agents/skills` loads in every workspace, and a user-level `~/.cursor/hooks.json` `sessionStart` entry runs and delivers `additional_context` in a workspace that has no project install of its own;
- with a project hook and a global hook both registered, the session context holds exactly one `magik-harness session context` line.

## 10. Install lifecycle and ownership

### 10.1 Plan, then apply

Every mutating command builds a **plan** first: a list of items `{path, action, reason}`.

| Action | Meaning |
| --- | --- |
| `create` | file or block does not exist |
| `update` | managed, unmodified on disk, newer content available |
| `merge` | JSON file or block that mixes our entry with the user's |
| `unchanged` | already current |
| `keep` | managed but modified on disk: left alone (use `--force` to overwrite) |
| `conflict` | path exists, not managed by us: left alone (use `--force` to overwrite, after a backup) |
| `remove` | stale managed file, safe to delete |
| `notice` | something the user should do or know |

`--dry-run` prints the plan and writes nothing. Apply executes the plan in order and writes the lock last, so a crash leaves the previous lock describing the previous state.

### 10.2 Ownership model

- **Whole files** (runtime, skills, the global primer `.mdc`): recorded in the lock with `sha256`. Unmodified → safe to update or remove.
- **Marker blocks** (`AGENTS.md`, `.gitignore`, `CLAUDE.md`, `~/.codex/AGENTS.md`): we own only the text between the markers.
- **JSON entries** (`hooks.json`, `settings.json`): we own only entries whose command points at a `session-start.mjs` under a magik runtime; the rest of the file is preserved key for key. Invalid JSON is never rewritten (notice instead).
- **User-owned after creation** (the pointer, the overlay, the global config, the vault's starter `_index.md`): created once, never overwritten. The lock records a hash of what was written, so `uninstall --purge` removes one only while it is still exactly that; an edited one is kept (`--force` removes it too, after a backup). The vault itself is never touched.

### 10.3 Commands

| Command | What it does |
| --- | --- |
| `install` | plan + apply; creates pointer, runtime, skills, primer, registrations, lock. Touches only what it owns; the rest of a project is the `harness-fit` skill's work |
| `upgrade` | `install` with the options recorded in the lock; refreshes managed files; removes stale ones |
| `uninstall` | removes what the lock lists (unmodified files, our blocks, our JSON entries); keeps the pointer unless `--purge` |
| `doctor` | read-only health check ([section 11](#11-doctor)) |
| `status` | one screen: installs found, versions, tools, packs, what resolves |
| `resolve` | prints the resolution result (`--json`); the same code the hook uses |
| `init` | creates the vault folders (and a first `_index.md`) for the resolved project |
| `list` | prints profiles, skills and packs |

`primer` prints the primer text for a profile, for tools that need it pasted into their own instruction file. The full option reference is [CLI.md](CLI.md). Exit codes: `0` ok, `1` failure or failed checks, `2` usage error (nothing is written on a usage error).

### 10.4 Backups

Anything the installer replaces, merges into or removes, other than files it just created, is first copied to `<harness dir>/backups/<timestamp>/<path>`: `.magik/backups/` in a project, `~/.magik/backups/` at global scope. That covers user files it edits (`AGENTS.md`, `.gitignore`, `hooks.json`, `settings.json`, `~/.codex/AGENTS.md`) and `--force` overwrites. The backup folder carries its own `.gitignore` (`*`), so it never shows up in `git status`, even after an uninstall removes the project's managed ignore block.

## 11. Doctor

`magik-harness doctor [--scope project|global|all] [--strict] [--json]` runs layered, read-only checks. Each result is `ok`, `info`, `warn` or `fail`, and anything that is not `ok` carries the command that fixes it. Exit code `1` if any check fails (or warns, with `--strict`), otherwise `0`, so it is safe in scripts and CI.

| Area | Checks |
| --- | --- |
| Resolution | which source produced the result; the vault exists (**fail** if not: a repo cloned without its vault); resolver warnings (invalid pointer JSON) are failures; a tracked pointer that names the vault by an absolute path under your home directory (**warn**: it only works for you; `~/...` works everywhere); in a linked worktree, that the pointer is tracked by git |
| Install | lock present and readable; installed version vs CLI version; every managed file present (**fail**) and edited ones noted; the plan this CLI would apply right now is empty ("up to date") |
| Registrations | for each tool in the lock, the hook entry is present in the tool's file; a missing, invalid or unregistered file is a **fail** |
| Runtime | `session-start.mjs` is run with a synthetic payload and its output must parse in the registered format |
| Packs | each installed pack's requirements (commands on `PATH`, platform) are met (**warn**) |
| Skills | every installed skill folder passes the Agent Skills lint (**warn**, with the problem named) |
| Primer | the block is present in `AGENTS.md` (**fail**), current, and under 5 KB |
| Git | no managed path is git-ignored, because clones and worktrees would not receive it (**fail**) |

When anything fails or warns, or nothing is installed, doctor ends with a hint: the CLI checks the files it owns, and the `harness-fit` skill handles the rest ([section 12](#12-fitting-how-a-project-is-brought-in-line)).

Doctor never writes. There is no automatic live-tool probe: starting a model session is a cost and a trust decision, so the verification in [TOOLS.md](TOOLS.md#checking-it-in-a-live-session) is a procedure you run on purpose.

## 12. Fitting: how a project is brought in line

The installer is deterministic and owns files. A project is more than the files the installer owns: scripts that read the pointer, docs that name paths, instructions that repeat the primer, hand-made hooks, an earlier layout of this very harness. Judging what to keep, carry over or remove there means reading the project, and that is work for the agent, not for code.

| | Does | Knows about |
| --- | --- | --- |
| **The CLI** (`install`, `upgrade`, `doctor`) | writes, hash-checks, refreshes and removes the files it owns; merges into the ones it shares | the current layout only. It has no code path for any other |
| **The `harness-fit` skill** | surveys the project, plans, runs the CLI, adjusts the project's own files, checks, hands over a commit | what a fitted project looks like, what drift looks like (older layouts included), what each release asks of a project |

The skill is plain text (a `SKILL.md` and four references) and ships with every install, so a project can re-fit itself after an upgrade with neither the package nor the network. [FITTING.md](FITTING.md) is the guide for people.

### 12.1 The fit

Six steps: survey (read only), plan (shown before anything changes), strap on (the CLI: `install --dry-run`, then `install` or `upgrade`), adjust (the project's own files), check (`doctor`, the project's own checks, a hook run) and hand over (one commit on a branch of its own, a short report). The skill's rules:

- never write a managed file by hand; if one is wrong, fix the cause and run `upgrade`;
- carry over what is specific to the project before removing an older file, and remove only what can be shown to be a copy; anything uncertain is listed for the user, and a run with nobody to ask takes the defaults and leaves such removals out;
- work on a branch of its own, never push or merge unless asked, and never read secrets files while surveying.

### 12.2 The references

| File | What it holds |
| --- | --- |
| `fitted.md` | the structure the harness dictates, per scope. A test builds a real install and checks that every folder, marker, schema and hook command the installer writes is named there, so it cannot go stale |
| `drift.md` | what to search for, why it matters and what to do: older pointer locations and schemas, older hook scripts and managed blocks, duplicated instructions, plugin and slash-command dependence, forks of shipped skills, homemade versions of what the harness provides, homemade agent setups, old names and paths in the project's own text, ignore lists and formatters, git-ignored tool folders, a missing vault, edited managed files, machine-level leftovers. It is the one place in the package that knows what earlier layouts looked like |
| `stages.md` | the same fit at the start, in the middle and at the end of a project, and as a re-fit |
| `versions.md` | one heading per release saying what it asks of a project's own files. A test requires a heading for the current version, so a release cannot ship without someone deciding what it asks |

### 12.3 Why a skill and not a command

- The package, tests and docs describe one layout. Earlier layouts live as text in one file, instead of as code paths that outlive their usefulness.
- Judgment calls (is this script a copy? does this rule hold something unique?) are what an agent is for. The skill makes them visible: a plan up front, a diff to review at the end, uncertain removals listed as follow-ups.
- One procedure serves a new project, a project in progress, a late-stage one and an upgrade.

### 12.4 What the CLI guarantees so the fit can rely on it

- `install` never touches what it does not own. An older pointer, hook script or primer block is left exactly as it was, and the current files are added beside them (a test pins this).
- `install` never overwrites a pointer, so what the fit moves into `.magik/harness.json` is honoured.
- `doctor` ends with a hint to run the skill when anything fails or warns, or when nothing is installed.

## 13. Decision log

The decisions below close the open proposals of the October 2026 assessment. "Verified" marks the ones settled by a live test.

| # | Proposal | Decision | Basis |
| --- | --- | --- | --- |
| P1 | Delivery channel | **Hybrid**: repo-committed artifacts + CLI as the primary channel; global scope as the machine-level equivalent; the Cursor plugin demoted to optional convenience (skills + commands only) | user requirement (agnostic, both scopes); plugin skills rank last under list caps |
| P2 | How skills are stored | **Flat `.agents/skills` canonical**; copies only for tools that cannot read it; fallback to `.cursor/skills` when `.agents/` is git-ignored | **verified**: project `.agents/skills` loads in `cursor-agent`; folder name wins over frontmatter name |
| P3 | What goes in `AGENTS.md` | The four binding rules stay in the always-on primer (rules left to on-demand loading were followed least); details and cross-project policy live in skills | assessment adherence data |
| P4 | Install, upgrade, drift | `doctor` (layered, executes the hook) + `upgrade` + lock with hashes; the same command at both scopes | stale installs and diverged hook forks were the main measured drift |
| P5 | Change model | **Static core, guarded local edits**: shipped content is versioned; local edits are detected by hash and preserved; no agent self-editing of shared skills (project-specific skills are ordinary repo files, changed through normal review) | measured skill rot was low; drift was in installed copies |
| P6 | Memory | Cap injection at 4 KB (tail, configurable); never auto-promote; sharing across machines is the vault's own git, not the harness's job | notes reached 34–36 KB and were injected whole |
| P7 | Company-level knowledge | `mounts[]` lets a project read a separate company KB with its own autonomy; moving existing entries is a vault task | single mount per pointer blocked reuse |
| P8 | Getting sessions to use the KB | Push: the hook states concrete paths and the next skill every session, with a stable marker so adoption can be measured; measurement itself is deferred (see ROADMAP) | on-demand skill reads were rare |
| P9 | Coverage | Profiles by need (`minimal`, `knowledge`) and opt-in packs | most active repos had no harness |
| P10 | Worktrees | The pointer is tracked so every worktree resolves the same vault; `harness.local.json` overrides per worktree; the `worktrees` pack documents the durable root convention and audits it | worktree fragmentation |
| P11 | Skill budget | Nine core skills, short descriptions, packs opt-in; installed skills outrank plugin skills under the cap | **verified** list-cap behaviour in `cursor-agent` |
| P12 | Older layouts, hand-made setups, drift | **No migration code.** The CLI knows one layout; the `harness-fit` skill (text an agent follows) adapts everything else, and its `versions.md` says what each release asks of a project's own files | the harness dictates the structure, and judgment about a project's own files belongs to the agent ([section 12](#12-fitting-how-a-project-is-brought-in-line)) |

## 14. Safety and privacy

- The CLI and runtime make **no network calls** and read **no credentials**. They read the pointer, the vault folders named in it, the git state of the project, and (installer only) the files they are about to modify.
- Secrets never belong in the pointer or the vault; the pointer says so in its `_doc`.
- Writes are limited to the paths in section 4 and to the vault folders created by `init`. Global scope writes outside the project only after printing the plan, and backs up every user file it touches.
- The hook never executes anything from the vault. It reads Markdown as text.
- The `harness-fit` skill runs with the agent's own tools, so it is bounded by what the user lets the agent do. It is told to work on a branch of its own, to leave a diff for review, never to push or merge unasked, never to read secrets files, and never to delete what it cannot show to be a copy.
- Live-tool verification is a manual, opt-in procedure ([TOOLS.md](TOOLS.md#checking-it-in-a-live-session)); nothing in the package starts a model session.

## 15. Non-goals

- A folder ontology for the KB or the vault. The harness enforces *where* knowledge lives and *how it is treated*, not its shape.
- Syncing or hosting the vault. Use git.
- Rewriting your project's own skills. The installer manages only the skills it ships.
- Replacing a tool's native configuration system. Adapters add a few well-marked entries and stay out of the way.
