---
name: init-harness
description: Seed the project with the harness scaffolding (AGENTS.md, .gitignore, knowledge/, workspace/, codebase/). Idempotent, marker-aware, never overwrites user content.
---

# /init-harness

Seed a project with the four-component harness layout. Safe to run on empty repos and on existing projects: marker-bounded blocks merge with existing `AGENTS.md` and `.gitignore`; everything else is created only when missing.

Refer to `bundles/INIT-SPEC.md` (in the harness source repo) for the full specification, including the upgrade and refusal matrices.

## Flags

- `--dry-run` — print the plan and exit, no writes.
- `--yes` — apply without prompting (no-op for v0.1.0 since the hook is non-interactive).
- `--project-root <path>` — override the project root (defaults to `process.cwd()`).

## Orchestration

The agent's role is **orchestration only** — all filesystem mutation goes through the hook.

1. Resolve the plugin root (the directory that contains this command's parent plugin folder).
2. Resolve the user's project root (the agent's cwd unless `--project-root` is passed).
3. Invoke the hook:

   ```bash
   npx --yes tsx <plugin-root>/hooks/init-harness.ts \
     --project-root <project-root> [--dry-run] [--yes]
   ```

   For local development with `pnpm link-local`, the symlink at `~/.cursor/plugins/local/magik-repo` resolves the plugin root and the local `node_modules` provides `tsx`; in that case prefer `pnpm exec tsx hooks/init-harness.ts ...` invoked from the plugin root.

4. Surface the hook's stdout and exit code verbatim.
5. On success, suggest the user run `/audit` to pick starting domains.

## What the hook does (v0.1.0)

| Detected state | Action |
| --- | --- |
| Empty project | Lay down the full seed (AGENTS.md primer, .gitignore section, knowledge/, workspace/, codebase/README.md). |
| Existing AGENTS.md without harness markers | Prepend the primer block. |
| Existing AGENTS.md with markers | Print "already harnessed at v=<x>"; no changes. |
| Existing .gitignore without harness markers | Append the harness section. |
| Existing .gitignore with markers | No changes. |
| Existing knowledge/_meta/ files | Skip; create only the missing ones. |
| Existing workspace/ files | Skip. |
| Existing codebase/README.md | Skip. |

The hook exits `0` on success or no-op, `1` on any unrecoverable error.

## Deferred (post-v0.1.0)

- Replacing stale `v=` blocks in place (upgrade flow). Today the hook detects the marker and refuses with "already harnessed".
- `--migrate=copy|subtree|submodule|none` for code-at-root cases. Today a notice is printed; the apply phase is not blocked.
- Atomic rollback on partial mid-write failure. Today writes are best-effort.
- Richer exit codes (10 / 20 / 30 / 40 / 50 per the spec). Today only `0` / `1`.
