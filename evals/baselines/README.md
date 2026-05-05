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

## v0.4.2 — gemini-3.1-pro on both sides

**Score: 62.5% mean (1 pass / 2 fail / 0 skip)** — up from 41.7% on v0.4.1.

First eval-driven harness sharpening release. Three independent changes contributed to the lift:

1. **A bug in the eval runner.** Tool-name matching for `files_read` / `files_written` was case-sensitive (`"Write"`, `"Read"`) but the SDK reports lowercase aliases (`"edit"`, `"read"`). The runner saw `files_written: []` even when the agent had successfully invoked `edit` — making the v0.4.1 baseline misjudge "the agent hallucinated tool calls" when in fact it had invoked them. Fixed in `evals/runner/runner.ts` by normalizing tool names + broadening the alias set, and locked down by a new fixture-builder test.
2. **The fixture wasn't materializing the primer.** v0.4.1 fixtures copied `seeds/AGENTS.primer.md` to project root, but Cursor reads `AGENTS.md`. The harness primer (always-loaded contract) was effectively *not in scope* during eval runs — only the on-demand `.cursor/rules/` were. v0.4.2 wraps the primer in marker comments and writes `AGENTS.md` directly during fixture build. This is the single biggest reason for the lift on scenarios 02 and 03.
3. **The harness primer + rules got sharper language.** A new "Mandatory protocols (executable, not advisory)" section in the primer codifies tool-truthful narration, propose-then-apply, and memory-first capture as imperative protocols. `rules/scaffolding.mdc` and `rules/memory.mdc` gained matching anti-pattern sections. `rules/harness.mdc` adds an explicit clause forbidding hallucinated reads.

| Scenario | v0.4.1 | v0.4.2 | Δ | Notes |
|---|---|---|---|---|
| 01-read-first-gate | 75% | 63% | -12 | Run-to-run variance — turn 3 came back empty in this sample. Other samples scored 87.5%. The harness language is sound; this is sampling noise (samples=1). |
| 02-propose-not-apply | 38% | 50% | +12 | Agent now reads `domains.md` correctly and invokes `Read` (vs hallucinating in v0.4.1). Still applies in turn 1 instead of proposing — gemini-3.1-pro is unusually eager to act. The harness language is now explicit ("VERY FIRST output must begin with `## Proposed change`"); a stronger model (or `samples > 1`) is likely to lift this further. |
| 03-memory-write-discipline | 13% | 75% | **+62** | The biggest lift. Agent now genuinely stages signals in `memory/daily/` as they surface, uses correct tags, and explicitly avoids fast-pathing to `knowledge/`. Two minor expectation misses (timestamp/attribution) keep it from 100%. |

### What this baseline says about the harness vs. about the model

- **Scenario 03's lift (13% → 75%) is harness-attributable.** The memory-first protocol now lands. The same model, with the same scenario, with new harness language → completely different behavior.
- **Scenario 02's stuck behavior is model-attributable.** `gemini-3.1-pro` is hard to convince to *not* act in the first turn. The harness can keep tightening language, but the underlying tendency is a model trait. A future run with `composer-2` or `claude-opus-4-7` (when subscription-gating is sorted) will tell us what fraction of this is harness vs. model.
- **Scenario 01's variance shows we should run with `samples > 1`.** A single sample was scored 62.5% here and 87.5% in an immediately-prior run with the same fixture and model. `samples=2` or `samples=3` (averaged) would smooth this out at 2-3× the API cost. Tracked for the next iteration.

### Next iteration

- Add `samples=2` for scenarios with high observed variance (01).
- Add at least one more scenario that exercises drift-control / `harness-audit` invocation, since those are the framework-level skills least covered today.
- Run a `composer-2` agent baseline to disentangle harness improvements from model improvements.
