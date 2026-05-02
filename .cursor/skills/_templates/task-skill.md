---
name: <task-name>
description: >-
  Deterministic procedure for <task>. Use when <concrete trigger> — describe
  the situation that should automatically pull this skill in.
---

# <Task title>

> **Task skill.** A function-shaped procedure: clear inputs, deterministic steps, verifiable output.

## Inputs

- `input_a` — type, source, constraints.
- `input_b` — …

## Outputs

- What is produced and where it lands (path under `workspace/`, `codebase/`, or a KB write).

## Preconditions

- State that must be true before starting (env vars, prior decisions, registry state).

## Procedure

1. **Validate inputs.** Reject early with a clear message if missing.
2. **Load context.** Read relevant KB entries (list paths).
3. **Execute step.** Concrete commands / tool calls. Reference any helper script: `./scripts/<name>.sh`.
4. **Execute step.** …
5. **Persist output.** Where it goes; how it's named.

If the steps include scripts, place them under `<task>/scripts/`.

## Verification

- How to confirm success (exit code, file existence, regex match in output, KB entry created).
- A failed verification should point at the most likely root cause.

## Failure modes

| Failure | Cause | Recovery |
| --- | --- | --- |
| <symptom> | <cause> | <fix> |

## Linked KB

- `knowledge/<domain>/<entry>.md` — the decision / policy / spec this task implements.

## Anti-patterns

- Using this skill outside its declared inputs.
- Skipping verification.
