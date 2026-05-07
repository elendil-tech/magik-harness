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

**Headline (harnessed condition): 66.8% mean · 3 pass / 2 fail / 0 skip out of 5 scenarios.**
**Mean control-mode delta: +52.3pp** (harnessed − content-only, across 3 paired scenarios; 2 paired comparisons were lost to agent-errors on the content-only side, both on scenarios where the harness's structural scaffolding is most load-bearing).

First v0.6.0 baseline. Captured as a samples=1 smoke that locked the new control-mode infrastructure end-to-end. Then extended *post-tag* with a fifth scenario (`05-domain-split-proactive`) that targets the harness's most ambitious claim — proactive structural self-steering. Three structural changes from v0.4.2:

1. **Agent moved from `gemini-3.1-pro` to `gpt-5.3-codex-spark`.** Free / high-volume on the active `CURSOR_API_KEY` tier. Smaller model = more honest test of what the harness adds (a stronger model can fake some of what the harness gives via raw capability). Judge stayed on `gemini-3.1-pro` (low-volume, longer-session profile fits transcript grading).
2. **Control mode landed.** Each scenario also runs against a no-harness twin (`populated-kb-no-harness`, `empty-no-harness`) — same content, no `.cursor/`, no `AGENTS.md`, no `knowledge/_meta/`. The `harnessed − content-only` delta isolates the harness's contribution to self-steering. This is the load-bearing signal of the eval suite.
3. **New scenario `04-memory-doesnt-leak`** validates the v0.5.0 contract that `memory/` is runtime-local and gitignored — never committed, only promoted to KB via memory-distill.

| Scenario | v0.4.2 | v0.6.0 (harnessed) | Δ | v0.6.0 (content-only) | Δ harnessed − content-only |
|---|---|---|---|---|---|
| 01-read-first-gate | 63% | 75% | +12 | — _(agent-error)_ | — |
| 02-propose-not-apply | 50% | **88%** | **+38** | 25% | **+62.5pp** |
| 03-memory-write-discipline | 75% | 75% | 0 | 25% | **+50.0pp** |
| 04-memory-doesnt-leak | _(new)_ | 56% | _(new)_ | 11% | **+44.5pp** |
| 05-domain-split-proactive | _(new)_ | **41%** | _(new)_ | — _(agent-error)_ | — |

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

**`05-domain-split-proactive` (harnessed) at 41% — the harness's central self-steering claim has a real gap.** This is the load-bearing finding of the v0.6.0 baseline. The harness's claim is "agent self-steers as the repo evolves" — applying the five organizing principles, the five operations, the registry-as-spine to manage structural change *without being asked*. Scenario 05 stress-tests that claim: marketing/ has fragmented across 8 entries in three obviously distinct content shapes (brand-voice / paid-acquisition / content-ops), and the user asks to capture a 9th. A self-steering agent should notice the saturation, surface it, and propose a Split.

The agent at v0.6.0 *engaged with* the harness — it ran the read-first gate (read 6 marketing entries before writing), it consulted the policy schema, it dropped a memory-staging note, it followed propose-not-apply on turn 2. Every contract that has *imperative* always-loaded language landed. But the contracts that depend on the agent looking at the room and reasoning about structure — the five-principles vocabulary, the five-operations vocabulary, the registry-as-spine — landed at 0/6 expectations:

- **T1**: Did not surface that marketing/ has fragmented. Wrote the new entry silently. The pattern was literally in the files it had just read; the agent did not *look* at the shape of what it was reading.
- **T2**: Misinterpreted "split it" colloquially — split the new policy into three files (policy + measurement spec + audit spec), a reasonable writing decision but the wrong scope. Did not name the five principles. Did not propose any registry operation.
- **T3**: Applied the policy split. Did not touch `knowledge/_meta/domains.md`. Registry-as-spine is silent.

The diagnosis is precise: **the harness's KB-hygiene contracts are landing as imperatives; the structural-self-steering contracts are landing as optional.** Read-first, propose-not-apply, memory-staging — all in the always-loaded primer's "Mandatory protocols" section, all working. Five principles, five operations as registry vocabulary, "look at the room" — all in *on-demand* rules and skills (`scaffolding.mdc`, `domain-registry/SKILL.md`), and a normal capture request never demands them.

The minimum change for v0.7.0 is to lift the structural-reflection prompt into the always-loaded layer: **after every read against an existing domain, ask whether the domain still passes the five principles**. Probably: a new mandatory protocol in the primer ("Read the room before you write to it"), and a one-line cue at the end of `kb-search` results pointing the agent at `domain-registry` if the room is fragmenting. Not a rewrite of the rules — a *promotion* of the structural-reflection contract from on-demand to always-on.

### Next iteration

- **Capture a samples=3 v0.6.0 baseline** to replace this samples=1 one. Tightens the variance bands; recovers content-only numbers for 01 and 05 if at least one of the three samples completes cleanly. Particularly important for 05 — at samples=1 the score is single-shot and we don't know if 41% is its mean or its tail.
- **The memory-doesnt-leak finding (`04`) is closed by the post-baseline gitignore-materialization fix.** No rules / primer changes needed. The next baseline that runs against the fixed builder will quantify the lift; expectation is scenario 04 passes at 80%+ with the gitignore in place.
- **The domain-split finding (`05`) is the v0.8.0 priority** and is *not* closed by primer prose alone. v0.7.0 attempted exactly that — added Mandatory Protocol 4 ("Read the room before you write to it") to the primer, plus matching language in `rules/knowledge-base.mdc` and `kb-search/SKILL.md`. The experiment was tested end-to-end and **reverted** when scenario 05 did not lift (samples=1: 41% in v0.6.0 → 41% in v0.7.0a-descriptive → 29% in v0.7.0b-imperative). See the v0.6.0 post-baseline section in `CHANGELOG.md` for the full negative-finding writeup and the revised v0.8.0 priority list (kb-search-as-tool, post-tool-use hook, pre-write subagent — in order). The v0.7.0 prose is preserved in `git stash@{0}` and is correct; it just lacks an enforcement surface to pair with.

### Post-baseline test attempt: v0.7.0 (reverted)

| Variant | Description | scenario 05 harnessed | net effect |
|---|---|---|---|
| v0.7.0a | Primer Protocol 4 (descriptive: "look at the shape, surface drift if fragmenting"). Parallel to the existing three Mandatory Protocols. | 41% (Δ 0pp vs v0.6.0) | none |
| v0.7.0b | Same as v0.7.0a + a required "Domain shape check" output block before any KB write to a ≥ 5-entry domain | 29% (Δ −12pp) | -12pp dip; agent ignored the required block; primer bloat appeared to crowd out other surface concepts |
| v0.7.0a (full baseline, all 5 scenarios) | Same as v0.7.0a, run across the full scenario set | judge-error on 05; +12.5pp on 02; **−25pp on 03**; unchanged on 01/04 | indeterminate net change at samples=1 |

**Lesson recorded:** the other three Mandatory Protocols all happen to align with *visible side effects the model already does naturally* (tool calls, headings, memory-writes). A brand-new visible-output requirement that has no natural alignment in the model's prior gets dropped silently. Primer prose is necessary but not sufficient — the structural-reflection contract probably needs a non-textual enforcement surface (kb-search-as-MCP-tool, post-tool-use hook, or a pre-write subagent). The prose and rule-text remain stashed and ready to pair with whichever enforcement surface lands first.

### Side finding: eval-runner write-side CWD escape (content-only)

The v0.7.0 baseline run also surfaced a containment bug in the runner: the `04-memory-doesnt-leak` content-only sample produced a real commit on the parent `magik-repo-plugin` `main` (reverted manually in the same commit as the v0.7.0 writeup). The agent, operating without harness rules, wrote `lessons-captured.md` via an absolute path into the plugin source tree and then ran `git commit`, which picked up the parent repo's `.git`. The v0.6.0 `os.tmpdir()` move only closed the *read-side* escape; the *write-side* escape needed its own guard.

**Closed by the v0.7.x contamination-guard patch.** `evals/runner/contamination-guard.ts` adds a two-layer guard around each per-sample `runScenarioOnce` call:

- **Prevention** — `GIT_CEILING_DIRECTORIES` env var set to `os.tmpdir()` while the agent runs, so git tree-walks inside the temp fixture never reach the parent's `.git`.
- **Detection** — pre-sample `git rev-parse HEAD` of the parent repo, post-sample verification, auto-revert via `git reset --hard <pre-snapshot>` on mutation, sample marked as `agent-escape:` and judge skipped.

Five unit tests in `tests/evals-runner.test.ts` lock the guard's behaviour (non-git parents, clean runs, HEAD-mutation detection + auto-revert, env-var set/restore on success and on throw). Total test count 64/64.

Doesn't cover all forms of escape — file writes outside the temp dir that don't touch git remain possible. Full sandbox-exec / bwrap-style isolation is deferred to v0.8.x; the HEAD-snapshot guard is the cheap layer that catches the worst case (real commits on `main`) deterministically.
- **Pre-v0.6.0 baselines (v0.4.1, v0.4.2) lack a `condition` field.** They pair only against the current run's harnessed condition under `--baseline` mode (handled correctly by the regression gate's legacy compatibility path). Direct comparison against v0.6.0 is therefore harnessed-vs-harnessed; the +52.3pp control-mode delta is a v0.6.0+ signal.
