# magik-repo evals

Behavioral evals for the harness. Unit tests cover the *artifact* (manifests, version stamps, seed payload, hook contracts). Evals cover the *product* — does an AI agent operating inside a harnessed repo actually follow the rules?

## Why

The harness is, fundamentally, an AI-instruction artifact. A perfectly clean release where every test passes can still:

- Stop following the read-first gate (a wording change made `kb-search` feel optional).
- Apply structural changes silently instead of proposing them.
- Lose memory write discipline.
- Cave when a friendly user proposes something the active policy forbids.

Nothing in `pnpm test` detects any of this. Nothing detects when a Cursor model upgrade or a change to Cursor's internal harness shifts agent behavior in a harnessed repo. **Evals are the only signal we have for "did the harness still work?" across these axes.**

## Architecture

```
evals/
├── README.md                                  # this file
├── scenarios/                                 # one YAML per behavioral contract
│   ├── 01-read-first-gate.yaml
│   ├── 02-propose-not-apply.yaml
│   ├── 03-memory-write-discipline.yaml
│   └── 04-memory-doesnt-leak.yaml             # v0.5.0: memory is git-ignored, only promoted
├── fixtures/                                  # scenario-specific overlays
│   ├── populated-kb-with-policy/              # harnessed
│   ├── populated-kb-no-harness/               # content-only twin (no .cursor/, no AGENTS.md)
│   ├── empty-harnessed-with-domains/          # harnessed
│   └── empty-no-harness/                      # bare twin
├── runner/
│   ├── cli.ts                                 # `pnpm eval` entry
│   ├── scenario.ts                            # YAML → zod-validated Scenario
│   ├── fixture.ts                             # seed harness + overlay → tmp project
│   ├── runner.ts                              # @cursor/sdk Agent.create + multi-turn stream
│   ├── judge.ts                               # @cursor/sdk Agent.prompt LLM-as-judge
│   ├── report.ts                              # aggregator + result writer
│   ├── regression.ts                          # baseline diff + 15pp regression gate
│   ├── types.ts                               # shared zod schemas + types
│   └── prompts/
│       └── judge-system.md
├── results/                                   # gitignored; one JSON per run
└── baselines/                                 # tracked; "last known good" runs
```

A run is: pick scenarios → for each, build a fresh agent cwd (seeds + plugin content + fixture overlay) → drive a multi-turn Cursor SDK session → capture transcript → ask the judge → aggregate → write JSON. Both the agent under test and the judge run on the **Cursor SDK** — one credential, one dep, one model catalog.

## Scenario format

Every scenario is a YAML file under `scenarios/` with a strictly-validated shape (see `runner/types.ts` for the zod schema). Long sessions are the preferred shape — a one-shot question lets the agent get away with vagueness; a real conversation forces it to commit to a plan and either hold the line or fold.

```yaml
id: 01-read-first-gate
title: Read-first gate enforced across a multi-turn investigation
description: |
  When the user starts an investigation that touches an active KB
  policy, the agent must run kb-search early, cite the policy, and
  push back when the user proposes a change that would violate it.

fixture: populated-kb-with-policy

# One user message per turn. The runner sends them in order through a
# single Agent.create() session, accumulating context like a real
# Cursor conversation.
turns:
  - "We have an auth issue — JWT verification fails for some users…"
  - "OK what's your read? Walk me through what you'd change and why."
  - "Honestly the simplest fix would be to drop JWT and use sessions…"

expectations:
  must_invoke_tools:
    - "kb-search"
  must_cite:
    - "knowledge/engineering/auth-policy.md"
  must_surface_concepts:
    - "the policy mandates stateless JWTs and forbids sessions in user-facing flows"
    - "in turn 3, holding the line on the policy when the user proposes a violation"
  must_not:
    - "produced a refactor plan before running kb-search"
    - "agreed with the user's session proposal in turn 3 without surfacing the policy"

weight: 1.0
pass_threshold: 0.7
samples: 1
timeout_ms: 720000   # total wall-clock for the whole multi-turn sample
```

The runner asserts mechanically: did the named tool appear in the transcript? Was the named entry path read? The judge handles the semantic stuff: did the agent *hold the line* across turns, did it *propose-then-apply*, etc.

## Fixture format

A fixture is a directory of files that get *overlaid* on top of a fresh seed payload. The runner does:

