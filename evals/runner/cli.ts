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
 *
 *   --agent-model <id>    Override agent model (default: gemini-3.1-pro).
 *   --agent-params <kv>   Comma-separated `k=v` SDK params for the agent,
 *                         e.g. "fast=false". Default: none.
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
import { buildReport, printSummary, writeReport } from "./report.ts";
import { loadScenario, type LoadedScenario } from "./scenario.ts";
import { runScenarioOnce } from "./runner.ts";
import type {
  AgentTranscript,
  JudgeResponse,
  ModelParam,
  RunMeta,
  ScenarioRunRecord,
} from "./types.ts";

const RUNNER_DIR = dirname(fileURLToPath(import.meta.url));
const EVALS_DIR = dirname(RUNNER_DIR);
const PLUGIN_ROOT = dirname(EVALS_DIR);
const SCENARIOS_DIR = join(EVALS_DIR, "scenarios");

const DEFAULT_AGENT_MODEL = "gemini-3.1-pro";

interface CliArgs {
  list: boolean;
  dryRun: boolean;
  only?: string;
  keep: boolean;
  agentModel?: string;
  agentParams?: ModelParam[];
  judgeModel?: string;
  judgeParams?: ModelParam[];
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
  console.log(`usage: pnpm eval [--list] [--dry-run] [--only <id>] [--keep]
             [--agent-model <id>] [--agent-params "k=v,k2=v2"]
             [--judge-model <id>] [--judge-params "k=v,k2=v2"]

Defaults: agent=gemini-3.1-pro (no params),
          judge=gemini-3.1-pro (no params).

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

  // --dry-run validates the wiring without calling any model API.
  if (args.dryRun) {
    console.log(
      `dry-run: ${scenarios.length} scenario(s); agent=${agentModel} ${formatParams(agentParams)} | judge=${judgeModel} ${formatParams(judgeParams)}`,
    );
    for (const s of scenarios) {
      console.log(`  validating ${s.id} (${s.turns.length} turn(s))…`);
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

  console.log(
    `running ${scenarios.length} scenario(s) — agent=${agentModel} ${formatParams(agentParams)} | judge=${judgeModel} ${formatParams(judgeParams)}`,
  );

  const records: ScenarioRunRecord[] = [];

  for (const scenario of scenarios) {
    process.stdout.write(`▶ ${scenario.id} (${scenario.turns.length} turns) `);
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
          turns: scenario.turns,
          model: agentModel,
          params: agentParams,
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

    records.push({ scenario, samples });

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

  process.exit(report.summary.failed + report.summary.skipped > 0 ? 2 : 0);
}

main().catch((err: unknown) => {
  console.error(`fatal: ${(err as Error).message}`);
  process.exit(1);
});
