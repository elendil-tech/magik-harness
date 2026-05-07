#!/usr/bin/env -S npx --yes tsx
/**
 * evals/runner/cli.ts — `pnpm eval` entry point.
 *
 * Modes:
 *   --list                List scenarios; do not run.
 *   --dry-run             Build fixtures and validate scenarios; do not call any
 *                         model API. Lets you verify wiring without spending
 *                         tokens or needing CURSOR_API_KEY.
 *   --only <id>           Run only the scenario with the given id.
 *   --keep                Keep fixture tmp dirs after the run (debugging).
 *   --samples <n>         Override every scenario's `samples:` for this run.
 *                         Useful for fast wiring checks (`--samples 1`) or
 *                         a one-off noise study (`--samples 5`). Does not
 *                         persist into the YAML.
 *
 *   --control             Run each scenario in two conditions: harnessed
 *                         (the scenario's primary `fixture`) and content-
 *                         only (the scenario's `control_fixture` twin).
 *                         The report renders the per-scenario delta
 *                         (`harnessed - content-only`), which isolates
 *                         the harness's contribution to self-steering
 *                         (content held constant across both runs). A
 *                         scenario without a `control_fixture` declared
 *                         is skipped with a warning under `--control`.
 *
 *   --baseline <path>     Compare this run's per-scenario means against
 *                         the baseline file at <path> (a previous
 *                         RunReport JSON). Always prints a comparison
 *                         table; exits non-zero (code 3) if any
 *                         scenario regressed beyond the tolerance
 *                         (default 15pp).
 *   --accept-regression   Acknowledge regressions found by --baseline
 *                         comparison without failing the run. The
 *                         comparison table still prints; only the exit
 *                         code is suppressed. Use sparingly — a real
 *                         regression should usually be investigated.
 *
 *   --agent-model <id>    Override agent model (default: gpt-5.3-codex-spark
 *                         — free, high-volume tier; ideal for the agent
 *                         under test which runs many turns × samples ×
 *                         scenarios). Use `--agent-model gemini-3.1-pro`
 *                         (or set EVAL_AGENT_MODEL) for cross-family
 *                         portability checks.
 *   --agent-params <kv>   Comma-separated `k=v` SDK params for the agent,
 *                         e.g. "reasoning=high". Default: none. codex-
 *                         spark exposes `reasoning` (low|medium|high|
 *                         extra-high); gemini has no tunable params.
 *
 *   --judge-model <id>    Override judge model (default: gemini-3.1-pro).
 *   --judge-params <kv>   Comma-separated `k=v` SDK params for the judge,
 *                         e.g. "thinking=true,context=1m,effort=high".
 *                         Default: none. Discover the right ids per
 *                         model with `pnpm exec tsx scripts/inspect-models.ts`.
 *
 * Env (auto-loaded from .env / .env.local by bootstrap.ts):
 *   CURSOR_API_KEY            (required for live runs) — used for both
 *                             the agent under test and the judge.
 *   EVAL_AGENT_MODEL          fallback for --agent-model.
 *   EVAL_AGENT_PARAMS         fallback for --agent-params (CSV).
 *   EVAL_JUDGE_MODEL          fallback for --judge-model.
 *   EVAL_JUDGE_PARAMS         fallback for --judge-params (CSV).
 *
 * Exit codes:
 *   0  every selected scenario passed.
 *   1  CLI / config error (bad flag, missing key, scenario load failure).
 *   2  one or more scenarios failed or skipped (the eval-result exit).
 *   3  --baseline comparison flagged unaccepted regressions.
 */

// MUST be the first import — loads .env and sets CURSOR_RIPGREP_PATH
// before the Cursor SDK initializes. See evals/runner/bootstrap.ts.
import "./bootstrap.ts";

