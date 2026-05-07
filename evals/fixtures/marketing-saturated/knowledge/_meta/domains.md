# Domain registry

This file is the **single source of truth** for which domains and subdomains exist in this project. It is the spine that `knowledge/<domain>/` and `.cursor/skills/<domain>/` mirror.

> Edit this file via the `domain-registry` skill (plugin-distributed). Manual edits are allowed but should be reviewed by the `drift-scan` skill afterwards.

## Conventions

- `slug` is `kebab-case`, ASCII, no spaces. It is the folder name everywhere.
- A domain or subdomain only exists if it is listed here.
- Status: `active` | `deprecated` | `archived`.
- Subdomains are nested under their parent under `subdomains:`.
- Structural change is **judged**, not counted. Every Add / Rename / Merge / Split / Deprecate proposal answers the five principles in `rules/scaffolding.mdc` (coherence, boundary, granularity, persistence, discoverability). The `domain-registry` skill owns the operations and produces the proposal.
- **Default for splits is subdomain** (children stay nested under the parent). Sibling-promotion (a child becomes a peer-level domain) only when the child has clearly outgrown the parent's frame.
- Cross-domain content goes through Pattern A (`applies_to:` + `links:` on a primary-owner entry) before Pattern B (project tag) before Pattern C (cross-cutting meta-domain like `compliance/`). C is rare and requires three preconditions — see `rules/knowledge-base.mdc`.

## Registry

```yaml
project:
  name: Lumera
  description: Direct-to-consumer wellness brand.
  created: 2026-02-10

domains:
  - slug: engineering
    name: Engineering
    status: active
    purpose: Backend, infrastructure, web/storefront, integrations.
    knowledge_path: knowledge/engineering/
    skills_path: .cursor/skills/engineering/
    workspace_path: workspace/engineering/
    created: 2026-02-10
    updated: 2026-03-01
    subdomains: []

  - slug: product
    name: Product
    status: active
    purpose: Product strategy, packaging, formulation decisions, roadmap.
    knowledge_path: knowledge/product/
    skills_path: .cursor/skills/product/
    workspace_path: workspace/product/
    created: 2026-02-10
    updated: 2026-02-10
    subdomains: []

  - slug: marketing
    name: Marketing
    status: active
    purpose: Brand, growth, content. Everything that gets the product seen, said, and sold.
    knowledge_path: knowledge/marketing/
    skills_path: .cursor/skills/marketing/
    workspace_path: workspace/marketing/
    created: 2026-02-15
    updated: 2026-04-22
    subdomains: []
```

## Change log

- 2026-02-10 | added domain "engineering" (initial setup; coherent boundary on the technical surface)
- 2026-02-10 | added domain "product" (clear separation from engineering; lifecycle distinct)
- 2026-02-15 | added domain "marketing" (initial brand work and first paid pilot; passed all five principles at the time)
