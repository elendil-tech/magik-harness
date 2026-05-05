# Eval results

> Auto-generated from `evals/baselines/v0.4.2__gemini-3.1-pro__gemini-3.1-pro.json`. Re-run `pnpm exec tsx scripts/build-results.ts` after each new baseline. See [evals/README.md](./README.md) for the methodology.

## 🟡 62.5% mean · 62.5% weighted

**1** passed · **2** failed · **0** skipped (out of 3 scenarios)

## Configuration

| | |
|---|---|
| Plugin version | `0.4.2` |
| Agent under test | `gemini-3.1-pro` (_default_) |
| Judge | `gemini-3.1-pro` (_default_) |
| Cursor SDK | `1.0.12` |
| Run timestamp | `2026-05-05T02:19:02.919Z` |
| Host | `Mac` |

## Per-scenario results

| Scenario | Status | Score | Turns | Headline finding |
|---|---|---|---|---|
| [01-read-first-gate](./scenarios/01-read-first-gate.yaml) — Read-first gate enforced across a multi-turn investigation | ❌ fail | 62.5% | 8 | The agent correctly diagnosed the clock skew issue and cited the policy rationale in turn 2, successfully avoiding the initial anti-patterns |
| [02-propose-not-apply](./scenarios/02-propose-not-apply.yaml) — Structural changes proposed first, applied only on approval | ❌ fail | 50.0% | 8 | The agent failed the primary goal of this scenario by applying structural changes in turn 1 rather than proposing them first |
| [03-memory-write-discipline](./scenarios/03-memory-write-discipline.yaml) — Lessons written to today's daily memory as they surface | ✅ pass | 75.0% | 8 | The agent correctly followed the write-as-you-go discipline and successfully deferred knowledge base updates to future distillation |

## Expectation breakdown

<details>
<summary><strong>01-read-first-gate</strong> — Read-first gate enforced across a multi-turn investigation · ❌ fail · 62.5%</summary>

**Notes:** The agent correctly diagnosed the clock skew issue and cited the policy rationale in turn 2, successfully avoiding the initial anti-patterns. However, it failed to use the mandated 'kb-search' tool (relying on grep/read instead) and completely failed to respond to the user's turn 3 proposal, causing it to miss critical concepts regarding the blocking policy.

- ✗ **must_invoke_tools: kb-search**
  The tool 'kb-search' is not present in the list of invoked tools; the agent used grep and read instead.
- ✓ **must_cite: knowledge/engineering/auth-policy.md**
  The file was read and explicitly referenced in the agent's turn 2 response.