import { hostname } from "node:os";
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { buildFixture } from "./fixture.ts";
import {
  judge,
  parseParamCsv,
  resolveJudgeModel,
  resolveJudgeParams,
} from "./judge.ts";
import {
  buildReport,
  printSummary,
  writeReport,
  writeTranscript,
} from "./report.ts";
import {
  checkRegression,
  printRegressionReport,
} from "./regression.ts";
import { loadScenario, type LoadedScenario } from "./scenario.ts";
import { runScenarioOnce } from "./runner.ts";
import {
  snapshotParentRepo,
  verifyAndRevert,
  withGitCeiling,
} from "./contamination-guard.ts";
import { tmpdir } from "node:os";
import type {
  AgentTranscript,
  FixtureCondition,
  JudgeResponse,
  ModelParam,
  RunMeta,
  ScenarioRunRecord,
} from "./types.ts";

const RUNNER_DIR = dirname(fileURLToPath(import.meta.url));
const EVALS_DIR = dirname(RUNNER_DIR);
const PLUGIN_ROOT = dirname(EVALS_DIR);
const SCENARIOS_DIR = join(EVALS_DIR, "scenarios");

// codex-spark is unrestricted on the active CURSOR_API_KEY tier
// (high-volume inferencing) which fits the agent-under-test profile:
// many turns × samples × scenarios. The judge is a single transcript-
// grading call per sample with longer-session shape, so it stays on
// `gemini-3.1-pro` (low-volume sweet spot). Override either via flags
// or the EVAL_AGENT_MODEL / EVAL_JUDGE_MODEL env vars.
const DEFAULT_AGENT_MODEL = "gpt-5.3-codex-spark";

interface CliArgs {
  list: boolean;
  dryRun: boolean;
  only?: string;
  keep: boolean;
  control: boolean;
  samplesOverride?: number;
  baseline?: string;
  acceptRegression: boolean;
  agentModel?: string;
  agentParams?: ModelParam[];
  judgeModel?: string;
  judgeParams?: ModelParam[];
}

function parseArgs(argv: string[]): CliArgs {
  const args: CliArgs = {
    list: false,
    dryRun: false,
    keep: false,
    control: false,
    acceptRegression: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    switch (a) {
      case "--list":
        args.list = true;
        break;
      case "--dry-run":
        args.dryRun = true;
        break;
      case "--keep":
        args.keep = true;
        break;
      case "--control":
        args.control = true;
        break;
      case "--only":
        args.only = argv[++i] ?? requireArg("--only");
        break;
      case "--samples": {
        const raw = argv[++i] ?? requireArg("--samples");
        const n = Number.parseInt(raw, 10);
        if (!Number.isFinite(n) || n < 1) {
          throw new Error(`--samples must be a positive integer, got "${raw}"`);
        }
        args.samplesOverride = n;
        break;
      }
      case "--baseline":
        args.baseline = argv[++i] ?? requireArg("--baseline");
        break;
      case "--accept-regression":
        args.acceptRegression = true;
        break;
      case "--agent-model":
        args.agentModel = argv[++i] ?? requireArg("--agent-model");
        break;
      case "--agent-params":
        args.agentParams = parseParamCsv(
          argv[++i] ?? requireArg("--agent-params"),
        );
        break;
      case "--judge-model":
        args.judgeModel = argv[++i] ?? requireArg("--judge-model");
        break;
      case "--judge-params":
        args.judgeParams = parseParamCsv(
          argv[++i] ?? requireArg("--judge-params"),
        );
        break;
      case "--help":
      case "-h":
        printHelp();
        process.exit(0);
      default:
        throw new Error(`unknown argument: ${a}`);
    }
  }
  return args;
}

function requireArg(name: string): never {
  throw new Error(`${name} requires a value`);
}

function printHelp(): void {
  console.log(`usage: pnpm eval [--list] [--dry-run] [--only <id>] [--keep] [--control]
             [--samples <n>] [--baseline <path>] [--accept-regression]
             [--agent-model <id>] [--agent-params "k=v,k2=v2"]
             [--judge-model <id>] [--judge-params "k=v,k2=v2"]

Defaults: agent=gpt-5.3-codex-spark (no params; free / high-volume),
          judge=gemini-3.1-pro (no params; low-volume / longer sessions).

--control runs each scenario in two conditions (harnessed vs. content-only)
  and reports the delta. Doubles cost and runtime; use when you want to
  measure the harness's contribution to self-steering. Scenarios without
  a control_fixture: declared are skipped with a warning under --control.

--baseline <path> compares this run's per-scenario means against the
  baseline file at <path>. Exits non-zero (code 3) on any regression
  beyond the tolerance (15pp by default), unless --accept-regression
  is also passed. The comparison table prints regardless.

Discover available models + their params:
  pnpm exec tsx scripts/inspect-models.ts [filter]

See evals/README.md for details.`);
}