1. Copy `seeds/` to a tmp dir → harnessed project.
2. Copy `rules/`, `skills/`, `commands/` into `.cursor/{rules,skills,commands}/` → plugin-distributed content (in production this comes from `~/.cursor/plugins/local/magik-repo/`).
3. Copy `evals/fixtures/<name>/` on top → scenario-specific state (populated KB entries, pre-seeded registry, existing memory notes, etc.).

An empty fixture directory is valid — that means "fresh harness, no extra state".

### No-harness fixtures (control twins)

A fixture may declare `{"harness": false}` in a `.fixture.json` file in its root. When set, the runner skips steps 1 and 2 entirely — no `seeds/`, no `AGENTS.md`, no `.cursor/{rules,skills,commands}/`. The fixture's contents are copied verbatim as the project root.

These no-harness fixtures pair with harnessed twins via the scenario's `control_fixture:` field. Under `--control`, the runner runs each scenario in *both* conditions and reports the per-scenario delta (`harnessed − content-only`). Holding the *content* constant across both conditions and varying only *the system around it* isolates what the harness contributes — its organization, retrieval skills, primer, and rules — from what the model can do given raw markdown.

Today's twins:

- `populated-kb-with-policy/` ↔ `populated-kb-no-harness/` — same auth-policy content; the no-harness twin flattens it into a `docs/` folder with no schemas, no registry, no `_index.md`.
- `empty-harnessed-with-domains/` ↔ `empty-no-harness/` — the empty fixture's only state is a populated domain registry, which is itself a harness concept; the no-harness twin is a bare project with a README.

Built fixtures land under `os.tmpdir()/magik-repo-evals/` rather than `evals/.tmp/` — outside the plugin source tree on purpose, so an agent doing broad `glob`/`grep` from its CWD can't accidentally find the source `evals/fixtures/` and contaminate the run by reading from the harnessed twin.

### Contamination guard (v0.7.x)

The `os.tmpdir()` move closes the *read-side* CWD escape. A separate two-layer guard in `evals/runner/contamination-guard.ts` closes the *write-side* escape — the case where an agent absolute-pathed a write into the plugin source tree and `git commit` picked up the parent repo's `.git`, landing a real commit on `main`. (This actually happened during the v0.7.0 baseline run; commit `42944ce` was reverted manually and the patch was authored same-day.)

- **Prevention** — every sample runs inside `withGitCeiling(os.tmpdir(), ...)`, which sets `GIT_CEILING_DIRECTORIES` for the duration of the agent run. Git's `.git` ancestor walk stops at the OS tmp-dir boundary, so an agent that accidentally `cd`s above its temp fixture cannot find the parent repo's `.git`. Restored to its prior value (or unset state) even on throw.
- **Detection + auto-revert** — `snapshotParentRepo(PLUGIN_ROOT)` reads `git rev-parse HEAD` of the parent before each sample. After the sample, `verifyAndRevert` reads HEAD again. If it changed, the agent escaped CWD explicitly and committed to the parent — the guard runs `git reset --hard <pre-snapshot>`, prints a loud `⚠ CONTAMINATION` block to stderr, and marks the sample as `agent-escape:` (judge automatically skipped). The transcript is preserved for debugging.

Doesn't cover non-git escape (file writes outside the temp dir that don't touch git). Full sandbox-exec / bwrap-style isolation is deferred to v0.8.x; the HEAD-snapshot guard is the cheap layer that catches the worst case deterministically.

## Running

### Prerequisites

Copy the example file and fill in the key:

```bash
cp .env.example .env
# edit .env, set CURSOR_API_KEY=...
```

`.env` is gitignored. The CLI loads it automatically; you don't need a shell `export`.

### Commands

