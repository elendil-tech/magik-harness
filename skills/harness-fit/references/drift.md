# Drift: what to look for and what to do

Drift is the distance between a project and [what a fitted project looks like](fitted.md). It comes from older layouts, from setups people built by hand, and from edits made over time. The CLI only sees what it owns; you look for the rest.

Most of it shows up with one search over the whole repository, skipping `.git` and secrets files:

```bash
rg -n --hidden -g '!.git' -g '!.env*' \
  -e '\.cursor/harness' -e 'hooks/session-start' -e 'harness:primer' -e 'harness:gitignore' \
  -e 'magik-repo' -e 'harness-setup'
```

Each entry below says what you may find, why it matters and what to do. Work through the ones the survey turned up, and ask before any removal you cannot prove is a copy.

## Pointer in an old place or shape

- **Look for.** `.cursor/harness.json` or `.cursor/harness.local.json`, or a pointer anywhere but `.magik/`; a `schema` of `magik-repo/harness@1` or `magik-harness/harness@1`; a long `_doc`; a `vault` written as an absolute path under the home directory; a tracked overlay.
- **Why.** The runtime reads only `.magik/harness.json` and `.magik/harness.local.json`. Anywhere else, the harness looks absent and sessions start without the vault.
- **Do.** `git mv` the pointer (and the overlay) into `.magik/`. Set `schema` to `magik-harness/harness@2`, drop `_doc`, write the vault as `~/...`, and keep every other field (mounts, autonomy, `inject`). If the overlay was tracked, `git rm --cached` it. Do this before `install`: it never overwrites a pointer, and it reads the vault from it. If `install` ran first and seeded `.magik/harness.json` from its defaults (the lock lists it under `seeds` and the file is unchanged), the older pointer is the project's decision: put its content in the seeded file's place and tell the user. `install` may also have created empty store folders in the vault for the seeded pointer; leave the vault alone and name the unused folders in the report.

## A session hook from an older install

- **Look for.** `.cursor/hooks/session-start.js`, or any session-start script outside `.magik/runtime/`; an entry for it in `.cursor/hooks.json` or `.claude/settings.json`, beside the new entry or alone.
- **Why.** Two hooks inject the context twice, and the old one reads the old paths.
- **Do.** After `install` has registered the new command, remove the old entry and `git rm` the script. If the script holds the project's own edits, show the user the diff and port only what is project-specific into a script of the project's own. Do not fork the runtime.

## Older managed blocks

- **Look for.** In `AGENTS.md`, a block between `<!-- harness:primer:start ... -->` and `<!-- harness:primer:end -->`; in `.gitignore`, one between `# harness:gitignore:start` and `# harness:gitignore:end`. The marker lacks the `magik-harness:` prefix.
- **Why.** `install` manages only blocks with the current markers, so the old ones stay behind: the always-on text appears twice and the ignore rules are doubled.
- **Do.** After `install` has added the current blocks, delete the old ones. From the old `.gitignore` block, keep as plain lines any rule the project still needs that the current block does not repeat (the current block ignores `.magik/harness.local.json` and `.magik/backups/`).

## Instructions that duplicate the harness

- **Look for.** Always-on rules or instruction text that restates the harness: rule files named `harness`, `knowledge-base`, `memory`, `agentic-work`, `kb-conventions`, `worktrees` or `ci-runners` in `.cursor/rules/`; copies of the primer in `CLAUDE.md`, `GEMINI.md`, `.cursorrules`, `.windsurfrules`, `.clinerules` or `.github/copilot-instructions.md`.
- **Why.** Instructions that repeat the primer cost context in every session, and a stale copy that disagrees with it is worse than none.
- **Do.** Delete a pure copy. If the file also holds rules about the project itself, move those into `AGENTS.md` below the managed block (or keep a rule file that holds only them) and delete the rest. A tool that does not read `AGENTS.md` gets a one-line import (`@AGENTS.md` in `CLAUDE.md`).

## Dependence on a plugin or slash commands

- **Look for.** References to slash commands such as `/magik-repo-setup`, or to plugin folders such as `~/.cursor/plugins/local/magik-repo/`, in docs, scripts, CI, rules, hooks or notes.
- **Why.** They work only on machines that have that plugin. The harness is self-contained: everything it needs is in the repo or in `~/.magik`.
- **Do.** Replace them with the skill name (`kb-sanitize`, `kb-code-sync`, `harness-fit`) or with the project's own copy of the script (`<skills folder>/<skill>/scripts/...`, from the pack that ships it).

## Your own copies of harness skills