function loadAllScenarios(): LoadedScenario[] {
  const files = readdirSync(SCENARIOS_DIR)
    .filter((f) => f.endsWith(".yaml"))
    .sort();
  return files.map((f) => loadScenario(join(SCENARIOS_DIR, f)));
}

function pluginVersion(): string {
  const pkg = JSON.parse(
    readFileSync(join(PLUGIN_ROOT, "package.json"), "utf-8"),
  ) as { version: string };
  return pkg.version;
}

function cursorSdkVersion(): string {
  try {
    const pkg = JSON.parse(
      readFileSync(
        join(PLUGIN_ROOT, "node_modules", "@cursor", "sdk", "package.json"),
        "utf-8",
      ),
    ) as { version: string };
    return pkg.version;
  } catch {
    return "unknown";
  }
}

function resolveAgentModel(opts: { model?: string }): string {
  return opts.model ?? process.env.EVAL_AGENT_MODEL ?? DEFAULT_AGENT_MODEL;
}

function resolveAgentParams(opts: { params?: ModelParam[] }): ModelParam[] {
  if (opts.params !== undefined) return opts.params;
  const fromEnv = process.env.EVAL_AGENT_PARAMS;
  if (fromEnv !== undefined) return parseParamCsv(fromEnv);
  return [];
}

function formatParams(params: ModelParam[]): string {
  if (params.length === 0) return "(default)";
  return params.map((p) => `${p.id}=${p.value}`).join(",");
}

