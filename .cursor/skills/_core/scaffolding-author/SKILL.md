---
name: scaffolding-author
description: >-
  Author new skills (service / domain / task) and decide when to create a
  subagent. Selects skill type, picks placement under .cursor/skills/, fills
  the right template, and registers the new skill. Use when creating any new
  skill or when considering a subagent.
---

# Scaffolding author

Authors new agent scaffolding. Encodes the type/placement rules from `.cursor/rules/skills-organization.mdc` and the decision protocol from `.cursor/rules/scaffolding.mdc`.

## When to invoke

- User asks to create a new skill, command, or subagent.
- A `fieldnote` recurs and a deterministic procedure could prevent it.
- A repeated procedure has been observed ≥ 2 times.
- An external service is being introduced and has non-trivial connection / verification.

## Procedure

### 1. Decide: knowledge problem vs. scaffolding problem

If the gap is "we don't know what we want", it is a **knowledge** problem — defer to the `knowledge-base` skill (`concept` or `decision`). Don't write a skill on top of unsettled ground truth.

### 2. Decide: skill vs. subagent

- **Skill** — a deterministic procedure or guidance the main agent follows in-context.
- **Domain agent** (default subagent shape) — a specialist worker for a single project domain, inheriting that domain's skills, services, and KB. See `.cursor/rules/subagents.mdc`.
- **Non-domain subagent** — a cross-domain role (release-manager, researcher) with a measurable success signal. Rare.

A domain earns an agent when:
- ≥ 1 domain skill, ≥ 3 task skills, ≥ 1 service skill in active use, and recurring delegated work.

If you can't name a success signal, write a skill.

### 3. Decide: skill type

| Indicator | Type |
| --- | --- |
| It is about *using an external service*. | `service` |
| It is *high-level guidance for a project domain*. | `domain` |
| It is a *specific task* with stable inputs/outputs. | `task` |

### 4. Pick placement

| Type | Path |
| --- | --- |
| `service` | `.cursor/skills/services/<service>/SKILL.md` |
| `domain` | `.cursor/skills/<domain>/_domain/SKILL.md` |
| `task`   | `.cursor/skills/<domain>/<task>/SKILL.md` |

Confirm the domain exists in the registry. If not, defer to `domain-registry` first.

### 5. Pick a template

From `.cursor/skills/_templates/`:

- `service-skill.md`
- `domain-skill.md`
- `task-skill.md`

Copy to the chosen path and rename to `SKILL.md`. Replace placeholders.

### 6. Author

Mandatory frontmatter:

```yaml
---
name: <kebab-case>
description: >-
  <One sentence: what it does, when the agent should invoke it.>
---
```

Mandatory body:

| Section | All types |
| --- | --- |
| `# <Title>` | yes |
| `## When to invoke` | yes |
| `## Procedure` | yes |
| `## Verification` | yes (or "Anti-patterns") |

For `service` skills, the four canonical sections are required:

1. **Context** — what & when.
2. **Connection** — CLI / API / MCP, env vars, auth.
3. **Procedure** — status checks first, then mutating actions.
4. **Verification & error handling.**

### 7. Scripts (task skills, optional)

If determinism is improved by code, drop scripts under `<task>/scripts/`. Reference them from the procedure with relative paths.

### 8. Register

- For a domain skill: link from `knowledge/<domain>/_index.md` ("Active skills").
- For a service skill: add a row to `.cursor/skills/services/_index.md` (create if missing).
- For a task skill: link from the domain skill, if one exists.

### 9. Verify

Run `drift-scan --shallow` to confirm no new drift.

## Subagent path

### Domain agent (default)

When a domain meets the threshold:

1. Confirm with user — subagent creation is a structural change.
2. Copy `.cursor/skills/_templates/domain-agent.md` to `.cursor/agents/<domain>.md`.
3. Fill the template:
   - Inherit context: `knowledge/<domain>/`, `knowledge/_meta/` (read), `knowledge/_index.md` (read).
   - Inherit skills: every `SKILL.md` under `.cursor/skills/<domain>/`, plus listed services.
   - Workspace: read/write `workspace/<domain>/`.
   - Codebase access: read-only by default; only `engineering-agent` may write under `codebase/`.
   - Core skills: `domain-registry` and `knowledge-base` are **propose-only** for non-core agents.
4. Define the success signal (concrete; observable).
5. Define escalation: when this agent should hand back to the main agent (cross-domain work, structural changes, anything outside its domain).
6. Run `drift-scan` afterward.

### Non-domain subagent (exception)

Only justified when the role spans domains *and* has a measurable success signal *and* a skill is provably insufficient. Document the justification in the agent file.

1. Place at `.cursor/agents/<role>.md`.
2. State: role, tool surface, success signal, when to spawn, when to stop.
3. Cross-link any skills the subagent depends on.
4. Require explicit user confirmation.

## Anti-patterns

- Writing a skill before the underlying knowledge is in the KB.
- Top-level skills (anything outside `_core/`, `_templates/`, `services/`, or a domain folder).
- Service skills missing the four canonical sections.
- Skills > ~300 lines without splitting.
- Subagents with no nameable success signal.
