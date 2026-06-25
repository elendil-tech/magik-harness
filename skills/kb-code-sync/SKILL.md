---
name: kb-code-sync
description: >-
  Check for drift between the knowledge base and the code. Use to verify that
  documented policies and features are actually implemented, and that the code
  hasn't diverged from documented truth. Produces a triage report; mutates
  nothing. Resolves the KB via .cursor/harness.json.
---

# KB ↔ code sync

Drift = the KB and the code disagreeing. This skill compares the project's documented truth against what the code actually does and produces a triaged report with proposals. It does not mutate state.

## Procedure

1. **Resolve the KB.** Read `.cursor/harness.json`; the KB is at `join(vault, knowledge.mount)` (path) or behind MCP. The code is this repo.
2. **Collect KB claims.** Read `active` entries that assert something checkable about the system — policies ("never write to the DB directly"), specifications (a feature's intended behavior), and decisions that name a technology, API, or path.
3. **Inspect the code.** For each claim, look at the relevant code (search by symbol, path, dependency manifest, config). Use judgment about depth — this is a review, not a proof.
4. **Classify each finding** (see table), assign severity, and propose a reconciliation.
5. **Report.** Never edit files here.

## Checks

| Class | Meaning | Example |
| --- | --- | --- |
| **Unimplemented truth** | A KB `policy`/`specification` the code does not satisfy. | KB says "all endpoints require auth"; a route has no guard. |
| **Undocumented reality** | Code behaves in a way the KB contradicts or is silent on where it matters. | Code added a payments provider the KB doesn't mention. |
| **Stale reference** | A KB entry points at a code path/API/dependency that moved or was removed. | KB cites `src/auth/jwt.ts`; file is now `src/auth/session.ts`. |

## Output

```markdown
# KB ↔ code sync — <YYYY-MM-DD>

## Summary
- 1 high, 2 medium, 1 low

## High
- [unimplemented] policy `no-direct-db-writes.md` — `src/jobs/import.ts` writes via raw client.
  → fix code, or amend the policy if the exception is intended.

## Medium
- [undocumented] `src/billing/stripe.ts` integrates Stripe; KB pricing entry is silent.
  → propose a KB note (with user approval).
- [stale] `auth.md` cites `src/auth/jwt.ts` (now `session.ts`).
  → update the reference.

## Low
- ...

## Proposals
1. Code change: add auth guard in `src/jobs/import.ts`.
2. KB edit (approval): note Stripe in the pricing/integrations entry.
3. KB edit (approval): fix path in `auth.md`.
```

Reconciliations land as **either** a KB edit (KB is human-authored — apply only with the user's go-ahead) **or** code work — never both silently. Surface the choice; let the user decide which side is wrong.

When a reconciliation *is* a KB edit (a new entry, or a fixed reference), follow the recommended metadata standard in `rules/kb-conventions.mdc` and the project's `knowledge/conventions.md` vocabulary — give a new entry honest `type`/`domain`/`summary`/`tags`, save it as `<id>.md` (filename == `id` so `"[[id]]"` resolves — resolution is by filename, not alias; §1.6), and wire its relations in frontmatter. When a target moves or is renamed, keep its filename matching its `id` and update inbound relation/`[[id]]` refs (not just body paths). Stale-reference findings include relation `[[id]]` refs that no longer resolve to a live entry's filename.

## Anti-patterns

- Editing the KB or the code from this skill without approval.
- Treating every undocumented behavior as a defect — some code is simply below the KB's altitude.
- Reporting findings with no proposed resolution.