async function main(): Promise<void> {
  let args: CliArgs;
  try {
    args = parseArgs(process.argv.slice(2));
  } catch (err) {
    console.error(`error: ${(err as Error).message}`);
    printHelp();
    process.exit(1);
  }

  let scenarios: LoadedScenario[];
  try {
    scenarios = loadAllScenarios();
  } catch (err) {
    console.error(`error loading scenarios: ${(err as Error).message}`);
    process.exit(1);
  }

  if (args.only) {
    const filtered = scenarios.filter((s) => s.id === args.only);
    if (filtered.length === 0) {
      console.error(
        `error: no scenario with id "${args.only}". Available:\n` +
          scenarios.map((s) => `  - ${s.id}`).join("\n"),
      );
      process.exit(1);
    }
    scenarios = filtered;
  }

  if (args.list) {
    console.log(`scenarios (${scenarios.length}):`);
    for (const s of scenarios) {
      const turnSuffix = s.turns.length > 1 ? ` [${s.turns.length} turns]` : "";
      console.log(`  ${s.id.padEnd(36)} ${s.title}${turnSuffix}`);
    }
    return;
  }

  let agentModel: string;
  let agentParams: ModelParam[];
  let judgeModel: string;
  let judgeParams: ModelParam[];
  try {
    agentModel = resolveAgentModel({ model: args.agentModel });
    agentParams = resolveAgentParams({ params: args.agentParams });
    judgeModel = resolveJudgeModel({ model: args.judgeModel });
    judgeParams = resolveJudgeParams({ params: args.judgeParams });
  } catch (err) {
    console.error(`error: ${(err as Error).message}`);
    process.exit(1);
  }

  // Expand scenarios into per-condition execution units. In default mode
  // each scenario produces one unit (harnessed). Under --control, each
  // scenario with a `control_fixture` declared produces two units
  // (harnessed + content-only); scenarios without a twin are skipped
  // with a warning.
  interface ExecUnit {
    scenario: LoadedScenario;
    condition: FixtureCondition;
    fixture: string;
  }
  const units: ExecUnit[] = [];
  if (args.control) {
    for (const s of scenarios) {
      if (!s.control_fixture) {
        console.warn(
          `  warn: scenario "${s.id}" has no control_fixture; skipping under --control`,
        );
        continue;
      }
      units.push({ scenario: s, condition: "harnessed", fixture: s.fixture });
      units.push({
        scenario: s,
        condition: "content-only",
        fixture: s.control_fixture,
      });
    }
    if (units.length === 0) {
      console.error(
        "error: --control requested but no scenarios have a control_fixture declared.",
      );
      process.exit(1);
    }
  } else {
    for (const s of scenarios) {
      units.push({ scenario: s, condition: "harnessed", fixture: s.fixture });
    }
  }

  // --dry-run validates the wiring without calling any model API.
  if (args.dryRun) {
    const mode = args.control ? "control mode (2 conditions)" : "single condition";
    console.log(
      `dry-run: ${scenarios.length} scenario(s) → ${units.length} unit(s) [${mode}]; agent=${agentModel} ${formatParams(agentParams)} | judge=${judgeModel} ${formatParams(judgeParams)}`,
    );
    for (const u of units) {
      const tag = args.control ? ` [${u.condition}]` : "";
      console.log(
        `  validating ${u.scenario.id}${tag} (${u.scenario.turns.length} turn(s))…`,
      );
      const built = buildFixture({ fixture: u.fixture });
      try {
        console.log(
          `    fixture ok: ${built.projectRoot} (harness=${built.harness}, ${built.overlayFiles.length} file(s))`,
        );
      } finally {
        if (!args.keep) built.cleanup();
      }
    }
    console.log(`dry-run ok.`);
    return;
  }

  const cursorKey = process.env.CURSOR_API_KEY;
  if (!cursorKey) {
    console.error(
      "error: CURSOR_API_KEY is not set. Use --dry-run to validate wiring without it, or copy .env.example → .env and fill it in.",
    );
    process.exit(1);
  }

  const meta: RunMeta = {
    timestamp: new Date().toISOString(),
    plugin_version: pluginVersion(),
    agent_model: agentModel,
    agent_params: agentParams,
    judge_model: judgeModel,
    judge_params: judgeParams,
    cursor_sdk_version: cursorSdkVersion(),
    host: process.env.CI ? "ci" : hostname(),
  };

  const modeNote = args.control
    ? ` [control mode: ${scenarios.length} scenario(s) × 2 conditions]`
    : "";
  console.log(
    `running ${units.length} unit(s)${modeNote} — agent=${agentModel} ${formatParams(agentParams)} | judge=${judgeModel} ${formatParams(judgeParams)}`,
  );

  const records: ScenarioRunRecord[] = [];

  for (const unit of units) {
    const { scenario, condition, fixture } = unit;
    const tag = args.control ? ` [${condition}]` : "";
    process.stdout.write(
      `▶ ${scenario.id}${tag} (${scenario.turns.length} turns) `,
    );
    const samples: ScenarioRunRecord["samples"] = [];
    const sampleCount = args.samplesOverride ?? scenario.samples;

    for (let i = 0; i < sampleCount; i++) {
      process.stdout.write(`[${i + 1}/${sampleCount}] `);
      const built = buildFixture({ fixture });
      // Snapshot the parent repo's HEAD before the sample runs. The
      // post-sample verifyAndRevert below catches CWD-escape commits
      // (the v0.7.x patch — see evals/runner/contamination-guard.ts).
      const parentSnapshot = snapshotParentRepo(PLUGIN_ROOT);
      let runOk = true;
      let agentTranscript: AgentTranscript | null = null;
      let judgeRes: JudgeResponse | null = null;
      let duration = 0;
      let transcriptChars = 0;
      let err: string | undefined;

      try {
        // Set GIT_CEILING_DIRECTORIES to the OS tmp dir so any git
        // invocation from inside the temp fixture does its `.git`
        // ancestor walk only within /tmp — it cannot accidentally
        // attach to the parent magik-repo's `.git` via tree walk.
        const result = await withGitCeiling(tmpdir(), () =>
          runScenarioOnce({
            projectRoot: built.projectRoot,
            turns: scenario.turns,
            model: agentModel,
            params: agentParams,
            apiKey: cursorKey,
            timeoutMs: scenario.timeout_ms,
          }),
        );
        duration = result.duration_ms;
        transcriptChars = result.transcript.raw_chars;

        if (result.status !== "ok") {
          runOk = false;
          err = result.error;
        } else {
          agentTranscript = result.transcript;
        }
      } catch (e) {
        runOk = false;
        err = (e as Error).message;
      } finally {
        if (!args.keep) built.cleanup();
      }

      // Detection layer: if the parent's HEAD changed despite the
      // GIT_CEILING_DIRECTORIES guard above, the agent escaped CWD
      // explicitly (e.g., `git -C /abs/path commit`). Auto-revert and
      // mark the sample as failed so the contaminated result is not
      // credited. The transcript is preserved for debugging.
      const verdict = verifyAndRevert(parentSnapshot);
      if (verdict.contaminated) {
        process.stderr.write(
          `\n  ⚠ CONTAMINATION: parent repo HEAD changed during this sample\n` +
            `      pre-sample HEAD:  ${verdict.preHead}\n` +
            `      post-sample HEAD: ${verdict.postHead}\n` +
            (verdict.reverted
              ? `      ✓ auto-reverted to pre-sample HEAD\n`
              : `      ✗ auto-revert FAILED: ${verdict.error ?? "unknown"}\n` +
                `      manually run: git -C ${parentSnapshot.root} reset --hard ${verdict.preHead}\n`),
        );
        runOk = false;
        err = `agent-escape: parent repo HEAD ${verdict.preHead?.slice(0, 8) ?? "?"} → ${verdict.postHead?.slice(0, 8) ?? "?"}; ${verdict.reverted ? "auto-reverted" : "NOT REVERTED — see stderr"}`;
      }

      if (agentTranscript) {
        // Persist the transcript even if the judge later errors —
        // the transcript is exactly what we need to diagnose either
        // a low score or a judge failure. In control mode we tag the
        // sample slug with the condition so files don't collide.
        const sampleTag: number | string = args.control
          ? `${condition}-sample-${i + 1}`
          : i;
        writeTranscript(meta, scenario.id, sampleTag, agentTranscript);
      }

      if (runOk && agentTranscript) {
        try {
          judgeRes = await judge(scenario, agentTranscript, {
            model: judgeModel,
            params: judgeParams,
            apiKey: cursorKey,
          });
        } catch (e) {
          err = `judge: ${(e as Error).message}`;
        }
      }

      samples.push({
        judge: judgeRes,
        duration_ms: duration,
        transcript_chars: transcriptChars,
        error: err,
      });
    }

    records.push({ scenario, condition, samples });

    const lastJudge = samples[samples.length - 1]?.judge;
    if (lastJudge) {
      process.stdout.write(
        `${lastJudge.passed ? "✓" : "✗"} (${(lastJudge.score * 100).toFixed(0)}%)\n`,
      );
    } else {
      const lastErr = samples[samples.length - 1]?.error ?? "no judge";
      process.stdout.write(`! (${lastErr.slice(0, 60)})\n`);
    }
  }

  const report = buildReport(meta, records);
  const path = writeReport(report);
  printSummary(report);
  console.log(`\nresults written to: ${path}`);

  let regressionFailed = false;
  if (args.baseline) {
    try {
      const regressionReport = checkRegression(report, args.baseline);
      printRegressionReport(regressionReport);
      if (regressionReport.regressions.length > 0) {
        if (args.acceptRegression) {
          console.log(
            "  --accept-regression set: regressions ack'd; not failing the run.",
          );
        } else {
          regressionFailed = true;
        }
      }
    } catch (err) {
      console.error(`error: regression check failed: ${(err as Error).message}`);
      process.exit(1);
    }
  }

  if (regressionFailed) process.exit(3);
  process.exit(report.summary.failed + report.summary.skipped > 0 ? 2 : 0);
}

main().catch((err: unknown) => {
  console.error(`fatal: ${(err as Error).message}`);
  process.exit(1);
});
