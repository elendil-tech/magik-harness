# magik-repo architecture — v1.0: the light harness

Canonical design spec for `harness@1`. This supersedes the v0.x five-component, in-repo model.

## 1. The defect this fixes

v0.x turned the repo into a *project/business repo*: it imposed `knowledge/`, `memory/`, `workspace/`, and `codebase/` folders, five KB schemas, a domain-registry spine, a memory→KB promotion contract, and a trust/quarantine + propose-then-apply governance system. Two problems surfaced in real use:

1. **Worktree fragmentation.** `memory/` (and `workspace/`) were repo-local folders. A single operator running several git worktrees of one project got a *different* memory per worktree — state forked instead of accumulating.
2. **Over-imposition.** The harness recorded low-level code detail into the KB, enforced a heavy ontology, and gave the agent authoring control over the KB via promotion. For a single-founder workflow this was ceremony, not leverage.

v1.0 resolves both by **separating the stores from the repo** and **stripping the ontology**.

## 2. The model

The repo is a **normal code repo**. The harness adds two external services and a tracked pointer:

| Service | Location | Role |
| --- | --- | --- |
| Knowledge base | external vault | foundational project/business truth |
| Memory | external vault | running log of what happened / was learned |

"Vault" is just a folder outside the repo (e.g. an Obsidian vault). Knowledge and memory are co-located in it for retrieval convenience but remain distinct concerns.

```
code repo (this repo)                external vault (your storage)
├── <your code at root>             ├── <project>/knowledge/   ← ground truth
├── AGENTS.md   (primer block)      │   └── _index.md
└── .cursor/                        └── <project>/memory/      ← the agent's log
    ├── harness.json  ← pointer ───▶    └── daily/<date>.md
    └── hooks/session-start.js
```

## 3. The pointer: `.cursor/harness.json`

Tracked in the code repo, so every git worktree of the clone resolves the **same** vault — the worktree-fragmentation fix.

```json
{
  "schema": "magik-repo/harness@1",
  "vault": "~/Projects/elendil-technologies-vault",
  "knowledge": { "mount": "falconproxy/knowledge", "accessVia": "path", "autonomy": "open" },
  "memory":    { "mount": "falconproxy/memory",    "accessVia": "path" }
}
```

- `vault` — the vault root; a leading `~` expands to the home directory.
- `mount` — path under the vault (for `accessVia: path`) or a logical store id (for `accessVia: mcp`).
- `accessVia` — `path` (local folder, default) or `mcp` (remote storage wired through the user's MCP config; `vault` may be null).
- `knowledge.autonomy` — how freely the agent writes the KB on its own initiative: `open` (default — keep the KB in sync with the work, surfacing only large/destructive restructurings), `ask` (write only on request or an approved proposal), or `readonly` (report only). Absent/unrecognized → `open`. Additive and backward-compatible; the schema is unchanged.

It is the user's choice whether the vault is user-level (many projects) or project-level (one). The harness enforces neither — the mounts point the agent at the right place; it may navigate wider when useful. A per-machine override can live in a gitignored `.cursor/harness.local.json` if the tracked path doesn't suit every clone.

## 4. What the harness enforces

Only the contract above plus three behaviors (full text in `rules/harness.mdc`):

1. **Read the KB before substantive work** (the `kb-search` skill).
2. **Keep the KB in sync — at the autonomy the manifest grants** — it's ground truth; `knowledge.autonomy` (default `open`) tunes how freely the agent maintains it on its own initiative (`open` / `ask` / `readonly`). Large or destructive restructurings are always surfaced first.
3. **Memory is for recency; the KB is for durable truth** — write memory freely, never auto-promote it into the KB; durable shared truth belongs in the KB.

## 5. Structure floor

Light, not zero — enough for the maintenance commands to reason, no schema system:

- KB entries are free-form Markdown with light frontmatter (`status: active | deprecated`, `updated:`).
- Relative links / wikilinks form the graph.
- An optional `knowledge/_index.md` orients a fresh reader and replaces the old domain registry. It's a map, not a contract.

No five schemas, no registry spine, no promotion, no trust/quarantine, no propose-then-apply ceremony.

## 6. Components

- **Commands (3):** `/magik-repo-setup` (interactive — point the repo at a vault, scaffold both sides), `/magik-repo-kb-sanitize` (heal KB internal coherence), `/magik-repo-kb-code-sync` (KB ↔ code drift).
- **Rules (3):** `harness`, `knowledge-base`, `memory`.
- **Skills (3):** `kb-search` (read-first gate), `kb-sanitize`, `kb-code-sync`.
- **Project hook:** `.cursor/hooks/session-start.js` resolves the manifest and injects today's memory daily note + a read-first reminder. Fail-open.

## 7. Setup flow

`/magik-repo-setup` is a short Q&A (vault path; user- vs project-level layout → mounts; path vs mcp; `knowledge.autonomy` → `open` default / `ask` / `readonly`), then the `hooks/setup.ts` hook performs deterministic writes:

- **Repo side:** `.cursor/harness.json`, marker-bounded `AGENTS.md` primer, slim `.gitignore` secret block, `.cursor/hooks/session-start.js` + `.cursor/hooks.json`.
- **Vault side (path):** `<vault>/<knowledge-mount>/_index.md` and `<vault>/<memory-mount>/`.

All writes are skip-if-exists; the `AGENTS.md` / `.gitignore` marker blocks upgrade in place on re-run.

## 8. Out of scope (future layers)

- Starter templating for a project's KB structure.
- Skill authoring/templating (and, optionally, a fresh skill-efficacy measurement layer).

These are deliberately not part of v1.0 — the harness stays a pointer plus a janitor.
