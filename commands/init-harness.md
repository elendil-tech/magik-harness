---
name: init-harness
description: Seed a project with the four-component harness — knowledge/, workspace/, codebase/, .cursor/. Idempotent; never overwrites your content.
---

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

## Behavior (v0.2.0)

| Detected state | Action |
| --- | --- |
| Empty project | Lay down the full seed (incl. `memory/`) |
| Existing AGENTS.md without harness markers | Prepend the primer block |
| Existing AGENTS.md with current-version markers | Skip; "already harnessed at v=0.2.0" |
| Existing AGENTS.md with stale markers | **Upgrade in place** — replace block contents, preserve everything outside markers |
| Existing AGENTS.md with multiple/unmatched markers | Skip; "fix manually" |
| Existing .gitignore without harness markers | Append the harness section |
| Existing .gitignore with current-version markers | Skip |
| Existing .gitignore with stale markers | **Upgrade in place** — replace block contents |
| Existing `knowledge/_meta/` files | Skip; create only the missing ones |
| Existing `memory/` files | Skip; create only the missing ones |
| Existing `workspace/` files | Skip |
| Existing `codebase/README.md` | Skip |

The hook exits `0` on success or no-op, `1` on any unrecoverable error.

Full spec including the upgrade and refusal matrices: https://github.com/codeisalifestyle/magik-repo-plugin/blob/main/bundles/INIT-SPEC.md
