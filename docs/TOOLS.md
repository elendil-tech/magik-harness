# Tools: what each coding agent gets

The harness is the same for every tool: a short **primer** the agent always sees, **skills** it loads when they apply, and a **session hook** that tells it, at the start of a session, where this project's knowledge base and memory are and what its git state is. What differs per tool is only where those three go. `magik-harness install` writes the right files for each tool you pick (`--tools`); anything it has no adapter for still gets `AGENTS.md` and `.agents/skills`, which most agents read.

- [Status vocabulary](#status-vocabulary)
- [The matrix](#the-matrix)
- [Cursor](#cursor)
- [Claude Code](#claude-code)
- [Codex CLI](#codex-cli)
- [Any other agent](#any-other-agent)
- [Checking it in a live session](#checking-it-in-a-live-session)
- [Troubleshooting](#troubleshooting)
- [Adding a tool](#adding-a-tool)

## Status vocabulary

| Status | Means |
| --- | --- |
| **verified** | observed in a live session with a canary the model could only know from that channel (see [below](#checking-it-in-a-live-session)). The tool and version are named. |
| **documented** | stated in the vendor's documentation; not observed here |
| **experimental** | implemented from the vendor's documentation and covered by file-level tests (the right bytes land in the right files), but never run against the live tool in this repository |

`magik-harness list` prints the same status per adapter.

## The matrix

| | Cursor | Claude Code | Codex CLI | Others |
| --- | --- | --- | --- | --- |
| Status | **verified** (`cursor-agent` 2026.10.01) | experimental | experimental | documented |
| Primer, project | `AGENTS.md` block (**verified**) | `CLAUDE.md` containing `@AGENTS.md` | `AGENTS.md` (native) | `AGENTS.md` |
| Primer, global | none as a file (see [Cursor](#cursor)); the session hook and Settings -> Rules carry it | `~/.claude/CLAUDE.md` block | `~/.codex/AGENTS.md` block | `magik-harness primer` prints it |
| Skills, project | `.agents/skills` (**verified**; `.cursor/skills`, `.claude/skills`, `.codex/skills` also load) | `.claude/skills` (a copy; Claude Code does not read `.agents/skills`) | `.agents/skills` | `.agents/skills` |
| Skills, global | `~/.agents/skills` (**verified**) | `~/.claude/skills` (a copy) | `~/.agents/skills` | `~/.agents/skills` |
| Session hook, project | `.cursor/hooks.json` `sessionStart` (**verified**) | `.claude/settings.json` `SessionStart` | none: the primer says to run the script by hand | none |
| Session hook, global | `~/.cursor/hooks.json` `sessionStart` (**verified**) | `~/.claude/settings.json` `SessionStart` | none | none |

`generic` (`AGENTS.md` and `.agents/skills`) is always part of an install, whatever `--tools` says.

## Cursor

Cursor means the IDE and `cursor-agent`; both read the same files. Everything below was checked with `cursor-agent` 2026.10.01-e373342 on 2026-10-13; the IDE was not run separately.

What `install` writes:

| | Project scope | Global scope |
| --- | --- | --- |
| Hook | `.cursor/hooks.json`: one `sessionStart` entry, merged into whatever is there | `~/.cursor/hooks.json`: the same, appended after your existing entries |
| Primer | block at the top of `AGENTS.md` | nothing (see below) |
| Skills | `.agents/skills/` (or `.cursor/skills/` when `.agents/` is git-ignored) | `~/.agents/skills/` |

What was observed:

- The `AGENTS.md` primer reaches the model.
- Project skills load from `.agents/skills`; `.cursor/skills`, `.claude/skills` and `.codex/skills` load too, including nested group folders. A skill is listed under its **folder** name even when its frontmatter `name` differs.
- The project `sessionStart` hook runs and its `additional_context` reaches the model. **Only in a trusted workspace**: `cursor-agent -p` needs `--trust`; interactively Cursor asks once.
- The global `sessionStart` hook in `~/.cursor/hooks.json` runs in a workspace with no project install, resolves that project's stores through `~/.magik/config.json` (`<vault>/<project>/…`), and delivers today's memory. In a repository with no vault folder it stays silent.
- With a project hook **and** a global hook registered, the context holds exactly one `magik-harness session context` line.
- `~/.agents/skills` loads in every workspace.
- **Rule files in `~/.cursor/rules/` are not read.** A canary in an `alwaysApply: true` file there, and a rule that was already on the machine, were both invisible to the model. Cursor keeps user rules in Settings. That is why a global install writes no rule file: it would be dead weight. The always-on part for a global Cursor install is the session hook, whose context names the loop skill (`agentic-e2e-loop`) and carries the vault, memory and git state; if you also want the primer text always on, paste the output of `magik-harness primer --scope global` into Settings -> Rules.

Things to know:

- If you already have your own `sessionStart` hook (for example one that prints git state), both run. The harness's git section duplicates yours; silence it with `"git": "never"` in `~/.magik/config.json`, or `--no-git` on the hook command.
- Hooks are read from `hooks.json` when a session starts, so start a new chat after installing.

## Claude Code

Experimental: nothing here has been run against a live Claude Code in this repository.

| | Project scope | Global scope |
| --- | --- | --- |
| Hook | `.claude/settings.json`: a `SessionStart` entry whose command prints `hookSpecificOutput.additionalContext` | `~/.claude/settings.json`, same |
| Primer | `CLAUDE.md` gets a block `@AGENTS.md`, importing the primer from `AGENTS.md` | block at the top of `~/.claude/CLAUDE.md` |
| Skills | `.claude/skills/` (Claude Code does not read `.agents/skills`, so the skills are copied) | `~/.claude/skills/` |

The hook entry is merged into your `settings.json` key for key; your other settings and hooks are untouched, and `uninstall` removes only our entry. Claude Code can fire `SessionStart` again on resume and compaction; the hook's session lock is keyed on the event source, so the context is re-injected then rather than suppressed.

To check it: run the [live-session check](#checking-it-in-a-live-session) with `claude`, and report what you see (an issue with the output is the quickest way to move this adapter to *verified*).

## Codex CLI

Experimental. Codex reads `AGENTS.md` (project) and `~/.codex/AGENTS.md` (user) and the open `.agents/skills` convention natively, so the primer and the skills need no adapter files beyond the shared ones; the global install adds the primer block to `~/.codex/AGENTS.md`. Codex has no session-start hook, so the knowledge primer carries a manual fallback: if the `magik-harness session context` heading is missing from its context, the agent is told to run `node .magik/runtime/session-start.mjs --format text` (or `~/.magik/runtime/session-start.mjs` for a global install, or just `magik-harness resolve`) itself.

## Any other agent

If it reads `AGENTS.md` and Agent Skills (the open conventions most agents follow), a project install works as is. If it reads only its own instruction file, run `magik-harness primer` and paste the output there; point it at `.agents/skills` if it supports skills at all. If it can run a command at session start, register `node .magik/runtime/session-start.mjs --format text` (or `--format claude` / `--format cursor` for tools that copy those formats); the script reads an optional JSON payload on stdin and always exits `0`.

## Checking it in a live session

A hook can be installed and still not run (an untrusted workspace, a tool that was open before the install, no `node` on the tool's `PATH`). So the real check is to ask a fresh session something only the hook could have told it. `magik-harness doctor` runs the hook for you, but only a live session proves the tool ran it.

1. Put a canary in today's memory note (the hook injects it):

   ```bash
   echo "- [note] canary: pelican-4417" >> "$(magik-harness resolve --json | jq -r .memory.dir)/daily/$(date +%F).md"
   ```

2. Start a **new** session in the project and ask:

   > Do not use any tools. Quote verbatim the line of your session context that begins with "magik-harness session context", and name the canary word in your memory notes.

   For Cursor's CLI, non-interactively:

   ```bash
   cursor-agent -p --trust --mode ask "Do not use any tools. Quote verbatim the line of your session context that begins with 'magik-harness session context', and name the canary word in your memory notes."
   ```

3. Expect `magik-harness session context v<version>` and `pelican-4417`. If the first line is right but the canary is missing, the hook ran but today's note was not found (`magik-harness resolve` shows the path it reads). If neither appears, see [Troubleshooting](#troubleshooting).

Other things worth asking the same way: "the absolute path of the skill named `harness`" (is the skills folder loaded, and from where), "the first sentence of the block titled Harness primer" (did the primer arrive). Remove the canary line afterwards; it is a normal memory note.

This is exactly how the *verified* rows above were established, including the negative one: ask for a canary that should be there, and treat NONE as an answer.

## Troubleshooting

| Symptom | Likely cause | Fix |
| --- | --- | --- |
| No `magik-harness session context` line in a new Cursor session | the workspace is not trusted (project hooks only run in trusted workspaces); or the chat was opened before the install; or the hook is not registered | trust the workspace and start a new chat; `magik-harness doctor` (it checks the registration and runs the hook) |
| The line appears but there is no memory or vault section | the vault folder is missing (a repo cloned on a new machine) or the project has no folder in the vault yet | `magik-harness resolve` says which; `magik-harness init` creates the folders, or clone the vault |
| The context appears twice | a hook script from an earlier setup is still registered next to the current one (two `sessionStart` entries) | ask your agent to run the `harness-fit` skill; it removes the older entry and script after carrying over anything that is yours |
| Skills are not offered | `.agents/skills` is git-ignored in this repo, or the tool reads another folder | `doctor` reports a git-ignored managed path; reinstall with `--skills-dir .cursor/skills`, or add `--tools claude` for Claude Code, which reads `.claude/skills` |
| `node: command not found` from the hook | the tool launches hooks with a `PATH` that lacks Node (common for GUI apps and version managers) | make `node` resolvable from a non-interactive shell (a system-wide install, or a symlink in `/usr/local/bin`) |
| A tool you use is missing from `install`'s tool list | its project config is git-ignored in this repo (for example a generated `.claude/`), so auto-detection skipped it and printed `skipping <tool>` | un-ignore the hook file (`.claude/settings.json`, `.cursor/hooks.json`), or force it with `--tools <tool>` knowing clones will not get it |
| A global install does nothing in one repo | that repo has no folder in the vault; the hook is deliberately silent in unrelated repos | `magik-harness init` in the repo, or set `"git": "always"` in `~/.magik/config.json` to get git state everywhere |

## Adding a tool

A tool adapter is one file in `src/tools/`: an object with an `id`, a `label`, a `status`, a `detect(scope)` that says whether the tool is configured in this project or home, and `artifacts(ctx)` returning the planned changes (a hook entry in a JSON file, a block in an instruction file, copies of the skills). Everything it plans goes through the same plan/apply/lock machinery as the rest, so it is backed up, idempotent and removed cleanly by `uninstall` without extra code. Register it in `src/tools/index.js`, add its file-level tests, and keep its status at *experimental* until someone has run the live check above against it and recorded the tool, the version and the date here.
