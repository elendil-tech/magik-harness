# What changed between releases

The installed version is `version` in `.magik/lock.json` (`~/.magik/lock.json` at global scope). Read every entry after it, newest last, and apply what it asks of the project's own files. No lock means the project was never fitted: do the full fit ([fitted.md](fitted.md) and [drift.md](drift.md)).

`upgrade` refreshes the files the CLI manages, so an entry is only needed for what the CLI cannot do: a file that moved, a marker that changed, a skill that was renamed, a hook command that changed. Each release gets a heading, even when the entry says there is nothing to do, so that a release never ships without someone deciding.

## 2.0.0

The first release of the layout in [fitted.md](fitted.md): everything under `.magik/` (project) or `~/.magik/` (global), skills in `.agents/skills`, one primer block, one hook entry per tool.

A project that has anything older (the pointer under `.cursor/`, a hook script in `.cursor/hooks/`, primer blocks without the `magik-harness:` prefix, harness rules in `.cursor/rules/`) gets the full fit. Every older shape is a drift entry in [drift.md](drift.md).
