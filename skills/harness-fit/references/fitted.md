# What a fitted project looks like

The harness dictates this structure. Compare the project with it line by line. Every difference is either deliberate (say so in the report) or drift (fix it, see [drift.md](drift.md)).

## Project scope (the default; committed to the repo)

| Path | What it is | Fitted when |
| --- | --- | --- |
| `.magik/harness.json` | the pointer: where the vault is and which stores belong to this project | tracked by git; `schema` is `magik-harness/harness@2`; `vault` is `~/...` or relative (an absolute path only works on one machine); the stores it names exist, or are `accessVia: "mcp"` |
| `.magik/harness.local.json` | optional per-machine override of the pointer | ignored by git, never tracked |
| `.magik/lock.json` | what the installer manages, with content hashes | tracked; `version` is the installed version |
| `.magik/runtime/` | `resolve.mjs`, `gitctx.mjs` and `session-start.mjs`: the session hook | tracked; byte for byte what the CLI ships (`doctor` checks) |
| `.magik/backups/` | copies of files the installer replaced | ignored by git (it carries its own `.gitignore`) |
| `.agents/skills/<name>/` (or `.cursor/skills/<name>/` when git ignores `.agents/`) | the skills of the profile and packs | tracked and unmodified; one skills folder only; the project's own skills sit beside them under other names |
| `AGENTS.md` | the primer: one block between `<!-- magik-harness:primer:start v=... -->` and `<!-- magik-harness:primer:end -->`, at the top | exactly one block; everything outside it is the project's own and neither repeats nor contradicts it |
| `.gitignore` | one block between `# magik-harness:gitignore:start v=...` and `# magik-harness:gitignore:end` | block present; nothing the harness installs is ignored |
| `.cursor/hooks.json` (Cursor), `.claude/settings.json` (Claude Code) | one `sessionStart` entry per tool in use, running `node .magik/runtime/session-start.mjs --format <tool>` | exactly one entry; the user's other hooks untouched; the file is tracked |
| `CLAUDE.md`, `.cursorrules`, `.cursor/rules/*.mdc`, `GEMINI.md`, other instruction files | tool-specific instructions | they import or point at `AGENTS.md` (`CLAUDE.md` holds `@AGENTS.md`), or hold only what is specific to that tool; no copy of the harness rules |

Around the files:

- scripts, tests, docs and CI name these paths and no other harness paths;
- formatters and linters leave the managed files alone (a formatter that rewrites one makes it look hand-edited);
- nothing in the project repeats, forks or contradicts what the harness ships.

Health: `magik-harness doctor` shows no failure, and a fresh session starts with the line `magik-harness session context v<version>`.

## Global scope (`--scope global`; nothing is written into any repo)

| Path | Fitted when |
| --- | --- |
| `~/.magik/config.json` | holds the vault root and conventions; the user owns it after creation |
| `~/.magik/lock.json` and `~/.magik/runtime/` | as in project scope |
| `~/.agents/skills/<name>/` | the profile's skills, with the same names as a project install, so a tool collapses them |
| `~/.cursor/hooks.json` | one `sessionStart` entry for the global runtime; the user's other hooks untouched |
| `~/.claude/` and `~/.codex/AGENTS.md` | only when those tools are in use (experimental) |

A global and a project install can coexist: the project pointer wins, same-named skills collapse, and a per-session marker keeps the two hooks from injecting the context twice.
