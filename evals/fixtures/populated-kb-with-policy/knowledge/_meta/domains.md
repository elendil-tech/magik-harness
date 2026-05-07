# Domain registry

This file is the **single source of truth** for which domains and subdomains exist in this project. It is the spine that `knowledge/<domain>/` and `.cursor/skills/<domain>/` mirror.

> Edit this file via the `domain-registry` skill (plugin-distributed). Manual edits are allowed but should be reviewed by the `drift-scan` skill afterwards.

## Conventions

- `slug` is `kebab-case`, ASCII, no spaces. It is the folder name everywhere.
- A domain or subdomain only exists if it is listed here.
- Status: `active` | `deprecated` | `archived`.
- Subdomains are nested under their parent under `subdomains:`.
- Structural change is **judged**, not counted. Every Add / Rename / Merge / Split / Deprecate proposal answers the five principles in `rules/scaffolding.mdc`. The `domain-registry` skill owns the operations.
- **Default for splits is subdomain** (children stay nested under the parent). Sibling-promotion only when the child has clearly outgrown the parent's frame.

## Registry

```yaml
project:
  name: AcmeAuth
  description: Internal auth service for Acme Corp's product suite.
  created: 2026-04-01

domains:
  - slug: engineering
    name: Engineering
    status: active
    purpose: Backend services, infrastructure, schemas, and security policies.
    knowledge_path: knowledge/engineering/
    skills_path: .cursor/skills/engineering/
    workspace_path: workspace/engineering/
    created: 2026-04-01
    updated: 2026-04-15
    subdomains: []
```
