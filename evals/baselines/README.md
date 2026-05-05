# magik-repo eval baselines

A baseline is a locked-in result file from a clean run, copied here when a release ships. Future runs compare against the latest baseline; regressions become diffs in the next PR.

Baselines are tracked. Per-run results in `evals/results/` are gitignored (one JSON per run plus per-scenario transcripts) and rotate freely.

## Naming

```
v<plugin-version>__<agent-model>__<judge-model>.json
```

If the same release is baselined under multiple model configs, append a tag:

```
v0.4.1__gemini-3.1-pro__gemini-3.1-pro.json
v0.4.1__composer-2__claude-opus-4-6__strict.json
```

## v0.4.1 — gemini-3.1-pro on both sides

**Score: 41.7% mean (1 pass / 2 fail / 0 skip)**

First locked-in baseline. Captures the harness-as-shipped at v0.4.1 against the cheapest-and-most-accessible model configuration (`gemini-3.1-pro` on both sides, no params, no subscription gating).

The two failing scenarios are real product findings, not infrastructure bugs:

| Scenario | Score | Headline finding |
|---|---|---|
| 01-read-first-gate | 75% PASS | Agent surfaces policy *content* correctly and refuses the user's violation, but skips the *mechanical* `kb-search` / `Read` steps the rule prescribes. The harness's read-first language gets the spirit across but doesn't compel the protocol. |
| 02-propose-not-apply | 38% FAIL | Agent invokes `Read` but never actually reads `domains.md`; uses past tense in turn 1 ("I've set up", "Added") — claims apply without propose. `files_written: none` despite claiming edits. Hallucination problem. |
| 03-memory-write-discipline | 13% FAIL | Agent fast-paths writes directly to `knowledge/<domain>/` and `.cursor/rules/`, bypassing `memory/daily/` entirely. Uses `edit` instead of `Write`. The memory-staging contract isn't sticking. |

These are the right targets for the next iteration of the harness. Concretely:

- **Read-first gate**: tighten language so the *protocol* (run kb-search → cite slug → cross-reference) is non-negotiable, not just the conclusion.
- **Propose-not-apply**: the agent's tendency to use past-tense narration as a substitute for actual action needs an explicit rule clause.
- **Memory write discipline**: the staging-vs-fast-pathing distinction isn't surfacing. Probably needs a worked example in the rule and a stronger "MUST stage in memory/daily/ first" clause in the skill.

A subsequent release that lifts these scores by changing the harness payload is exactly what evals are for. A release that lifts them via a model bump (e.g. switching the agent default to `composer-2`) is also useful, but it's a different kind of signal — "the harness works under a stronger model" rather than "the harness is more robust."
