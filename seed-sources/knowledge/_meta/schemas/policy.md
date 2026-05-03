---
schema: policy
id: <kebab-case-id>
domain: <domain-slug>
status: draft
created: YYYY-MM-DD
updated: YYYY-MM-DD
applies_to: []        # roles, domains, or systems this policy binds
enforcement: advisory # advisory | required | blocking
links: []
tags: []
---

# <Policy name — what is required, e.g. "All KB writes use a schema">

> **Policy** — a rule that constrains future work. The harness should fail or warn when violated.

## Statement

One paragraph stating the rule unambiguously. Avoid hedging.

## Rationale

Why this rule exists. Reference the `decision` or `fieldnote` that motivated it.

## Scope

- Where it applies (which domains, files, processes).
- Where it explicitly does **not** apply.

## How to comply

- Concrete steps an agent or human takes to satisfy the policy.
- Detection / verification: how do we tell if it has been violated?

## Exceptions

List the only circumstances under which the policy may be relaxed, and the approval required.