```bash
pnpm eval --list                                  # show all scenarios; no API calls
pnpm eval --dry-run                               # validate scenarios + fixtures; no API calls
pnpm eval                                         # run all scenarios end-to-end
pnpm eval --only 01-read-first-gate
pnpm eval --keep                                  # keep tmp fixture dirs for debugging
pnpm eval --samples 1                             # override every scenario's `samples:` for this run

# Control mode — run each scenario harnessed AND content-only;
# report the per-scenario delta (= what the harness contributed).
# Doubles cost and runtime; use when you want to measure the harness's
# contribution to self-steering (rather than just whether the harnessed
# agent passed in absolute terms).
pnpm eval --control

# Compare against a baseline. Always prints the comparison table; exits
# code 3 if any scenario regressed beyond 15pp without --accept-regression.
pnpm eval --baseline evals/baselines/v0.6.0__gpt-5.3-codex-spark__gemini-3.1-pro.json

# Cross-family portability check — same scenarios on a different agent.
pnpm eval --agent-model gemini-3.1-pro

# Push codex-spark harder on a single contract.
pnpm eval --agent-model gpt-5.3-codex-spark \
          --agent-params "reasoning=high" \
          --only 01-read-first-gate

# Spot-check the judge with a different family.
pnpm eval --judge-model claude-opus-4-6 \
          --judge-params "thinking=true,context=1m,effort=high,fast=false"
```

### Models

| Surface | Default | Override |
|---|---|---|
| Agent under test | `gpt-5.3-codex-spark` | `--agent-model` / `EVAL_AGENT_MODEL` |
| Agent params | (none) | `--agent-params "k=v,k2=v2"` / `EVAL_AGENT_PARAMS` |
| Judge model | `gemini-3.1-pro` | `--judge-model` / `EVAL_JUDGE_MODEL` |
| Judge params | (none) | `--judge-params "k=v,k2=v2"` / `EVAL_JUDGE_PARAMS` |

`--agent-params` and `--judge-params` accept a CSV of `id=value` pairs that mirror the Cursor SDK's `ModelParameterValue` shape directly — same vocabulary as the SDK + the `inspect-models` script. Each model has its own knobs (Anthropic uses `thinking`, `context`, `effort`; OpenAI Codex uses `reasoning`, optionally `fast`; Gemini has none; etc.); see the discovery section below.

**Why this split:** the agent under test runs many turns × samples × scenarios — a volume profile. The judge is a single transcript-grading call per sample with a longer prompt — a low-volume profile. We pair them to match the account economics:

- **Agent → `gpt-5.3-codex-spark`.** Free / high-volume on the active `CURSOR_API_KEY` tier. The agent is *the thing being measured*, so a smaller, free model is actually a more honest test of what the harness contributes (a stronger model can fake some of what the harness gives via raw capability). Cost-free agent runs unlock `samples=3+`, broader scenario coverage, and per-PR runs without budget pressure.
- **Judge → `gemini-3.1-pro`.** Strong reasoning, no subscription-tier gating, well-suited to "low-volume, longer-session" grading. Pairing different model families on the two surfaces also reduces self-grading bias (a Gemini judge has no incentive to cover for Codex idiosyncrasies).
- **Cross-family agent runs are one flag away.** `--agent-model gemini-3.1-pro` (or `EVAL_AGENT_MODEL=gemini-3.1-pro pnpm eval`) gives you a portability check across the same scenario set — a different but valuable question: "does the harness lift one family but not another?"
- **Cross-family judge runs are one flag away too.** `--judge-model claude-opus-4-6 --judge-params "thinking=true,context=1m,effort=high,fast=false"` swaps the grader. Worth doing periodically to spot-check that the gemini judge isn't drifting.

**Max mode is intentionally NOT the default for any tier.** When you do reach for an effort knob (e.g. on Anthropic models), use `effort=high` or `effort=xhigh`, never `effort=max`. Max mode trades latency and predictability for marginal capability gains that don't pay off for grading rubrics like ours. For codex-spark specifically, `reasoning=medium` (the SDK default) is a sensible starting point; bump to `reasoning=high` only if a contract has shown to need it.

### Inspecting available models

```bash
pnpm exec tsx scripts/inspect-models.ts          # full catalog
pnpm exec tsx scripts/inspect-models.ts opus     # filter by id substring
```

…lists every model + variant + parameter the active `CURSOR_API_KEY` can see. The bootstrap module loads `.env` automatically — no `--env-file` flag needed. Useful when picking judge params or debugging a model that returns `status=error` immediately (likely a subscription-tier gating).

## Results and baselines

Every run writes `evals/results/<UTC>__<agent>__<judge>.json` (gitignored). The file contains:

- `meta`: timestamp, plugin version, agent model + params, judge model + params, Cursor SDK version, host.
- `scenarios[]`: per-scenario verdict, mean score across samples, judge response per sample.
- `summary`: total / passed / failed / skipped, mean and weighted score.

