---
name: kb-search
description: >-
  Search the knowledge base before any substantive work. Use BEFORE producing,
  modifying, or committing content; before answering domain-relevant questions.
  Resolves the KB from .cursor/harness.json and navigates the external vault
  with your own tools (Read / Grep / semantic search). A mandatory pre-task
  gate — do not skip it because "I already know."
---

# KB search

The pre-task gate over the knowledge base. The KB is the project's ground truth; your training priors are not. This skill is a lightweight *procedure* you run with your normal tools — there is no index server and no schema to satisfy.

## When to run

**Always**, before any task that produces, modifies, or commits domain-relevant content, and before answering a domain-relevant factual question. Skip it only for trivial, project-agnostic actions (formatting a sentence, renaming one local variable). If in doubt, run it — it's cheap.

## Procedure

1. **Resolve the KB.** Read `.cursor/harness.json`. Expand `~` in `vault`; the KB lives at `join(vault, knowledge.mount)` (for `accessVia: path`) or behind the MCP server (for `accessVia: mcp`). If the manifest is absent, the repo isn't harnessed — offer `/magik-repo-setup` and proceed without the gate.
2. **Orient.** Read the KB root `_index.md` if present to learn the layout.
3. **Navigate to relevance.** Use the best available tool: semantic search over the KB folder, `Grep` for the query's nouns/verbs, `Glob`/list to find candidate files. Open the entries that actually bear on the task.
4. **Honor status.** Prefer `status: active` entries. If an entry is `deprecated`, follow its forward link to the current one. Treat memory hits (from the memory mount) as *context*, never as authority.
5. **Surface conflicts.** If an `active` policy/decision would be **violated** by the task, stop and surface it before proceeding. If one is merely *relevant*, read it before acting so you don't contradict or duplicate it.
6. **Degrade gracefully.** If the vault path is missing or the remote store is unreachable, say so and proceed with what you have — never block.

## Output

A short brief, not entry bodies:

```markdown
# KB search — <query summary>

## Relevant
- knowledge/engineering/auth.md (active) — sets the auth approach; read before changing login.
- knowledge/product/pricing.md (active) — tiers + limits.

## Conflicts
- ⚠ knowledge/engineering/no-direct-db-writes.md — the proposed change would violate this.

## Coverage
- Searched: 2 areas via semantic + grep; opened 3 entries. Memory: 1 recent note (context only).
```

Return paths + one-line gists; open full bodies only for what you'll actually use.

## Anti-patterns

- Answering a domain question with zero Read/search calls because "I know this."
- Returning whole entry bodies instead of paths + gists.
- Acting on a `deprecated` entry without following it to the current one.
- Treating a memory note as ground truth over an active KB policy.
