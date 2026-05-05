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
│   └── 03-memory-write-discipline.yaml
├── fixtures/                                  # scenario-specific overlays
│   ├── populated-kb-with-policy/
│   └── empty-harnessed-with-domains/
├── runner/
│   ├── cli.ts                                 # `pnpm eval` entry
│   ├── scenario.ts                            # YAML → zod-validated Scenario
│   ├── fixture.ts                             # seed harness + overlay → tmp project
│   ├── runner.ts                              # @cursor/sdk Agent.create + multi-turn stream
│   ├── judge.ts                               # @cursor/sdk Agent.prompt LLM-as-judge
│   ├── report.ts                              # aggregator + result writer
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
pnpm eval --list                          # show all scenarios; no API calls
pnpm eval --dry-run                       # validate scenarios + fixtures; no API calls
pnpm eval                                 # run all scenarios end-to-end
pnpm eval --only 01-read-first-gate
pnpm eval --keep                          # keep tmp fixture dirs for debugging
pnpm eval --agent-model composer-2 \
          --judge-model claude-opus-4-7 \
          --judge-effort xhigh
pnpm eval --judge-no-thinking             # disable judge extended thinking
```

### Models

| Surface | Default | Override |
|---|---|---|
| Agent under test | `composer-2` | `--agent-model` / `EVAL_AGENT_MODEL` |
| Judge model | `claude-opus-4-7` | `--judge-model` / `EVAL_JUDGE_MODEL` |
| Judge effort | `xhigh` (extra high) | `--judge-effort` / `EVAL_JUDGE_EFFORT` |
| Judge thinking | `true` | `--judge-no-thinking` / `EVAL_JUDGE_THINKING=false` |

`--judge-effort` accepts `low | medium | high | xhigh | max` (matches the Cursor SDK surface verbatim). **`max` is "max mode" — explicitly NOT the default.** We use `xhigh` ("extra high") for grading, which gives strong reasoning without the latency / cost / unpredictability of max mode.

### Inspecting available models

```bash
pnpm exec tsx --env-file=.env scripts/inspect-models.ts opus
```

…lists every model + variant + parameter the active `CURSOR_API_KEY` can see. Useful when adding a new model or debugging a parameter mismatch.

## Results and baselines

Every run writes `evals/results/<UTC>__<agent>__<judge>.json` (gitignored). The file contains:

- `meta`: timestamp, plugin version, agent + judge models, judge effort, judge thinking, Cursor SDK version, host.
- `scenarios[]`: per-scenario verdict, mean score across samples, judge response per sample.
- `summary`: total / passed / failed / skipped, mean and weighted score.

When a release ships, copy the latest result into `evals/baselines/<agent>__cursor-<sdk>.json`. Future runs compare to that baseline; regressions become diffs in the next PR (Phase 2).

## Costs and discipline

- A scenario sample is one multi-turn agent session + one judge call. Plan for **3–8 minutes per scenario** and a **dollar-scale spend per full run** depending on samples × scenarios × models.
- Evals are **not** in `pnpm test`. They run on demand via `pnpm eval`. Treat them like a release gate, not a per-push check.
- Eval failures are signal, not noise. If a scenario regresses without a corresponding rule / skill change, that's the harness telling you a model or Cursor-internal change shifted behavior.
- The deterministic test suite (`pnpm test`) catches "I broke the artifact." Evals catch "the artifact is intact but the behavior degraded." Both stay valuable. Don't conflate them.

## Adding a scenario

1. Pick the contract you want to lock down (a rule clause, a skill behavior).
2. Author `evals/scenarios/<NN>-<id>.yaml` against the schema. Prefer multi-turn shapes that put real conversational pressure on the contract.
3. Build a fixture overlay under `evals/fixtures/<name>/` with the minimum state needed.
4. `pnpm eval --dry-run --only <NN>-<id>` to validate wiring.
5. `pnpm eval --only <NN>-<id>` to run live.
6. Iterate on the rubric until the verdict is consistent across 2–3 sample runs.

A good scenario is **specific** (one contract, not five), **measurable** (mostly mechanical expectations), and **realistic** (the task is something a real user would type). Multi-turn scenarios that include user pushback or follow-ups give the strongest signal.
