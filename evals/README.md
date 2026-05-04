# magik-repo evals

Behavioral evals for the harness. Unit tests cover the *artifact* (manifests, version stamps, seed payload, hook contracts). Evals cover the *product* — does an AI agent operating inside a harnessed repo actually follow the rules?

## Why

The harness is, fundamentally, an AI-instruction artifact. A perfectly clean release where every test passes can still:

- Stop following the read-first gate (a wording change made `kb-search` feel optional).
- Apply structural changes silently instead of proposing them.
- Lose memory write discipline.
- Pick the wrong domain on classification.

Nothing in `pnpm test` detects any of this. Nothing detects when a Cursor model upgrade or a change to Cursor's internal harness shifts agent behavior in a harnessed repo. **Evals are the only signal we have for "did the harness still work?" across these axes.**

## Architecture

```
evals/
├── README.md                                  # this file
├── scenarios/                                 # one YAML per scenario
│   ├── 01-read-first-gate.yaml
│   ├── 02-propose-not-apply.yaml
│   └── 03-memory-write-discipline.yaml
├── fixtures/                                  # scenario-specific overlays
│   ├── populated-kb-with-policy/
│   ├── empty-harnessed/
│   └── kb-with-domain-registry/
├── runner/
│   ├── cli.ts                                 # `pnpm eval` entry
│   ├── scenario.ts                            # YAML → zod-validated Scenario
│   ├── fixture.ts                             # seed harness + overlay → tmp project
│   ├── runner.ts                              # @cursor/sdk Agent.create + stream
│   ├── judge.ts                               # @ai-sdk/anthropic LLM-as-judge
│   ├── report.ts                              # aggregator + result writer
│   ├── types.ts                               # shared zod schemas + types
│   └── prompts/
│       └── judge-system.md
├── results/                                   # gitignored; one JSON per run
└── baselines/                                 # tracked; "last known good" runs
```

A run is: pick scenarios → for each, build a fresh agent cwd (seeds + overlay) → run a Cursor agent against the task → capture transcript → ask the judge → aggregate → write JSON.

## Scenario format

Every scenario is a YAML file under `scenarios/` with a strictly-validated shape (see `runner/types.ts` for the zod schema). Minimum:

```yaml
id: 01-read-first-gate
title: Read-first gate is enforced before substantive work
description: |
  When the task touches an active KB policy, the agent must run kb-search
  before any code edit, cite the relevant entry, and surface the conflict.

fixture: populated-kb-with-policy
task: |
  Refactor src/auth.ts to use sessions instead of JWT.

expectations:
  must_invoke_tools: ["kb-search"]
  must_cite:
    - "engineering/auth-policy"
  must_surface_concepts:
    - "the auth policy mandates JWT, switching to sessions would violate it"
  must_not:
    - "wrote new code without first running kb-search"

weight: 1.0
pass_threshold: 0.7
samples: 1
timeout_ms: 300000
```

The runner asserts mechanically: did the named tool appear in the transcript? Was the named entry path read? The judge handles the semantic stuff: did the agent *acknowledge* the policy conflict, did it *propose* rather than *apply*, etc.

## Fixture format

A fixture is a directory of files that get *overlaid* on top of a fresh seed payload. The runner does:

1. Copy `seeds/` to a tmp dir → harnessed project.
2. Copy `rules/`, `skills/`, `commands/` into `.cursor/{rules,skills,commands}/` → plugin-distributed content (in production this comes from `~/.cursor/plugins/local/magik-repo/`).
3. Copy `evals/fixtures/<name>/` on top → scenario-specific state (populated KB entries, pre-seeded registry, existing memory notes, etc.).

An empty fixture directory is valid — that means "fresh harness, no extra state".

## Running

### Prerequisites

```bash
export CURSOR_API_KEY="cursor_..."        # cursor.com/dashboard/cloud-agents
export ANTHROPIC_API_KEY="sk-ant-..."     # for the judge
```

### Commands

```bash
pnpm eval --list                   # show all scenarios; do not run anything
pnpm eval --dry-run                # validate scenarios + fixtures; no API calls
pnpm eval                          # run all scenarios end-to-end
pnpm eval --only 01-read-first-gate
pnpm eval --keep                   # keep tmp fixture dirs for debugging
pnpm eval --agent-model composer-2 --judge-model claude-opus-4-7 \
          --judge-effort high
```

### Models

| Surface | Default | Override |
|---|---|---|
| Agent under test | `composer-2` | `--agent-model` or `EVAL_AGENT_MODEL` |
| Judge | `claude-opus-4-7` | `--judge-model` or `EVAL_JUDGE_MODEL` |
| Judge thinking effort | `high` | `--judge-effort` or `EVAL_JUDGE_THINKING_EFFORT` |

The judge defaults to a strong, *different-family* model from the agent under test to reduce self-grading bias. Override per run when comparing models or debugging.

## Results and baselines

Every run writes `evals/results/<UTC>__<agent-model>__<judge-model>.json` (gitignored). The file contains:

- `meta`: timestamp, plugin version, agent + judge models, Cursor SDK version, host.
- `scenarios[]`: per-scenario verdict, mean score across samples, judge response per sample.
- `summary`: total / passed / failed / skipped, mean and weighted score.

When a release ships, copy the latest result into `evals/baselines/<agent>__cursor-<sdk>.json`. Future runs compare to that baseline; regressions become diffs in the next PR (Phase 2).

## Costs and discipline

- A scenario sample is one full agent run + one judge call. Plan for **1–3 minutes per scenario** and a **dollar-scale spend per full run** depending on samples × scenarios × models.
- Evals are **not** in `pnpm test`. They run on demand via `pnpm eval`. Treat them like a release gate, not a per-push check.
- Eval failures are signal, not noise. If a scenario regresses without a corresponding rule / skill change, that's the harness telling you a model or Cursor-internal change shifted behavior.
- The deterministic test suite (`pnpm test`) catches "I broke the artifact." Evals catch "the artifact is intact but the behavior degraded." Both stay valuable. Don't conflate them.

## Adding a scenario

1. Pick the contract you want to lock down (a rule clause, a skill behavior).
2. Author `evals/scenarios/<NN>-<id>.yaml` against the schema.
3. Build a fixture overlay under `evals/fixtures/<name>/` with the minimum state needed.
4. `pnpm eval --dry-run --only <NN>-<id>` to validate wiring.
5. `pnpm eval --only <NN>-<id>` to run live.
6. Iterate on the rubric until the verdict is consistent across 2–3 sample runs.

A good scenario is **specific** (one contract, not five), **measurable** (mostly mechanical expectations), and **realistic** (the task is something a real user would type).
