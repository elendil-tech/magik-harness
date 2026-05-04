# Domain registry

This file is the **single source of truth** for which domains and subdomains exist in this project. It is the spine that `knowledge/<domain>/` and `.cursor/skills/<domain>/` mirror.

> Edit this file via the `domain-registry` skill (plugin-distributed). Manual edits are allowed but should be reviewed by the `drift-scan` skill afterwards.

## Conventions

- `slug` is `kebab-case`, ASCII, no spaces. It is the folder name everywhere.
- A domain or subdomain only exists if it is listed here.
- Status: `active` | `deprecated` | `archived`.
- A domain "earns" its folder once it has accumulated **≥ 3 durable artifacts** (KB entries, skills, or specs).

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

  - slug: product
    name: Product
    status: active
    purpose: Product specs, user research, roadmap decisions.
    knowledge_path: knowledge/product/
    skills_path: .cursor/skills/product/
    workspace_path: workspace/product/
    created: 2026-04-10
    updated: 2026-04-10
    subdomains: []
```
