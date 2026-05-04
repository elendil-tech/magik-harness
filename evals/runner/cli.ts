#!/usr/bin/env -S npx --yes tsx
/**
 * evals/runner/cli.ts — `pnpm eval` entry point.
 *
 * Modes:
 *   --list                List scenarios; do not run.
 *   --dry-run             Build fixtures and validate scenarios; do not call any
 *                         model API. Lets you verify wiring without spending
 *                         tokens or needing API keys.
 *   --only <id>           Run only the scenario with the given id.
 *   --keep                Keep fixture tmp dirs after the run (debugging).
 *   --agent-model <id>    Override agent model (default: composer-2).
 *   --judge-model <id>    Override judge model (default: claude-opus-4-7).
 *   --judge-effort <lvl>  Override judge thinking effort
 *                         (minimal | low | medium | high; default high).
 *
 * Env:
 *   CURSOR_API_KEY            (required for live runs) — Cursor SDK auth.
 *   ANTHROPIC_API_KEY         (required for live runs) — judge auth.
 *   EVAL_AGENT_MODEL          fallback for --agent-model.
 *   EVAL_JUDGE_MODEL          fallback for --judge-model.
 *   EVAL_JUDGE_THINKING_EFFORT  fallback for --judge-effort.
 *
 * Exit codes:
 *   0  every selected scenario passed.
 *   1  CLI / config error (bad flag, missing key, scenario load failure).
 *   2  one or more scenarios failed or skipped (the eval-result exit).
 */

import { hostname } from "node:os";
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { buildFixture } from "./fixture.ts";
import {
  judge,
  resolveJudgeEffort,
  resolveJudgeModel,
} from "./judge.ts";
import { buildReport, printSummary, writeReport } from "./report.ts";
import { loadScenario, type LoadedScenario } from "./scenario.ts";
import { runScenarioOnce } from "./runner.ts";
import type {
  AgentTranscript,
  RunMeta,
  ScenarioRunRecord,
  JudgeResponse,
} from "./types.ts";

const RUNNER_DIR = dirname(fileURLToPath(import.meta.url));
const EVALS_DIR = dirname(RUNNER_DIR);
const PLUGIN_ROOT = dirname(EVALS_DIR);
const SCENARIOS_DIR = join(EVALS_DIR, "scenarios");

const DEFAULT_AGENT_MODEL = "composer-2";

interface CliArgs {
  list: boolean;
  dryRun: boolean;
  only?: string;
  keep: boolean;
  agentModel?: string;
  judgeModel?: string;
  judgeEffort?: "minimal" | "low" | "medium" | "high";
}

function parseArgs(argv: string[]): CliArgs {
  const args: CliArgs = { list: false, dryRun: false, keep: false };
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
      case "--only":
        args.only = argv[++i] ?? requireArg("--only");
        break;
      case "--agent-model":
        args.agentModel = argv[++i] ?? requireArg("--agent-model");
        break;
      case "--judge-model":
        args.judgeModel = argv[++i] ?? requireArg("--judge-model");
        break;
      case "--judge-effort": {
        const v = argv[++i] ?? requireArg("--judge-effort");
        if (!["minimal", "low", "medium", "high"].includes(v)) {
          throw new Error(
            `--judge-effort must be one of minimal|low|medium|high, got "${v}"`,
          );
        }
        args.judgeEffort = v as CliArgs["judgeEffort"];
        break;
      }
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
  console.log(`usage: pnpm eval [--list] [--dry-run] [--only <id>] [--keep]
             [--agent-model <id>] [--judge-model <id>]
             [--judge-effort minimal|low|medium|high]

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
      console.log(`  ${s.id.padEnd(36)} ${s.title}`);
    }
    return;
  }

  const agentModel =
    args.agentModel ?? process.env.EVAL_AGENT_MODEL ?? DEFAULT_AGENT_MODEL;
  const judgeModel = resolveJudgeModel({ model: args.judgeModel });
  const judgeEffort = resolveJudgeEffort({ thinkingEffort: args.judgeEffort });

  // --dry-run validates the wiring without calling any model API.
  if (args.dryRun) {
    console.log(
      `dry-run: ${scenarios.length} scenario(s); agent=${agentModel} judge=${judgeModel}`,
    );
    for (const s of scenarios) {
      console.log(`  validating ${s.id}…`);
      const built = buildFixture({ fixture: s.fixture });
      try {
        console.log(
          `    fixture ok: ${built.projectRoot} (${built.overlayFiles.length} overlay file(s))`,
        );
      } finally {
        if (!args.keep) built.cleanup();
      }
    }
    console.log(`dry-run ok.`);
    return;
  }

  const cursorKey = process.env.CURSOR_API_KEY;
  const anthropicKey = process.env.ANTHROPIC_API_KEY;
  if (!cursorKey) {
    console.error(
      "error: CURSOR_API_KEY is not set. Set it before a live eval run, or use --dry-run to validate wiring without it.",
    );
    process.exit(1);
  }
  if (!anthropicKey) {
    console.error(
      "error: ANTHROPIC_API_KEY is not set. The judge needs it. Use --dry-run to skip the judge.",
    );
    process.exit(1);
  }

  const meta: RunMeta = {
    timestamp: new Date().toISOString(),
    plugin_version: pluginVersion(),
    agent_model: agentModel,
    judge_model: judgeModel,
    judge_thinking_effort: judgeEffort,
    cursor_sdk_version: cursorSdkVersion(),
    host: process.env.CI ? "ci" : hostname(),
  };

  console.log(
    `running ${scenarios.length} scenario(s) — agent=${agentModel} judge=${judgeModel} effort=${judgeEffort}`,
  );

  const records: ScenarioRunRecord[] = [];

  for (const scenario of scenarios) {
    process.stdout.write(`▶ ${scenario.id} `);
    const samples: ScenarioRunRecord["samples"] = [];

    for (let i = 0; i < scenario.samples; i++) {
      process.stdout.write(`[${i + 1}/${scenario.samples}] `);
      const built = buildFixture({ fixture: scenario.fixture });
      let runOk = true;
      let agentTranscript: AgentTranscript | null = null;
      let judgeRes: JudgeResponse | null = null;
      let duration = 0;
      let transcriptChars = 0;
      let err: string | undefined;

      try {
        const result = await runScenarioOnce({
          projectRoot: built.projectRoot,
          task: scenario.task,
          model: agentModel,
          apiKey: cursorKey,
          timeoutMs: scenario.timeout_ms,
        });
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

      if (runOk && agentTranscript) {
        try {
          judgeRes = await judge(scenario, agentTranscript, {
            model: judgeModel,
            thinkingEffort: judgeEffort,
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

    records.push({ scenario, samples });

    const lastJudge = samples[samples.length - 1]?.judge;
    if (lastJudge) {
      process.stdout.write(
        `${lastJudge.passed ? "✓" : "✗"} (${(lastJudge.score * 100).toFixed(0)}%)\n`,
      );
    } else {
      process.stdout.write(`! (no judge)\n`);
    }
  }

  const report = buildReport(meta, records);
  const path = writeReport(report);
  printSummary(report);
  console.log(`\nresults written to: ${path}`);

  process.exit(report.summary.failed + report.summary.skipped > 0 ? 2 : 0);
}

main().catch((err: unknown) => {
  console.error(`fatal: ${(err as Error).message}`);
  process.exit(1);
});