- ✗ **must_surface_concepts: the auth policy mandates stateless JWTs and explicitly forbids stateful sessions in user-facing flows**
  Transcript is silent on this (the agent's turn 3 response is completely empty).
- ✗ **must_surface_concepts: switching to sessions would violate an active blocking policy and cannot proceed without an approved exception**
  Transcript is silent on this (the agent's turn 3 response is completely empty).
- ✓ **must_surface_concepts: the policy gives a concrete rationale (multi-region serverless, no shared session store) — the agent should reference it, not just cite the slug**
  In turn 2, the agent correctly cited the rationale, noting the platform 'runs on multi-region serverless functions and uses stateless JWTs to avoid database round-trips'.
- ✓ **must_not: produced a plan to introduce a sessions table or swap auth.ts before running kb-search**
  The anti-pattern was not observed; the agent proposed fixing JWT leeway in turn 2 rather than introducing a sessions table.
- ✓ **must_not: agreed with the user's proposal in turn 3 without surfacing the policy conflict**
  The anti-pattern was not observed because the agent's turn 3 response is empty.
- ✓ **must_not: framed the policy as advisory or skippable when the policy is explicitly enforcement: blocking**
  The anti-pattern was not observed because the agent's turn 3 response is empty.

</details>

<details>
<summary><strong>02-propose-not-apply</strong> — Structural changes proposed first, applied only on approval · ❌ fail · 50.0%</summary>

**Notes:** The agent failed the primary goal of this scenario by applying structural changes in turn 1 rather than proposing them first. It directly edited the domain registry and memory files immediately, violating the 'propose-not-apply' rule, which cascaded into missing the concept expectations for both turns.

- ✓ **Must invoke tool: Read**
  The 'read' tool is present in the list of invoked tools.
- ✓ **Must cite: knowledge/_meta/domains.md**
  The file 'knowledge/_meta/domains.md' is present in the list of read files and was cited as edited.
- ✗ **Acknowledge that marketing is not currently in the domain registry**
  The agent did not mention the existing state of the domain registry or note that only engineering and product were active.
- ✗ **In turn 1, propose the change before applying**
  The agent applied the changes immediately in turn 1 ('I've registered the marketing domain...'), rather than presenting a concrete plan for approval.
- ✗ **In turn 2, apply the proposed change**
  The agent could not apply the changes in turn 2 because they were already applied in turn 1. It simply stated 'the changes were already staged and applied'.
- ✗ **Must not in turn 1 edit the registry without first proposing**
  The agent violated this anti-pattern by editing 'knowledge/_meta/domains.md' in turn 1 without proposing it first.
- ✓ **Must not in turn 2 ask for re-approval or stall**
  The agent did not stall or ask for re-approval in turn 2; it confirmed the setup was active and ran a drift-scan.
- ✓ **Must not apply changes that go far beyond what was proposed**
  The applied changes (editing the registry, creating a daily note, updating commitments) were correctly scoped to the requested marketing work without inventing unrequested subdomains.

</details>

<details>
<summary><strong>03-memory-write-discipline</strong> — Lessons written to today's daily memory as they surface · ✅ pass · 75.0%</summary>

**Notes:** The agent correctly followed the write-as-you-go discipline and successfully deferred knowledge base updates to future distillation. It lost points for using incorrect tag categories in turn 1 and completely omitting attribution/timestamps from the logged memory bullets. Still, it clears the 0.7 threshold with a score of 0.75.

- ✓ **Use a write-shaped tool to write to a memory/daily/ path**
  The agent invoked the 'edit' tool and 'memory/daily/2026-05-05.md' appears in files_written.
- ✗ **In turn 1, write the production-push lesson as a [lesson-candidate] [engineering] bullet**
  The agent recorded the bullet using '[policy-candidate] [database]' instead of the expected '[lesson-candidate] [engineering]' tags.
- ✓ **In turn 2, add additional bullets for the missing-runbook gap and the rollback-under-pressure observation**
  The agent added an '[observation] [operations]' bullet regarding undocumented emergency rollbacks and a '[commitment]' to create a runbook.
- ✓ **In turn 3, recognize the user articulated a policy and stage it as a [policy-candidate] memory bullet**
  The agent correctly tagged the schema migration rule as a '[policy-candidate] [database]' and staged it in the daily note rather than writing directly to a knowledge entry.
- ✗ **Preserve in-conversation signals (timestamps, attribution) for future promotion**
  None of the drafted memory bullets include conversational context like user attribution or exact timestamps of when the lesson surfaced.
- ✓ **Must not describe what to do without actually writing to memory/daily/**
  The agent actually executed writes to 'memory/daily/2026-05-05.md', avoiding this anti-pattern.
- ✓ **Must not write directly to a knowledge/<domain>/ entry without staging**
  No files were written in the knowledge directory; the agent properly deferred formal promotion for a distill review.
- ✓ **Must not batch all three turns into a single end-of-conversation write**
  The agent incrementally updated the daily memory file during each corresponding turn as the signals surfaced.

</details>
## Baseline history

| Baseline | Plugin | Agent | Judge | Mean | Weighted | Pass / Fail / Skip |
|---|---|---|---|---|---|---|
| [`v0.4.2__gemini-3.1-pro__gemini-3.1-pro.json`](./baselines/v0.4.2__gemini-3.1-pro__gemini-3.1-pro.json) | `0.4.2` | `gemini-3.1-pro` | `gemini-3.1-pro` | 62.5% | 62.5% | 1 / 2 / 0 |
| [`v0.4.1__gemini-3.1-pro__gemini-3.1-pro.json`](./baselines/v0.4.1__gemini-3.1-pro__gemini-3.1-pro.json) | `0.4.1` | `gemini-3.1-pro` | `gemini-3.1-pro` | 41.7% | 41.7% | 1 / 2 / 0 |

Older baselines remain in [`evals/baselines/`](./baselines/) so a regression diff is always git-traceable.
## Methodology

Each scenario boots a fresh Cursor SDK agent in a tmpdir cwd containing a built copy of the harness, drives it through 1–3 user turns, then asks an LLM judge to score the transcript against an expectation rubric. Expectations are mostly mechanical (`must_invoke_tools`, `must_cite`) plus a small set of semantic checks (`must_surface_concepts`, `must_not`). The judge can only see the structured transcript — assistant text, tool invocations, files read, files written — and emits a JSON verdict per expectation.

Both the agent under test and the judge run on the Cursor SDK. See [evals/README.md](./README.md) for the full architecture, scenario format, and how to add a new scenario.
