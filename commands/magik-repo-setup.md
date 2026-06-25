---
name: magik-repo-setup
description: Point this code repo at an external knowledge + memory vault. Interactive Q&A that writes .cursor/harness.json, a slim AGENTS.md primer, the session-start hook, and scaffolds the vault (knowledge _index.md + memory dir). How the vault is git-tracked is left to the user.
---

Wire this code repo into the magik-repo harness. The repo stays a normal code repo; knowledge and memory live in an **external vault** resolved through a tracked pointer at `.cursor/harness.json`.

This command is a short **conversation**, then a single deterministic write through the setup hook. Do not write any files yourself — the hook does all filesystem mutation.

## 1. Collect the answers (ask, don't assume)

Ask the user, one compact prompt at a time, and accept sensible defaults:

1. **Vault location.** Where is the vault (an external folder for this project's knowledge + memory)? Offer to point at an existing vault or create a new one. Supports `~`. Example: `~/Projects/elendil-technologies-vault`.
2. **Layout.** Is this a *user-level* vault holding many projects, or a *single-project* vault?
   - User-level → knowledge mount like `<project>/knowledge`, memory mount like `<project>/memory`.
   - Single-project → knowledge mount `knowledge`, memory mount `memory`.
3. **Access.** Local path (default) or remote via MCP? Choose `mcp` only for remote storage; then vault scaffolding is skipped and the mounts are logical ids wired through the user's MCP config.

## 2. Invoke the hook

Run the setup hook from the plugin's local install with the collected answers:

```bash
npx --yes tsx ~/.cursor/plugins/local/magik-repo/hooks/setup.ts \
  --project-root <project-root> \
  --vault <vault-path> \
  --knowledge-mount <knowledge-mount> \
  --memory-mount <memory-mount> \
  --access-via <path|mcp> [--dry-run]
```

Surface the hook's stdout and exit code verbatim.

## 3. What the hook does

| Side | Writes |
| --- | --- |
| Code repo | `.cursor/harness.json` (the vault pointer), `AGENTS.md` primer block, slim `.gitignore` secret block, `.cursor/hooks/session-start.js` + `.cursor/hooks.json`. |
| Vault (path access) | `<vault>/<knowledge-mount>/_index.md` orientation stub and `<vault>/<memory-mount>/`. The harness does **not** touch the vault's git tracking — no `git init`, no vault `.gitignore`. How the vault is stored or tracked is the user's choice. |

It never creates `knowledge/`, `memory/`, `workspace/`, or `codebase/` folders in the code repo. Everything is skip-if-exists; the marker-bounded `AGENTS.md` / `.gitignore` blocks upgrade in place on re-run. The hook exits `0` on success or no-op, `1` on any unrecoverable error.

After setup, suggest the user author the project's foundational context in the KB, then use `/magik-repo-kb-sanitize` and `/magik-repo-kb-code-sync` to maintain it.
