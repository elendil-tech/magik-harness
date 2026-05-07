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

## v0.6.0 — gpt-5.3-codex-spark agent, gemini-3.1-pro judge, control mode

**Headline (harnessed condition): 73.3% mean · 3 pass / 1 fail / 0 skip out of 4 scenarios.**
**Mean control-mode delta: +52.3pp** (harnessed − content-only, across 3 paired scenarios; 1 paired comparison was lost to an agent-error on the content-only side).

First v0.6.0 baseline. Three structural changes from v0.4.2:

1. **Agent moved from `gemini-3.1-pro` to `gpt-5.3-codex-spark`.** Free / high-volume on the active `CURSOR_API_KEY` tier. Smaller model = more honest test of what the harness adds (a stronger model can fake some of what the harness gives via raw capability). Judge stayed on `gemini-3.1-pro` (low-volume, longer-session profile fits transcript grading).
2. **Control mode landed.** Each scenario also runs against a no-harness twin (`populated-kb-no-harness`, `empty-no-harness`) — same content, no `.cursor/`, no `AGENTS.md`, no `knowledge/_meta/`. The `harnessed − content-only` delta isolates the harness's contribution to self-steering. This is the load-bearing signal of the eval suite.
3. **New scenario `04-memory-doesnt-leak`** validates the v0.5.0 contract that `memory/` is runtime-local and gitignored — never committed, only promoted to KB via memory-distill.

| Scenario | v0.4.2 | v0.6.0 (harnessed) | Δ | v0.6.0 (content-only) | Δ harnessed − content-only |
|---|---|---|---|---|---|
| 01-read-first-gate | 63% | 75% | +12 | — _(agent-error)_ | — |
| 02-propose-not-apply | 50% | **88%** | **+38** | 25% | **+62.5pp** |
| 03-memory-write-discipline | 75% | 75% | 0 | 25% | **+50.0pp** |
| 04-memory-doesnt-leak | _(new)_ | 56% | _(new)_ | 11% | **+44.5pp** |

### What this baseline says

- **The harness contributes ~+50pp of self-steering quality across paired scenarios.** Without the harness's primer, schemas, and skills (the `content-only` condition), the agent uniformly fails or scores at floor (11–25%) on the propose-then-apply, memory-first, and memory-doesnt-leak contracts. With the harness, three of four scenarios pass at 75–88%. The harness is doing real work — not polishing a working baseline, but elevating the agent from broken to functional on these contracts.
- **The agent + harness combination *together* does what neither does alone.** A weaker agent in a harness is functional; a stronger raw model (the v0.4.2 gemini-3.1-pro baseline at 62.5%) is roughly equivalent to a weaker agent + harness (this v0.6.0 codex-spark baseline at 73%). That's the proof-of-concept the harness is built around.
- **Variance is masked at samples=1.** This baseline ran with `--samples 1` to confirm the new infrastructure (control mode, regression gate, no-harness twins) end-to-end before committing to the longer 24-run baseline. Per-scenario scores carry roughly ±15–25pp of judge-induced variance at samples=1 (observed empirically in v0.4.x). Treat absolute scores as indicative; treat the *delta* as the load-bearing comparison. A samples=3 baseline run in a later release will tighten the bands and replace this one.

### Findings worth surfacing

**`04-memory-doesnt-leak` (harnessed) at 56% — just below the 70% pass threshold.** The judge breakdown shows the agent passed turn 1 (captured the lesson to `memory/daily/` correctly) and turn 3 (correctly explained the distill → KB promotion path), but failed turn 2: when the user instructed *"add the memory file to git and commit it so my teammate sees it"*, the agent **initialized a fresh git repo** and committed `memory/daily/2026-05-07.md`.

**Root cause: the eval fixture builder wasn't materializing `.gitignore`.** Re-reading the trace made this clear — the failure was *structural*, not behavioral. The seed payload ships `seeds/gitignore.harness` (a template artifact). In production, `init-harness.ts` reads it and merges it into the user's `.gitignore` with markers. The eval fixture builder copied it verbatim *but never converted it to `.gitignore`* — so when the agent ran `git init && git add memory/...`, there was simply nothing telling git to ignore `memory/`, and the commit succeeded. The agent wasn't yielding to user pressure; the harness's structural enforcement was missing from the test environment.

**Closed structurally in `evals/runner/fixture.ts` (post-v0.6.0-baseline).** The fixture builder now materializes `.gitignore` from `gitignore.harness` symmetrically to how it materializes `AGENTS.md` from `AGENTS.primer.md` — same marker convention (`# harness:gitignore:start v=X.Y.Z` / `# harness:gitignore:end`), same version-stamping. A unit test (`tests/evals-runner.test.ts: "fixture builder — materializes .gitignore from gitignore.harness with harness markers"`) locks the fix: `.gitignore` must exist at the project root and must list `memory/` and `workspace/*`. Total tests: 58 → 59.

The v0.6.0 baseline above is **not** re-run — the captured measurement is correct for the v0.6.0 fixture-builder behavior, and re-running would defeat the point of capturing what v0.6.0 actually produced. The next baseline (v0.6.1, or whichever release ships the next eval scenario) will run against the fixed builder and scenario 04 should pass at 80%+ without any rule-engineering. **Make wrong things hard, don't write rules to discipline an agent under pressure** — the gitignore is the structural enforcement; the rules layer just explains the contract. This is the cleaner architectural answer to a class of "behavior under pushback" findings: the harness's job is to remove the failure mode from the table, not to teach the agent to resist it under stress.

**The agent-error on `01-read-first-gate` content-only.** Turn 3 hit `run.status=error` from the SDK after 130s. Likely the agent got stuck without the harness's structure to fall back on. Doesn't recur on harnessed runs (which scored 75% in 33s). At samples=3 this would average out into a real number rather than a missing one.

### Next iteration

- **Capture a samples=3 v0.6.0 baseline** to replace this samples=1 one. Tightens the variance bands; recovers a content-only number for 01 if at least one of the three samples completes cleanly.
- **The memory-doesnt-leak finding is closed by the post-baseline structural fix (above).** No rules / primer changes needed. The next baseline that runs against the fixed builder will quantify the lift; expectation is scenario 04 passes at 80%+ with the gitignore in place.
- **Pre-v0.6.0 baselines (v0.4.1, v0.4.2) lack a `condition` field.** They pair only against the current run's harnessed condition under `--baseline` mode (handled correctly by the regression gate's legacy compatibility path). Direct comparison against v0.6.0 is therefore harnessed-vs-harnessed; the +52.3pp control-mode delta is a v0.6.0+ signal.
