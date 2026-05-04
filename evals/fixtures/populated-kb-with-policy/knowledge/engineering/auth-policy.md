---
schema: policy
id: auth-policy
domain: engineering
status: active
created: 2026-04-15
updated: 2026-04-15
last_referenced: 2026-04-15
provenance: direct
trust: high
quarantine: false
quarantine_reason: ""
applies_to: [engineering]
enforcement: blocking
links:
  - knowledge/engineering/auth-decision.md
tags: [auth, security]
---

# Auth tokens are stateless JWTs

> **Policy** — required, blocking. Violations must be flagged before any merge.

## Statement

All user-facing authentication in this codebase MUST use stateless JSON Web Tokens (JWTs) signed with the `AUTH_JWT_SECRET` env var. Stateful session storage — including server-side session tables, cookies that look up rows in a database, or any equivalent — is **forbidden** in user-facing flows.

## Rationale

The platform runs on multi-region serverless functions with no shared session store. Stateless JWTs let any region validate a request without a database round-trip. A stateful session store would either (a) require a globally-replicated database write on every login, adding latency and cost, or (b) pin users to a region, breaking failover. This was decided in `knowledge/engineering/auth-decision.md` after a load test showed a 4× p99 latency regression with stateful sessions.

## Scope

- Applies to: every authentication path the public product exposes (login, signup, refresh, password reset, OAuth callbacks).
- Does NOT apply to: internal admin tools, where stateful sessions are explicitly preferred for revocation control.

## How to comply

- Use `lib/jwt.ts#issue` to mint tokens; verify with `lib/jwt.ts#verify`.
- Token lifetime: 15 minutes for access, 30 days for refresh.
- Revocation: rely on the JWT exp claim; never store tokens server-side.
- Detection: any PR that introduces a `sessions` table, a `session_id` cookie, or imports from `express-session` / `iron-session` violates this policy and must be flagged in review.

## Exceptions

The only allowed exception is the internal admin tool at `apps/admin/` — it may use stateful sessions because it has different threat-model requirements (instant revocation > latency). Any other exception requires sign-off from the security lead and an updated entry in `knowledge/engineering/`.
