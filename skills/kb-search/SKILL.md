---
name: kb-search
description: >-
  Gather full context before any substantive work. The KB is the claimed
  ground truth, but it can be stale or wrong — so corroborate it against the
  code and the live state of dependent services, and reconcile drift. Resolves
  the KB from .cursor/harness.json and navigates the external vault with your
  own tools (Read / Grep / semantic search / code-intel / MCP). A mandatory
  pre-task gate — never satisfied by a KB search alone.
---

# Context gather (the pre-task gate)

The pre-task gate. Before acting, ground yourself in the project's actual reality — not your training priors, and not the KB alone. The KB is the *start* of context, not the end: it states what *should* be true, but it can be stale, partial, or wrong. A worker that stops at a KB search inherits whatever drift the KB has accumulated. So triangulate three sources and reconcile them:

| Source | What it tells you | Trust |
| --- | --- | --- |
| **Knowledge base** | The *claimed* truth — decisions, policies, specs, context. | Authoritative *intent*, but verify it still holds. |
| **Code** | The *actual* implementation. | What the system really does today. |
| **Dependent services** | The *live* state — schema, config, flags, deployed version, health. | Runtime reality, which neither KB nor code fully captures. |

This is a lightweight *procedure* you run with your normal tools — there is no index server and no schema to satisfy.

## When to run

**Always**, before any task that produces, modifies, or commits domain-relevant content, and before answering a domain-relevant factual question. Scale the depth to the task: a small, well-bounded change needs a quick KB + code pass; a change that touches a live service or a documented policy warrants the full triangulation. Skip it only for trivial, project-agnostic actions (formatting a sentence, renaming one local variable). If in doubt, run it — it's cheap relative to acting on a wrong premise.

## Procedure

1. **Resolve the KB.** Read `.cursor/harness.json`. Expand `~` in `vault`; the KB lives at `join(vault, knowledge.mount)` (for `accessVia: path`) or behind the MCP server (for `accessVia: mcp`). If the manifest is absent, the repo isn't harnessed — offer `/magik-repo-setup` and proceed with code + services only.
2. **Orient.** Read the KB root `_index.md` if present to learn the layout (it's the map / MOC).
3. **Read the KB (claimed truth).** Use the best available tool: semantic search over the KB folder, `Grep` for the query's nouns/verbs, `Glob`/list to find candidates. Open the entries that bear on the task. Prefer `status: active`; follow a `deprecated` entry's `superseded_by` forward link. Traverse relations (`related`, `depends_on`, `implements`/`implemented_by`, `decided_by`) and `[[id]]` refs to neighbouring truth (see `rules/kb-conventions.mdc`).
4. **Inspect the code (actual reality).** For each load-bearing KB claim, look at the code that should embody it. Prefer **deterministic structure where it exists** — code-intelligence go-to-definition / find-references, dependency manifests, config — over probabilistic text grep. The KB says *what should be*; the code says *what is*.
5. **Check dependent services (live state).** Identify the services this task depends on from config / manifests / env / the KB. Then **actually probe their current state, read-only**, wherever a safe path exists — an MCP server, a CLI, a read replica, a status/health or version endpoint — to learn the real schema, configuration, feature flags, deployed version, or health. Stay strictly read-only; **never mutate a service during the gate.** Where no safe read path exists, fall back to the *declared* dependency and mark it **unverified** rather than assuming it matches the KB.
6. **Reconcile drift.** Compare the three. Where the KB disagrees with the code or the live state, the KB is the suspect — surface the divergence as a finding (this is the inline form of `/magik-repo-kb-code-sync`; escalate to that skill for a full pass). Decide which source is authoritative for the task at hand and proceed on *reality*, not on a stale claim. If the reconciliation changes durable truth, fix the KB per `knowledge.autonomy` (it's almost always the **living surface** — a `concept`/`specification`/`policy` — that's gone stale; records are corrected by superseding, see `rules/kb-conventions.mdc` §4.6).
7. **Surface conflicts.** If an `active` policy/decision would be **violated** by the task, stop and surface it before proceeding. If one is merely *relevant*, read it before acting so you don't contradict or duplicate it.
8. **Degrade gracefully.** If the vault is missing, a service is unreachable, or a probe isn't safe, say so and proceed with what you have — never block. Note which sources you couldn't verify.

Treat memory hits (from the memory mount) as *context*, never as authority.

## Output

A short brief, not entry bodies:

```markdown
# Context gather — <query summary>

## KB (claimed)
- knowledge/engineering/auth.md (active) — sets the auth approach; read before changing login.
- knowledge/product/pricing.md (active) — tiers + limits.

## Code (actual)
- src/auth/session.ts implements the documented session flow; matches the KB.

## Services (live)
- supabase: `profiles` table has a `deleted_at` the KB's data-model entry doesn't mention. ⚠ drift.

## Reconciliation
- ⚠ KB pricing entry says "3 tiers"; Stripe has 4 active prices → KB likely stale (escalate to kb-code-sync).

## Conflicts
- ⚠ knowledge/engineering/no-direct-db-writes.md — the proposed change would violate this.

## Coverage
- KB: 2 entries opened. Code: 1 path verified. Services: supabase probed (read-only); stripe declared-only (unverified).
```

Return paths + one-line gists; open full bodies only for what you'll actually use.

## Anti-patterns

- **Stopping at the KB.** Treating a KB search as the whole gate — the KB is the *start* of context. Corroborate against code and live services.
- Answering a domain question with zero Read/search calls because "I know this."
- Trusting a stale KB claim over the code or the live service state when they disagree (surface the drift; act on reality).
- Mutating a service during the gate — probes are strictly read-only.
- Returning whole entry bodies instead of paths + gists.
- Acting on a `deprecated` entry without following it to the current one.
- Treating a memory note as ground truth over an active KB policy.
