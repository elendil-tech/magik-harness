# Start, middle or end: one harness, a different fit

The harness is the same for every project. The work of fitting it depends on when it arrives. Decide which of these you are in before you plan, and say so to the user.

## A new project

Nothing to adjust yet; the fit is quick.

1. Install: `knowledge` if a vault exists or will soon, `minimal` otherwise (it can grow later with `install --profile knowledge --vault <dir>`).
2. `magik-harness init` creates the vault folders for the project.
3. Run `doctor` and commit the harness files in one commit.
4. Offer to write the first knowledge-base entries: why the project exists, how to run it, and the decisions already made. Only when the user wants them; autonomy `open` still means they are asked about large changes.

Keep `AGENTS.md` small from the start. The managed block is the primer; the project's own rules go below it.

## A project in progress

The common case: there is code, docs, CI and scripts, and probably some agent instructions of its own.

1. Survey first and read what is there: `AGENTS.md`, rule files, scripts that touch agent tooling, docs about local setup, the CI configuration. The drift entries tell you where to look.
2. Plan the install and the clean-up as separate commits: the install and carrying over what exists first, then removing duplicates and fixing references.
3. Do not mass-import documents into the knowledge base. Propose a short list (the few documents that act as ground truth) and let the user choose; later, `kb-code-sync` checks the KB against the code.
4. Keep the project's own skills, rules and scripts. Replace only what the harness now provides.

## A late-stage project

Years of accumulated setup: an earlier version of this harness, a homemade one, several tools' instruction files, scripts that wrap all of it.

1. Expect more drift and more things you cannot prove are copies. Go slower, ask more, and stage the work so that each step leaves the project working: pointer and install first, then the hook and the blocks, then rules and docs, then the homemade parts.
2. Run the project's checks after each step, not only at the end. Guard tests that pin the old layout are the usual surprise; update them with the files they pin.
3. Prefer deleting a copy to maintaining two. When a removal is a judgment call (it may hold something unique), keep the file, list it as a follow-up and let the user decide.
4. Leave the history alone. No rewriting of commits, no mass renames outside the harness's own paths.

## A re-fit (already installed)

Run it after `magik-harness upgrade`, when `doctor` warns, or when the setup has been touched by many hands.

1. `doctor --json`, then read [versions.md](versions.md) for every release after the installed one.
2. Apply what those notes ask of the project's own files, and look for the same drift entries again: new copies appear when people work from memory.
3. Check as usual, then commit.

A re-fit that finds nothing to do is a good result: say so in one line.