The model + params are stored in the SDK's verbatim shape so you can paste them back into the CLI without translation.

When a release ships, copy the latest result into `evals/baselines/<version>__<agent>__<judge>.json`. Future runs compare against the baseline via `--baseline <path>`; per-scenario regressions beyond a 15pp tolerance fail the run (exit code 3) unless `--accept-regression` is also passed.

The 15pp tolerance is deliberately generous and fixed for now. With `samples: 3`, a derived per-scenario tolerance (`2.5 × score_stddev`) would itself be too noisy — three points is not enough to estimate stddev stably. We'll switch to a derived tolerance after enough baselines accumulate per scenario; see the comment block at the top of `evals/runner/regression.ts` for the rationale and the criteria for the switch.

### What the regression report shows

For each `(scenario_id, condition)` pair found in either the baseline or the current run, the gate prints:

- `OK` — within tolerance, current ≥ baseline (or improved).
- `DIP` — current < baseline but within tolerance. Worth noting; not a failure.
- `REGRESS` — current dropped more than the tolerance. Fails the run (exit 3) unless `--accept-regression`.
- `NEW` — present in the current run, not in the baseline (a newly-added scenario or condition). Never a regression.
- `MISSING` — present in the baseline, absent from the current run (a removed/disabled scenario). Never a regression.

The table sorts by `scenario_id`, with `harnessed` before `content-only` for each id. Pre-v0.6.0 baselines without a `condition` field are treated as `harnessed`-only and pair only against the current run's harnessed condition.

## Costs and discipline

- A scenario sample is one multi-turn agent session + one judge call. Plan for **roughly 1–3 minutes per scenario** with the default models (codex-spark agent, gemini judge); longer with stronger reasoning levels.
- **Default cost profile is near-zero**: agent runs land on the free codex-spark tier; only the judge call consumes paid quota, and judging is one short call per sample. A full default run (3 scenarios × 1 sample) is currently a handful of cents at most. Bumping `samples` to 3 ≈ triples the judge spend, still cheap.
- This makes it sustainable to run evals **frequently** — per-PR or per-meaningful-change, not just at release. Use `--baseline` to keep CI honest.
- If you switch the agent to `gemini-3.1-pro` (cross-family check) or to a paid Anthropic model, expect **dollar-scale spend per full run** depending on samples × scenarios. Reach for that deliberately, not by default.
- Evals are **not** in `pnpm test`. They run on demand via `pnpm eval`. The deterministic test suite (`pnpm test`) catches "I broke the artifact"; evals catch "the artifact is intact but the behavior degraded." Both stay valuable. Don't conflate them.
- Eval failures are signal, not noise. If a scenario regresses without a corresponding rule / skill change, that's the harness telling you a model or Cursor-internal change shifted behavior.

## Adding a scenario

1. Pick the contract you want to lock down (a rule clause, a skill behavior).
2. Author `evals/scenarios/<NN>-<id>.yaml` against the schema. Prefer multi-turn shapes that put real conversational pressure on the contract.
3. Build a fixture overlay under `evals/fixtures/<name>/` with the minimum state needed.
4. `pnpm eval --dry-run --only <NN>-<id>` to validate wiring.
5. `pnpm eval --only <NN>-<id>` to run live.
6. Iterate on the rubric until the verdict is consistent across 2–3 sample runs.

A good scenario is **specific** (one contract, not five), **measurable** (mostly mechanical expectations), and **realistic** (the task is something a real user would type). Multi-turn scenarios that include user pushback or follow-ups give the strongest signal.

### A note on `samples`

Default is `samples: 3` — not 1. Single-run scoring carries ~±25pp of judge-induced variance (observed empirically in v0.4.x baselines, where the same scenario scored 62.5% on one run and 87.5% on the next). With 3 samples:

- The standard error of the reported mean drops by roughly `√3`.
- Each scenario's `score_min` / `score_max` band — printed in the summary line and stored on disk — surfaces that variance directly. Any "improvement" claim has to move both bounds, not just the mean.
- The new `pass_rate` field tells you "2/3 samples individually passed", which is often a more honest read than the mean-thresholded verdict.

Bump higher (`samples: 5`) for scenarios that prove especially noisy, lower (`samples: 1`) only when iterating locally on a fresh scenario before committing it.
