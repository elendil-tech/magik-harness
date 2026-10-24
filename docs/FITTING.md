# Fitting the harness to a project

The CLI puts the harness on. Fitting is making it sit right on this particular project, and keeping it that way. This page is for the people who ask for a fit and review the result. The instructions the agent follows are in the [`harness-fit` skill](../skills/harness-fit/SKILL.md); the design is in [ARCHITECTURE.md](ARCHITECTURE.md#12-fitting-how-a-project-is-brought-in-line).

- [Who does what](#who-does-what)
- [When to fit](#when-to-fit)
- [How to ask](#how-to-ask)
- [What happens](#what-happens)
- [What you will see in the diff](#what-you-will-see-in-the-diff)
- [What it will not do](#what-it-will-not-do)
- [Keeping it fitted](#keeping-it-fitted)
- [For maintainers: shipping fit notes with a release](#for-maintainers-shipping-fit-notes-with-a-release)

## Who does what

| | The CLI | The agent, following `harness-fit` |
| --- | --- | --- |
| Is | code: deterministic, the same every time | text: instructions an agent reads and carries out with its ordinary tools |
| Owns | the files the harness installs: the pointer seed, runtime, skills, primer block, hook entry, lock | everything else in the project that has to agree with them: scripts, tests, docs, CI settings, older instructions |
| Judges | nothing; it compares hashes | whether something is a copy, a project-specific rule, or in the way |
| Command | `install`, `upgrade`, `doctor` | "fit the harness to this project" |

Splitting it this way keeps the package small and honest: it knows one layout. Whatever does not match that layout is drift, and drift is the agent's to adjust, in a diff you can read.

## When to fit

| Moment | What it looks like | What the fit does |
| --- | --- | --- |
| A new project | an empty or young repo | installs, creates the vault folders, checks. Minutes |
| A project in progress | code, docs, CI and scripts, maybe instructions of its own for agents | installs, carries over what is worth keeping, removes what is now a copy, fixes references |
| A late-stage project | years of setup: an earlier version of this harness, a homemade one, several tools' instruction files | the same, slower: in steps that each leave the project working, with doubtful removals listed for you instead of made |
| After an upgrade | `magik-harness upgrade` refreshed the files; the release may also ask something of the project's own files | reads the release notes in the skill and applies them |
| When `doctor` warns | a failed or doubtful check | fixes the cause, or says why it can not |
| A new tool or teammate | another agent tool, another clone | registers the tool, checks the hook, checks nothing else is duplicated |

## How to ask

Install the harness first (`npx magik-harness install`, see the [README](../README.md#quick-start)), which also installs the skill. Then tell the agent, in your own words:

> Fit the harness to this project.

Any of these also work: "run the harness-fit skill", "set up the harness here", "bring this project in line with the harness", "we just upgraded the harness, re-fit". In Cursor there is a command for it (`/magik-harness-fit`) if you installed the plugin. `install` and `doctor` both end with a hint to do this when it is useful.

Headless is fine too: `cursor-agent -p --trust --force "Fit the harness to this project."` (print mode needs `--force` to change files, and `--trust` for a workspace it has not seen). With nobody to ask, the agent takes every default and lists the removals it could not prove safe instead of making them.

## What happens

1. **Survey.** It reads: `magik-harness status` and `doctor --json`, what a fitted project looks like, and a search of the whole repository for older paths, copies and homemade parts. Nothing changes yet.
2. **Plan.** It writes four short lists and shows them: what the CLI will do, what the agent will change, what it will remove, what it will keep and why. It asks only what the project cannot answer (scope, profile, vault), with a default each.
3. **Strap on.** The CLI runs: `install --dry-run` first, then the real thing. Its output and exit code are reported as they are.
4. **Adjust.** The agent carries over anything specific to the project from an older file, then removes the file; replaces homemade versions of what the harness provides with the harness's own; fixes every reference in scripts, tests, docs, CI and ignore lists.
5. **Check.** `doctor`, the project's own checks, a manual run of the session hook, and a second search for the old names. Nothing should be left.
6. **Hand over.** One commit (or a few) on a branch of its own, a report of ten lines or fewer, and a list of what you have to decide. It does not push or merge unless you ask.

A plan looks like this (the details are your project's, not this example's):

```text
CLI:      install --profile knowledge --vault ~/vaults/shop (dry run first)
Change:   scripts/vault-path.sh -> call `magik-harness resolve --json`
          docs/dev-setup.md, CONTRIBUTING.md -> current paths
Remove:   .cursor/hooks/session-start.js and its hooks.json entry (a copy of the shipped hook)
          the old primer block in AGENTS.md (the new block replaces it)
Keep:     .cursor/rules/shop-style.mdc (about the project, not the harness)
Ask:      docs/ai/NOTES.md holds decisions: move them into the vault, or leave them?
```

## What you will see in the diff

Typical changes, in the order a late-stage project meets them:

- `.magik/` appears (pointer, lock, runtime), plus the skills folder, a primer block at the top of `AGENTS.md`, a managed block in `.gitignore` and one hook entry per tool.
- An older pointer moves into `.magik/` with `git mv`, so its history follows; its schema line changes and its notes field shrinks.
- Older hook scripts, older primer or ignore blocks and instruction copies disappear, after anything of yours in them has moved to a project file.
- Scripts, tests and docs change from old paths to the current ones. A guard test that pinned an old layout changes with the files it pinned.
- Nothing in your vault changes unless you agreed to it (and, at autonomy `open`, a knowledge-base page that describes the old setup is brought up to date).

## What it will not do

- It does not write the files the CLI owns by hand. If one is wrong it fixes the cause and runs `upgrade`.
- It does not delete what it cannot show to be a copy. It asks, or lists it as a follow-up.
- It does not work on your default branch, push, merge or rewrite history unless you ask.
- It does not read `.env` files or credentials while it surveys.
- It does not change your CI workflows beyond what you agreed, and it tells you how path filters treat a harness-only change.
- It does not leave you with two of anything: two hooks, two primers, two sets of instructions.

## Keeping it fitted

A saddle slips over time. The checks that catch it:

- `magik-harness doctor` in a script or CI (`doctor --scope project --strict`, or the recipe in [CLI.md](CLI.md#recipes)) catches a missing or hand-edited managed file, an unregistered hook, a git-ignored managed path and a stale install.
- The session hook states, loudly, at the start of every session, when a configured harness is broken (a vault that is not on this machine, say).
- `kb-sanitize` and `kb-code-sync` keep the knowledge base itself honest.
- After every `upgrade`, ask for the fit again. It is usually short: survey, apply the release notes, check.

Nothing runs in the background; the checks run when you or the agent ask.

## For maintainers: shipping fit notes with a release

The skill's `references/versions.md` has a heading for every release. A release that changes what a project's own files should look like (a file that moved, a marker that changed, a skill that was renamed, a hook command that changed) says in its entry what the agent must do. A release that changes nothing of the kind still gets a heading, saying so. A test fails when the current package version has no heading, so a release cannot ship without that decision.

When a new kind of drift turns up in a real project, add it to `references/drift.md` (what to look for, why it matters, what to do). When the installer writes a new file or marker, add it to `references/fitted.md`: a test builds a real install and fails if the file does not name what the installer writes.
