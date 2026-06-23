---
name: kb-sanitize
description: >-
  Heal the knowledge base from the inside. Use to find logical conflicts
  between active entries, legacy/orphaned remnants, and broken or obsolete
  links, then propose cleanups. Proposal-first; applies only what the user
  approves. Resolves the KB via .cursor/harness.json.
---

# KB sanitize

Keep the knowledge base coherent as it grows. A graph of linked Markdown drifts over time — entries contradict, get superseded but stay `active`, links rot. This skill surveys the KB and proposes fixes; it does not rewrite entries until the user approves.

## Procedure

1. **Resolve the KB.** Read `.cursor/harness.json`; the KB is at `join(vault, knowledge.mount)` (path) or behind MCP. Operate over that store only — never touch memory or code.
2. **Inventory.** List every entry; parse frontmatter (`status`, `updated`) and collect outbound links/wikilinks. Read the root `_index.md` if present.
3. **Run the checks below.**
4. **Report + propose.** Group findings; end with a numbered proposal list the user can approve in batch.
5. **Apply approved items only**, as ordinary KB edits. Never reorganize or rewrite unapproved.

## Checks

| Area | What to find |
| --- | --- |
| **Conflicts** | Two `active` entries that assert contradictory things. Propose a survivor (reconcile, or deprecate one and link forward). |
| **Legacy** | Entries that read as superseded but are still `status: active`; very stale `updated` with no current relevance; orphaned files nothing links to and `_index.md` doesn't list. |
| **Links** | Broken relative links / wikilinks; links pointing at `deprecated` entries (should point at the successor); missing reciprocal back-links between clearly related entries. |
| **Orientation** | `_index.md` missing entries that exist, or listing entries that were removed/renamed. |

## Output

```markdown
# KB sanitize — <YYYY-MM-DD>

## Conflicts
- `pricing-v1.md` vs `pricing-v2.md` both active and disagree on the free tier.
  → deprecate v1, link forward to v2.

## Legacy
- `old-auth.md` reads as superseded by `auth.md` but is still active.
  → set status: deprecated; add forward link.

## Links
- `onboarding.md` → `../product/tiers.md` is broken (file moved to `pricing.md`).

## Orientation
- `_index.md` omits `compliance/gdpr.md`.

## Proposals
1. Deprecate `pricing-v1.md`, link → `pricing-v2.md`.
2. Deprecate `old-auth.md`, link → `auth.md`.
3. Fix link in `onboarding.md`.
4. Add `compliance/gdpr.md` to `_index.md`.

Apply which? (e.g. "1,3,4" / "all" / "none")
```

## Anti-patterns

- Editing entries before the user approves.
- Inventing new structure/taxonomy under the guise of cleanup.
- Touching memory or code (that's out of scope — see `kb-code-sync`).
- Deleting an entry outright when deprecate-and-link preserves history.