- **Look for.** Skill folders with the names of shipped skills (`kb-search`, `harness`, ...) that are not in `.magik/lock.json`, or that `doctor` reports as modified locally.
- **Why.** `install` reports a conflict and leaves them, and an edited fork stops receiving updates.
- **Do.** Identical to the shipped version: delete it and run `install` or `upgrade`. Edited: show the diff, move what is project-specific into a skill of the project's own with a different name (or into `AGENTS.md`), then delete the fork. Never keep edits under a managed name.

## Homemade versions of what the harness provides

- **Look for.** Scripts, CI steps, tests or Makefile targets that read the pointer JSON themselves, locate the vault by a hard-coded path, print a session context of their own, or search the KB with their own code; wrappers around the old pointer path.
- **Why.** They break the next time the pointer or the layout changes, and they quietly disagree with the runtime.
- **Do.** Call `magik-harness resolve --json` and read the paths from it (`vaultDir`, `knowledge.dir`, `memory.dir`, `source`, `warnings`), or import the runtime's `resolve.mjs`. Keep only what is genuinely the project's.

## A homemade agent setup

- **Look for.** Agent or AI documentation inside the repo (`docs/ai/`, `AI.md`, `prompts/`, `.ai/`), scratch or notes files used as memory (`NOTES.md`), and knowledge-base-like folders (decisions, specs, policies) kept in the code repo.
- **Why.** Two sources of truth: the one in the repo and the one in the vault.
- **Do.** Ask. Propose which items become KB entries in the vault (the vault lives outside the repo) and which stay where they are. Never move content without agreement, and leave a one-line pointer where the content was, not a copy.

## Old names and paths in the project's own text

- **Look for.** The search above, in scripts, tests, docs and READMEs, CI workflows, Dockerfiles, pre-commit configuration, and knowledge-base pages about local setup.
- **Why.** Anything that names an old path fails the day the old file is gone, and a test that pins the old layout fails the fit itself.
- **Do.** Update the text to the current paths. Where a guard test pins a file list or a layout, update the test in the same change and keep it as strict as it was: change what it points at, not what it protects.

## Ignore lists, formatters and CI filters

- **Look for.** `.dockerignore`, `.prettierignore`, markdown-lint settings, pre-commit `exclude:` entries, `.gitattributes`, and CI `paths` or `paths-ignore` filters.
- **Why.** A formatter that rewrites `.magik/**` or the skills folder makes managed files look hand-edited (`doctor` reports them as modified and `upgrade` keeps them). A path filter decides whether a harness-only change runs the project's CI.
- **Do.** Exclude `.magik/` and the skills folder from formatters, then run the formatter once and confirm `doctor` stays clean. Tell the user how the CI filters treat a harness-only change and leave them as they are unless the user agrees to change them.

## A tool's folder is git-ignored

- **Look for.** `git check-ignore -v .cursor/hooks.json .claude/settings.json .agents/skills`; the installer's notice that it fell back to `.cursor/skills` or skipped a tool.
- **Why.** An ignored file never reaches a clone or a worktree, so the registration would work on this machine only.
- **Do.** Accept the fallback folder the installer chose. For a tool whose folder a generator owns and git ignores, ask: track the registration, or leave that tool out (`--tools`). Do not un-ignore a generated folder.

## A clone or worktree with no vault

- **Look for.** A `doctor` failure that the vault path is missing; a linked worktree whose pointer is not tracked.
- **Why.** The pointer is tracked so that every worktree resolves the same vault, but the vault itself lives outside the repo.
- **Do.** Clone or mount the vault, or put this machine's path in `.magik/harness.local.json` (`{"vault": "<path>"}`), and track the pointer.

## Edited managed files

- **Look for.** `doctor` or `install --dry-run` showing a file as modified locally (`keep`) or as a conflict.
- **Why.** The CLI never overwrites an edit on its own, so the file stops following releases.
- **Do.** Decide per file. An intended edit moves out of the managed file (a project skill, or `AGENTS.md` below the block), and then `upgrade --force` refreshes it (it makes a backup first). An accidental edit is just `upgrade --force`.

## Machine level (global fit only)

- **Look for.** An older plugin folder under `~/.cursor/plugins/local/`; rule files under `~/.cursor/rules/` meant as always-on rules (Cursor does not read user-level rule files); an older session-start entry in `~/.cursor/hooks.json` beside the new one; user rules in a tool's settings that restate the harness.
- **Why.** Duplicates cost context, and an old plugin keeps offering commands that point at removed paths.
- **Do.** Remove duplicates only with the user's agreement. Move a plugin folder aside rather than deleting it: it may hold other things the user still uses. Settings-level user rules cannot be edited from here: list them for the user, with the text to remove.
