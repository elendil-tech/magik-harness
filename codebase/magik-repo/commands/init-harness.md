---
description: Seed a project with the harness scaffolding. Idempotent and marker-aware; never overwrites user content.
---

# Init Harness

Seed a project with the four-component harness layout (`AGENTS.md`, `.gitignore`, `knowledge/`, `workspace/`, `codebase/`). Safe on empty repos and on existing projects: marker-bounded blocks merge with existing `AGENTS.md` and `.gitignore`; everything else is created only when missing.

## Flags

- `--dry-run` — print the plan and exit, no writes.
- `--project-root <path>` — override the project root (defaults to `process.cwd()`).

## Orchestration

The agent's role is **orchestration only** — all filesystem mutation goes through the hook.

1. Resolve the user's project root (the agent's cwd unless `--project-root` is passed).
2. Invoke the hook from the plugin's local install:

   ```bash
   npx --yes tsx ~/.cursor/plugins/local/magik-repo/hooks/init-harness.ts \
     --project-root <project-root> [--dry-run]
   ```

3. Surface the hook's stdout and exit code verbatim.
4. On success, suggest the user run `/audit` to pick starting domains.

## Behavior (v0.1.0)

| Detected state | Action |
| --- | --- |
| Empty project | Lay down the full seed |
| Existing AGENTS.md without harness markers | Prepend the primer block |
| Existing AGENTS.md with markers | Skip; "already harnessed at v=<x>" |
| Existing .gitignore without harness markers | Append the harness section |
| Existing .gitignore with markers | Skip |
| Existing knowledge/_meta/ files | Skip; create only the missing ones |
| Existing workspace/ files | Skip |
| Existing codebase/README.md | Skip |

The hook exits `0` on success or no-op, `1` on any unrecoverable error.

Full spec including the upgrade and refusal matrices (post-v0.1.0): https://github.com/codeisalifestyle/magik-repo-plugin/blob/main/bundles/INIT-SPEC.md
