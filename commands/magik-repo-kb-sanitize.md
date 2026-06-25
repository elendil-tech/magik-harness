---
name: magik-repo-kb-sanitize
description: Heal the knowledge base from the inside — find logical conflicts, legacy/orphaned entries, and broken or obsolete links, then propose cleanups. Read-only until you approve.
---

Look into the knowledge base itself and keep it coherent as it evolves. Knowledge and memory live in the external vault resolved via `.cursor/harness.json` — resolve the KB mount first, then operate on it.

Invoke the `kb-sanitize` skill and follow it strictly. It is **proposal-first**: it surveys the KB and produces a numbered cleanup list; it does not rewrite entries until you approve.

What it looks for:

- **Logical conflicts** — two `active` entries that contradict each other; pick the survivor or reconcile.
- **Legacy remnants** — entries that should be `deprecated`/removed, stale `updated` dates, orphaned files nothing links to.
- **Linking integrity** — broken relative links / wikilinks, links pointing at deprecated entries, missing back-links.
- **Metadata coherence** — conformance to the recommended standard (`rules/kb-conventions.mdc`): frontmatter shape, tag-vocabulary drift, relation reciprocity, dangling `[[id]]` refs, deprecated-without-forward-link. Proposed, not gated.
- **Orientation drift** — the `_index.md` map no longer reflects the KB's actual shape.

Output: a short report (Conflicts, Legacy, Links, Orientation) with concrete proposed edits. Apply only the proposals the user approves.
