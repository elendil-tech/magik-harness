---
name: magik-harness-setup
description: Install, repair or upgrade the magik-harness for this project or this machine, with a dry-run preview and a doctor check.
---

Set up the harness here. Load the `harness-setup` skill and follow it: look first with `magik-harness doctor`, ask the few questions it lists (scope, vault, layout, access, autonomy), preview with `--dry-run`, apply, then verify with `doctor`.

The installer (`npx magik-harness install ...`) owns every file it writes; do not create the managed files by hand. Surface its output and exit code as they are.
