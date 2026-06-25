---
status: active
updated: 2026-01-01
---

# Knowledge base

This is the project's **ground truth** — foundational decisions, policies, specifications, and durable context. It is human-authored and git-tracked. Agents read it before substantive work and maintain it on request (`/magik-repo-kb-sanitize`, `/magik-repo-kb-code-sync`); they do not auto-populate it.

## How this KB is organized

> This `_index.md` is a soft orientation map for a fresh reader — keep it roughly current as the KB grows. It is not a registry or a contract; organize folders however suits the project, and navigate with your own search tools.

_Nothing here yet. Start adding entries and sketch the layout below._

<!-- Example:
## Areas
- `engineering/` — architecture decisions, policies, system specs.
- `product/` — requirements, pricing, roadmap context.
- `company/` — founder context, brand, positioning.
-->

## Conventions

- Markdown files, free-form folders.
- Light frontmatter on each entry: `status: active | deprecated` and `updated: <date>` — the only required floor.
- Recommended metadata (frontmatter schema, tagging, relations) and the judgment for applying it: see the harness rule `kb-conventions`. It's additive convention, not a gate.
- Cross-link related entries — the canonical relation graph lives in frontmatter (`related`, `supersedes`/`superseded_by`, …); body prose may also use relative links or `[[wikilinks]]`.
- When an entry is superseded, set `status: deprecated` and add `superseded_by` linking forward to the successor.

### This project's vocabulary

Maintain this project's controlled **tag vocabulary** (and any project-local field conventions, e.g. extra `type` values) in a `conventions.md` here. The harness rule ships the generic rules; this file owns the specifics. Start one once your tag set is worth pinning down.
