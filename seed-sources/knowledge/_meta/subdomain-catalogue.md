# Subdomain catalogue

A reference menu of subdomains for each top-level domain. **Not active state** — these are templates the `domain-registry` skill offers when proposing splits. A subdomain only appears in the live registry once it has earned it (≥ 3 durable artifacts under it).

For each top-level domain we document:

- **Recommended set** — the subdomains that, taken together, give *complete coverage* for a typical SaaS / business project.
- **Compression notes** — when smaller projects can fold one into another.
- **Rationale** — why these and not others.

---

## engineering — full SaaS coverage

The recommended set is organized by **surface** (where work lives) rather than by team chart. Nine subdomains, with explicit fold-ins for smaller projects.

### Recommended set

| Subdomain | What lives here | Earn it when… |
| --- | --- | --- |
| `architecture` | Cross-cutting system design, ADRs (`decision`s), patterns, integration boundaries, tech-choice rationales. | You have ≥ 3 ADRs, or two engineers disagree on "how should we…" recurringly. |
| `backend` | Server code, APIs, business logic, background jobs, queues. | The application has any server-side execution. (Almost always true for SaaS.) |
| `frontend` | Client code, UI patterns, state management, SSR/streaming, design-system implementation. | The product has a UI of its own (vs. CLI / API only). |
| `data` | Schema, migrations, ETL, warehousing, analytics pipelines, data contracts. | Schemas need versioning + migrations, or analytics is non-trivial. |
| `infrastructure` | IaC, cloud accounts, networking, environments, deployment, CDN, edge. | More than one environment exists, or deployment is more than `git push`. |
| `observability` | Logs, metrics, traces, dashboards, alerts. | You can no longer reproduce an incident from local logs alone. |
| `reliability` | SLOs, SLIs, error budgets, incident response, runbooks, on-call, post-mortems. | Customers depend on uptime; or one incident has happened. |
| `security` | Authn / authz, secrets management, vulnerability mgmt, compliance, threat models, dependency policy. | Almost always — start at least with auth + secrets policies. |
| `testing` | Test strategy, unit / integration / e2e / load / contract tests, fixtures, CI integration. | Any non-trivial codebase. |

### Compression notes (small / early projects)

Start with the minimum and split as content accumulates:

- Solo / pre-launch: **`architecture` + `backend` + `frontend` + `infrastructure` + `security`** (5).
- Add **`testing`** as soon as you have CI.
- Add **`observability`** the first time you can't reproduce a bug.
- Add **`reliability`** the first time you have an incident or commit to an SLO.
- Add **`data`** when migrations need a strategy.

Common fold-ins:
- `reliability` ⊂ `observability` until you have SLOs.
- `data` ⊂ `backend` until schemas/migrations get heavy.
- `release` (CI/CD, feature flags) ⊂ `infrastructure` unless release engineering becomes its own discipline.

### Optional further subdomains (split only if heavy)

- `release` — CI/CD, feature flags, rollouts, versioning.
- `performance` — perf budgets, profiling, optimization (often cross-cutting; consider a `concept` or `policy` instead).
- `mobile` — if the product has native mobile clients.
- `devex` — local environments, contributor tooling, codegen.
- `integration` — third-party APIs and webhooks (only when you integrate with many).

### Why this set (rationale A — by surface)

Three rationales were considered:

- **A — by surface** *(adopted)*. Each subdomain owns a layer where work and bugs live.
- **B — by lifecycle (build / run / verify)**. Cleaner conceptually but multiplies overlap (security spans build & run).
- **C — by org chart (SWE / Platform / Security / QA / Data)**. Maps to roles but feels heavy for solo / small teams.

**A** is adopted because it scales smoothly from one person to a team without renaming folders.

### Suggested first ADRs per subdomain

When you split out a subdomain, the harness will propose seeding 1–2 placeholder `decision` entries for the highest-impact choices. Examples:

- `architecture/` — `monorepo-vs-polyrepo`, `module-boundaries`.
- `backend/` — `runtime-and-framework`, `api-style` (REST/GraphQL/RPC).
- `frontend/` — `framework`, `state-management`, `rendering-strategy`.
- `data/` — `primary-datastore`, `migration-tool`.
- `infrastructure/` — `hosting-target`, `iac-tool`, `environments`.
- `observability/` — `logging-stack`, `tracing-stack`.
- `reliability/` — `slo-targets`, `oncall-policy`.
- `security/` — `auth-strategy`, `secrets-policy`.
- `testing/` — `test-pyramid-policy`, `e2e-tool`.

These are **suggestions only** — they appear as proposals in `/audit` and `domain-registry`.

---

## product — typical subdomains

| Subdomain | What lives here |
| --- | --- |
| `strategy` | Vision, north star, OKRs, prioritization framework. |
| `discovery` | User research, interviews, validation experiments. |
| `roadmap` | Roadmap entries, prioritized themes, release plans. |
| `features` | `specification`s for individual features (one per feature). |
| `analytics` | Product KPIs, event taxonomy, metric definitions. |

Compression: a small project starts with `strategy` + `features` and adds others as they earn it.

---

## brand — typical subdomains

| Subdomain | What lives here |
| --- | --- |
| `visual-identity` | Logo, color, typography, iconography. |
| `voice` | Tone, copy guidelines, messaging do/don'ts. |
| `design-system` | Tokens and component spec (overlaps with frontend implementation). |
| `guidelines` | Usage rules across surfaces (web, social, print, video). |

Compression: start as a flat `brand/` until the four sub-clusters have ≥ 3 entries each.

---

## marketing — typical subdomains

| Subdomain | What lives here |
| --- | --- |
| `positioning` | ICP, value prop, differentiation, messaging. |
| `content` | Blog, social, SEO, content calendar. |
| `campaigns` | Specific campaign plans + post-mortems. |
| `growth` | Paid acquisition, funnels, conversion experiments. |
| `analytics` | Marketing KPIs, attribution, channel performance. |

---

## sales — typical subdomains

| Subdomain | What lives here |
| --- | --- |
| `icp` | Segmentation, lead scoring, qualifying questions. |
| `pipeline` | Stage definitions, forecasting, CRM hygiene. |
| `playbooks` | Outreach scripts, demo flows, objection handling. |
| `contracts` | Sales-side contract templates (overlaps with `legal/contracts`). |

---

## legal — typical subdomains

| Subdomain | What lives here |
| --- | --- |
| `entity` | Corporate formation, governance, board minutes. |
| `ip` | Trademarks, copyright, patents, trade secrets. |
| `contracts` | Templates: NDAs, MSAs, DPAs, employment, vendor. |
| `privacy` | Privacy policy, ToS, cookie policy, GDPR/CCPA notes. |
| `compliance` | Industry-specific (SOC 2, HIPAA, PCI, etc.). |

---

## finance — typical subdomains

| Subdomain | What lives here |
| --- | --- |
| `accounting` | Books, taxes, AP/AR. |
| `pricing` | Pricing tiers, discounting policy, packaging. |
| `fundraising` | Cap table, term sheets, investor updates. |
| `forecasting` | Runway, burn, financial models. |

---

## How the catalogue is consumed

- `domain-registry` skill reads this file before proposing a split.
- `harness-audit` first-time-setup pass references it when offering domain choices.
- The user can edit this file freely; entries here are advisory, not enforced.
