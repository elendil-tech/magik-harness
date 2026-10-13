---
status: active
updated: {{TODAY}}
---

# Knowledge base

This is the project's **ground truth**: foundational decisions, policies, specifications and durable context. The agent reads it before substantive work and keeps it in sync with its work at the level `knowledge.autonomy` grants in {{POINTER}} (default `open`: maintained as work goes, surfacing only large or destructive restructurings; tighten to `ask` or `readonly` to gate every edit).

## How this KB is organized

> This `_index.md` is a soft orientation map for a fresh reader. Keep it roughly current as the KB grows so a newcomer can see each topic from above and tell where new entries belong. It is not a registry or a contract; organize folders however suits the project.

_Nothing here yet. Start adding entries and sketch the layout below._

<!-- Example:
## Areas
- `engineering/`: architecture decisions, policies, system specs.
- `product/`: requirements, pricing, roadmap context.
- `company/`: background, brand, positioning.
-->

## Conventions

- Markdown files, free-form folders.
- Light frontmatter on each entry: `status: active | deprecated` and `updated: <date>`. These two are the only required floor.
- Recommended metadata (frontmatter schema, tagging, relations) and the judgment for applying it: the `kb-conventions` skill. It is additive convention, not a gate.
- Cross-link related entries. The canonical relation graph lives in frontmatter (`related`, `supersedes` / `superseded_by`, ...); body prose may also use relative links or `[[wikilinks]]`.
- **Living surface vs. ledger.** State documents (`concept`, `specification`, `policy`) say what is true now; edit them in place. Decision records (`decision`, `fieldnote`) are an immutable ledger of what was chosen or observed and why; never rewrite them, supersede them. See `kb-conventions` section 4.6.
- When an entry is superseded, set `status: deprecated` and add `superseded_by` linking forward to the successor.

### This project's vocabulary

Keep the project's controlled **tag vocabulary** (and any project-local field conventions, such as extra `type` values) in a `conventions.md` next to this file. The harness ships the generic rules; this file owns the specifics. Start one once your tag set is worth pinning down.
