---
name: <service-name>
description: >-
  Use when working with <Service> — describe trigger conditions: which actions,
  which configurations, which error patterns warrant invoking this skill.
---

# <Service> — service skill

> **Service skill.** Stable structure: Context → Connection → Procedure → Verification.

## 1. Context

- **What it is.** One paragraph.
- **What we use it for in this project.** Tie to a domain.
- **When to reach for it.** Concrete trigger phrases / situations.
- **Cost / quotas / limits worth knowing up front.**

## 2. Connection

### Auth

- Required env vars: `<SERVICE>_API_KEY`, `<SERVICE>_PROJECT_ID`, …
- Where they live (locally, in CI, in `vercel env`, etc.).
- Scopes / roles required.

### CLI

```bash
<service> --version
<service> auth status
```

### API

- Base URL.
- Versioning notes.
- SDK package(s) we use: `@org/sdk`.

### MCP (if applicable)

- Server identifier, tool prefix, available tools.

## 3. Procedure

### 3.1 Status checks (always run first)

```bash
<service> status
```

What "healthy" looks like.

### 3.2 Common actions

For each action:

- **What it does.** One line.
- **Command / call.**
- **Inputs / outputs.**
- **Idempotency / retry behavior.**

### 3.3 Mutating actions (be careful)

Mark destructive operations clearly. Require user confirmation in skill output.

## 4. Verification & error handling

- After every mutating action, verify: <how>.
- Common errors and recovery:

| Error | Likely cause | Recovery |
| --- | --- | --- |
| `401` | bad / expired key | rotate, re-auth |
| `429` | rate limit | exponential backoff |
| … | … | … |

## Anti-patterns

- Calling the production API with test data.
- Skipping status checks.
- Hardcoding secrets in code or skills.

## Linked KB

- `knowledge/<domain>/<related-decision>.md`
- `knowledge/<domain>/<related-policy>.md`
