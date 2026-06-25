---
name: kb-sanitize
description: >-
  Heal the knowledge base from the inside. Use to find logical conflicts
  between active entries, legacy/orphaned remnants, and broken or obsolete
  links, then propose cleanups. Proposal-first; applies only what the user
  approves. Resolves the KB via .cursor/harness.json.
---

# KB sanitize

Keep the knowledge base coherent as it grows. A graph of linked Markdown drifts over time — entries contradict, get superseded but stay `active`, links rot, metadata falls out of step with the standard. This skill surveys the KB and proposes fixes; it does not rewrite entries until the user approves.

The recommended metadata standard it checks against — frontmatter schema, tagging, relations — lives in `rules/kb-conventions.mdc`; the project's controlled tag vocabulary (and any local field conventions) lives in the project's `knowledge/conventions.md`. Read both before the metadata checks so you propose *conformance*, not your own taste.

## Procedure

1. **Resolve the KB.** Read `.cursor/harness.json`; the KB is at `join(vault, knowledge.mount)` (path) or behind MCP. Operate over that store only — never touch memory or code.
2. **Load the conventions.** Read `rules/kb-conventions.mdc` (the generic standard) and the project's `knowledge/conventions.md` if present (its tag vocabulary + local fields). Absent the latter, fall back to the generic rules.
3. **Inventory.** List every entry; record each entry's **filename basename** and parse frontmatter (`status`, `updated`, `id`/`aliases`, `type`, `domain`, `tags`, relations); collect outbound links/wikilinks and relation targets. `[[id]]` resolves by filename (not alias — see `rules/kb-conventions.mdc` §1.6), so build the resolution map from filenames. Read the root `_index.md` if present.
4. **Run the checks below.**
5. **Report + propose.** Group findings; end with a numbered proposal list the user can approve in batch.
6. **Apply approved items only**, as ordinary KB edits. Never reorganize or rewrite unapproved.

## Checks

| Area | What to find |
| --- | --- |
| **Conflicts** | Two `active` entries that assert contradictory things. Propose a survivor (reconcile, or deprecate one and link forward). |
| **Legacy** | Entries that read as superseded but are still `status: active`; very stale `updated` with no current relevance; orphaned files nothing links to and `_index.md` doesn't list. |
| **Links** | Broken relative links / wikilinks; links pointing at `deprecated` entries (should point at the successor); missing reciprocal back-links between clearly related entries. |
| **Metadata** | Missing required floor (`status`/`updated`); recommended fields a reader clearly needs but the entry lacks (`id`/`aliases`, `type`, `domain`, `summary`) — propose, don't gate; `type`/`domain` that disagree with the entry's actual content; empty placeholder relation fields. |
| **Tags** | Tags off the project's controlled vocabulary (near-synonyms of a canonical tag); malformed tags (not `lowercase-kebab-case`); tags that merely restate a structured field (`type`/`domain`/`priority`/`severity`); counts well outside ~3–7; dead-context tags on non-historical entries. |
| **Relations** | Non-reciprocal `related` (A→B but not B→A) and broken reciprocal pairs (`supersedes`↔`superseded_by`, `implements`↔`implemented_by`) where the pairing is clearly mutual; relation refs not in `"[[id]]"` form; self-references; **dangling/phantom `[[id]]`** refs that resolve to no entry's filename (`<id>.md`). |
| **Filenames** | Entries whose **filename basename ≠ `id`** — this breaks `[[id]]` resolution (which is by filename, not alias; `rules/kb-conventions.mdc` §1.6). Propose renaming the file to `<id>.md` (and updating inbound `"[[id]]"` refs), or correcting the `id`. Also flag basename collisions between entries (ambiguous `[[id]]`). |
| **Deprecation** | A `deprecated` entry with a successor in the KB but no `superseded_by` forward link; `active` entries whose `related` points at a now-`deprecated` target that has a successor (repoint to the successor). |
| **Orientation** | `_index.md` missing entries that exist, or listing entries that were removed/renamed. |

For the metadata/tag/relation checks, apply the **judgment** in `rules/kb-conventions.mdc` §4: propose a relation/tag only when it is honest and high-signal, surface ambiguity for the human to settle, and never fabricate a link or coin a tag just to satisfy the schema.

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

## Metadata
- `pricing-v2.md` has no `type`/`summary`; content reads as a `specification`.
- `webhooks.md` carries empty `related: []` — drop the placeholder.

## Tags
- `auth.md` tags `login` (synonym of canonical `auth`) and `p0` (restates `priority`).

## Relations
- `auth.md` lists `related: ["[[sessions]]"]` but `sessions.md` doesn't link back.
- `old-auth.md` deprecated but missing `superseded_by → "[[auth]]"`.
- `oauth.md` relation `"[[oauth-flow]]"` is a phantom — no entry's filename resolves it.

## Filenames
- `billing.md` declares `id: payments` — basename ≠ id, so `"[[payments]]"` won't resolve.

## Orientation
- `_index.md` omits `compliance/gdpr.md`.

## Proposals
1. Deprecate `pricing-v1.md`, link → `pricing-v2.md`.
2. Deprecate `old-auth.md`, add `superseded_by → "[[auth]]"`.
3. Fix link in `onboarding.md`.
4. Add `type: specification` + a one-line `summary` to `pricing-v2.md`.
5. Replace `login` → `auth` and drop `p0` in `auth.md` tags.
6. Add reciprocal `related → "[[auth]]"` in `sessions.md`.
7. Resolve or remove the phantom `"[[oauth-flow]]"` ref in `oauth.md`.
8. Rename `billing.md` → `payments.md` (or set `id: billing`) so filename == id.
9. Add `compliance/gdpr.md` to `_index.md`.

Apply which? (e.g. "1,3,4" / "all" / "none")
```

## Anti-patterns

- Editing entries before the user approves.
- Inventing new structure/taxonomy under the guise of cleanup.
- Touching memory or code (that's out of scope — see `kb-code-sync`).
- Deleting an entry outright when deprecate-and-link preserves history.
- Treating the recommended metadata standard as a gate — an entry with only `status` + `updated` is valid; propose enrichment, don't fail it.
- Fabricating a relation or coining a tag to satisfy the schema instead of surfacing the ambiguity.
