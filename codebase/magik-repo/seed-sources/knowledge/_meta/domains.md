# Domain registry

This file is the **single source of truth** for which domains and subdomains exist in this project. It is the spine that `knowledge/<domain>/` and `.cursor/skills/<domain>/` mirror.

> Edit this file via the `domain-registry` skill (plugin-distributed). Manual edits are allowed but should be reviewed by the `drift-scan` skill afterwards.

## Conventions

- `slug` is `kebab-case`, ASCII, no spaces. It is the folder name everywhere.
- A domain or subdomain only exists if it is listed here.
- Status: `active` | `deprecated` | `archived`.
- Subdomains are nested under their parent under `subdomains:`.
- A domain "earns" its folder once it has accumulated **≥ 3 durable artifacts** (KB entries, skills, or specs). Below that threshold it lives as a flat note inside its parent.
- A subdomain "earns" splitting from its parent under the same rule.

## Schema (per entry)

```yaml
- slug: <kebab-case>
  name: <Display name>
  status: active | deprecated | archived
  purpose: <one sentence — what this domain is responsible for>
  knowledge_path: knowledge/<slug>/        # may be empty until earned
  skills_path:    .cursor/skills/<slug>/   # may be empty until earned
  workspace_path: workspace/<slug>/        # optional, advisory only
  owner: <user or role, optional>
  created: YYYY-MM-DD
  updated: YYYY-MM-DD
  subdomains: []                           # same shape, recursively
```

## Registry

```yaml
project:
  name: TBD                # set during /audit first-time setup
  description: TBD
  created: TBD

domains: []                # populated as the project earns its domains
```

## Reference catalogue (not active — pick from when seeding)

These are common project domains. They are listed here as a *menu*, not as active domains. The `/audit` skill will offer them during first-time setup; only the ones you choose move into `domains:` above.

For each domain, see [`subdomain-catalogue.md`](./subdomain-catalogue.md) for the recommended subdomain breakdown (when the domain is mature enough to split).

- `engineering` — code, infrastructure, observability, reliability, security, testing. *(Subdomains: architecture, backend, frontend, data, infrastructure, observability, reliability, security, testing.)*
- `product` — product strategy, features, roadmap, user research. *(Subdomains: strategy, discovery, roadmap, features, analytics.)*
- `brand` — visual identity, voice, design tokens, brand assets. *(Subdomains: visual-identity, voice, design-system, guidelines.)*
- `marketing` — positioning, campaigns, content, SEO. *(Subdomains: positioning, content, campaigns, growth, analytics.)*
- `sales` — pipeline, ICP, playbooks, contracts. *(Subdomains: icp, pipeline, playbooks, contracts.)*
- `legal` — entity, IP, contracts, compliance, privacy. *(Subdomains: entity, ip, contracts, privacy, compliance.)*
- `finance` — accounting, fundraising, runway, pricing. *(Subdomains: accounting, pricing, fundraising, forecasting.)*
- `strategy` — north-star, OKRs, market analysis.
- `operations` — vendors, workflows, internal tooling.
- `support` — customer support patterns, SLAs.
- `research` — market & user research notes that inform multiple domains.

## Change log

Append entries here whenever the registry mutates. Format:

```
- 2026-05-02 | added domain "brand" (3 KB entries accumulated)
- 2026-05-09 | split subdomain "engineering/security" out of "engineering"
- 2026-06-01 | deprecated domain "operations" (merged into "engineering/infrastructure")
```
