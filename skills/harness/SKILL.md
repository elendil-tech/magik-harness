---
name: harness
description: >-
  How this project's agent harness works: a normal code repo plus a vault outside it that holds a
  knowledge base (the project's ground truth) and memory (the running log), found through a small
  pointer file, with four rules for how agents treat them. Use when the user asks how the harness
  works, when the session context reports a harness warning or a missing vault, when you need to
  know where the KB or memory lives, or before changing the pointer, the KB autonomy, or the install.
---

# The harness: operating model

The repo is a **normal code repo**. The harness adds an external vault, a way to find it, and four rules for how agents treat it. It enforces *where* knowledge and memory live and *how they are treated*. It does not impose a folder structure on your code or on your KB.

## What is installed

A **project** install (the default) keeps everything in the repo, so every clone and worktree has it:

| Piece | Where | Purpose |
| --- | --- | --- |
| Primer | managed block at the top of `AGENTS.md` | The four rules, loaded every session |
| Skills | `.agents/skills/` (or the folder `magik-harness doctor` reports) | Procedures, loaded on demand |
| Pointer | `.magik/harness.json` (tracked) | Names the vault and the mounts |
| Local overlay | `.magik/harness.local.json` (gitignored) | Per-machine override of the pointer |
| Session hook | `.magik/runtime/` plus a registration in the tool's hook config | Prints paths, today's memory and git state at session start |
| Lock | `.magik/lock.json` | What the installer wrote, with hashes, so upgrades keep your edits |

A **global** install keeps the same pieces under `~/.magik/`, `~/.agents/skills/` and the tool's user-level config. It adds nothing to any repo; a repo resolves a vault through the convention in `~/.magik/config.json` or through its own pointer. Both scopes can be installed at once.

## The two services

| Service | Role |
| --- | --- |
| **Knowledge base** | Foundational project truth: decisions, policies, specs, context. Read before substantive work; maintained at the level `knowledge.autonomy` grants. |
| **Memory** | A running log of what happened and what was learned. Written freely as work happens; never the source of truth. |

Both are plain Markdown in a **vault**, a folder outside the repo (often its own git repo). Keeping them in one vault is for retrieval convenience; they stay distinct concerns.

## The pointer

```json
{
  "schema": "magik-harness/harness@2",
  "vault": "~/vaults/acme",
  "knowledge": { "mount": "api/knowledge", "accessVia": "path", "autonomy": "open" },
  "memory":    { "mount": "api/memory",    "accessVia": "path", "inject": { "maxBytes": 4000 } },
  "mounts": [
    { "name": "company", "role": "knowledge", "mount": "company/knowledge", "autonomy": "readonly" }
  ]
}
```

- `vault`: the vault root. A leading `~` is the home directory; a relative path is relative to the project root. `null` is allowed when every store is `accessVia: "mcp"`.
- `accessVia: path` (default): the store is the folder `join(vault, mount)`; navigate it with your normal tools. `accessVia: mcp`: the store is remote and `mount` is a logical id wired through the user's MCP configuration.
- `knowledge.autonomy`: `open` (default), `ask` or `readonly`. Anything else is treated as `open`.
- `memory.inject.maxBytes`: how much of today's note the hook injects (default 4000; the newest tail wins).
- `mounts[]`: extra stores, such as a shared company KB read next to the project's own, each with its own autonomy.
- `git`: optional policy for the hook's git paragraph (`always`, `harnessed`, `never`).

## How a project resolves

1. `.magik/harness.local.json` merged over `.magik/harness.json` (the 1.x paths `.cursor/harness*.json` are still read).
2. Otherwise the global `~/.magik/config.json`: stores are `<vault>/<project>/knowledge` and `<vault>/<project>/memory`, active only if that project folder exists in the vault.
3. Otherwise the repo is not harnessed. That is not an error; nothing is printed.

The project name is the folder name of the **primary checkout**, so a linked git worktree resolves the same vault as the repo it belongs to. `magik-harness resolve` prints the result and which step produced it.

## Failure modes

| Situation | What happens |
| --- | --- |
| No pointer and no global config | Silent; the harness is inactive |
| Pointer found but the vault path is missing | A loud WARNING block in the session context with the path and the fix; the session continues. Usually the vault is not cloned on this machine yet |
| Pointer unreadable | WARNING naming the file and the parse error |
| Store unreachable (MCP down) | Say so, proceed with what you have, never block the task |

## The four rules

1. **Gather full context before substantive work.** Before producing, modifying or committing anything domain-relevant, run the `kb-search` skill. The KB is the *start* of context, not the end: it states what *should* be true, so corroborate it against the **code** (what the system actually does) and the **live state of dependent services** (read-only probes where a safe path exists), and act on reality where they diverge. Your training priors are not this project's ground truth, and a stale KB is not either. Skipping this because "I already know", or stopping at a KB search alone, is the failure this harness exists to catch.
2. **Keep the KB in sync, at the autonomy the pointer grants** (`knowledge.autonomy`, default `open`):
   - **`open`**: keep the KB in step with your work *without asking*. When the work produces or changes durable knowledge (a decision made, a policy clarified, a spec that now matches the code, a fact the code contradicts), create or update the entries as part of the same task, following `knowledge-base` and `kb-conventions`. You still **surface rather than silently perform** large or destructive moves: mass renames, reorganizations, deleting entries, rewriting unrelated entries.
   - **`ask`**: read always; write or reshape the KB only when the user asks, or approves a `kb-sanitize` / `kb-code-sync` proposal. You may still correct a *verified-wrong* fact.
   - **`readonly`**: never write the KB; report what you would change.

   An explicit instruction always wins over the configured default for that action.
3. **Memory is for recency; the KB is for durable truth.** Write observations and lessons to memory freely (`harness-memory`). Never auto-promote memory into the KB; when a past note is useful, find it with your own search. If a note should become ground truth, offer to record it in the KB.
4. **Close the agentic loop.** Orient, strategize, implement, **verify**, human approval if taste is involved, ship, **KB sync**, clean up. Completion means merged, ship and CI gates held, knowledge updated, workspace tidy. Raise a human approval gate (with drafts, when creative) for design, copy, brand or front-end taste; never block programmatically verifiable work on a human. Resolve code merge conflicts during ship and vault conflicts during KB sync. Orient on start, cloud-save on pause (`git commit -m "wip: <checkpoint> [skip ci]"` plus `git push`), never `git stash` across worktrees. Procedure: `agentic-e2e-loop`.

## Structure floor (light, not zero)

The KB is free-form Markdown with a thin convention so the maintenance skills have something to reason about: light frontmatter (`status: active | deprecated`, `updated:`), relative links or wikilinks between entries, and an optional `_index.md` at the KB root that orients a fresh reader. No enforced schema, no registry, no promotion contract. See `knowledge-base` and `kb-conventions`.

## Commands you can run

| Command | Use |
| --- | --- |
| `magik-harness doctor` | Is the harness installed and working here? Prints the exact fix for anything wrong |
| `magik-harness resolve` | Where do this project's KB and memory live, and why |
| `magik-harness status` | Which installs exist and which version |
| `magik-harness upgrade` | Re-apply the install with newer content; your edits are kept |
| `magik-harness init` | Create the vault folders for this project |

If the command is not installed, `npx magik-harness <command>` runs it. To install or repair the harness, use the `harness-setup` skill (available where the global profile or the Cursor plugin is installed) or run `magik-harness install --help`.
