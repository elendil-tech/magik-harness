# What changed between releases

The installed version is `version` in `.magik/lock.json` (`~/.magik/lock.json` at global scope). Read every entry after it, newest last, and apply what it asks of the project's own files. No lock means the project was never fitted: do the full fit ([fitted.md](fitted.md) and [drift.md](drift.md)).

`upgrade` refreshes the files the CLI manages, so an entry is only needed for what the CLI cannot do: a file that moved, a marker that changed, a skill that was renamed, a hook command that changed. Each release gets a heading, even when the entry says there is nothing to do, so that a release never ships without someone deciding.

## 2.0.0

The first release of the layout in [fitted.md](fitted.md): everything under `.magik/` (project) or `~/.magik/` (global), skills in `.agents/skills`, one primer block, one hook entry per tool.

A project that has anything older (the pointer under `.cursor/`, a hook script in `.cursor/hooks/`, primer blocks without the `magik-harness:` prefix, harness rules in `.cursor/rules/`) gets the full fit. Every older shape is a drift entry in [drift.md](drift.md).

## 2.0.1

Nothing moved and no marker changed: `upgrade` carries everything. The harness is distributed from GitHub only; there is no npm package, so `npx magik-harness` never resolved. Two shipped skills (`harness`, `harness-fit`) now name the form that works, `npx github:elendil-tech/magik-harness`.

In the project's own files (docs, scripts, CI), replace any `npx magik-harness …` or `magik-harness@<version>` with `npx github:elendil-tech/magik-harness …`. In CI pin a tag (`npx github:elendil-tech/magik-harness#v2.0.1 doctor …`) so a run does not move with `main`. Search the repo for `npx magik-harness` and `magik-harness@` to find them.
