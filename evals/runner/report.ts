/**
 * evals/runner/report.ts — aggregate per-scenario results into a single
 * RunReport, write it to disk, and pretty-print a summary.
 *
 * Result location: `evals/results/<UTC>__<agent-model>__<judge-model>.json`
 * (gitignored). Baselines live under `evals/baselines/` and are tracked.
 */

import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type {
  AgentTranscript,
  JudgeResponse,
  RunReport,
  RunMeta,
  ScenarioResult,
  ScenarioRunRecord,
} from "./types.ts";

const RUNNER_DIR = dirname(fileURLToPath(import.meta.url));
const EVALS_DIR = dirname(RUNNER_DIR);
const RESULTS_DIR = join(EVALS_DIR, "results");

function median(nums: number[]): number {
  if (nums.length === 0) return 0;
  const s = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 === 0 ? (s[mid - 1]! + s[mid]!) / 2 : s[mid]!;
}

function aggregateScenario(rec: ScenarioRunRecord): ScenarioResult {
  const judges = rec.samples
    .map((s) => s.judge)
    .filter((j): j is JudgeResponse => j !== null);

  if (judges.length === 0) {
    const firstErr = rec.samples.find((s) => s.error)?.error;
    return {
      scenario_id: rec.scenario.id,
      title: rec.scenario.title,
      passed: false,
      score: 0,
      samples: [],
      duration_ms: median(rec.samples.map((s) => s.duration_ms)),
      transcript_chars: rec.samples.reduce(
        (a, s) => a + s.transcript_chars,
        0,
      ),
      status: firstErr?.startsWith("CursorAgentError") ||
        firstErr?.startsWith("agent run exceeded") ||
        firstErr?.includes("run.status=error")
        ? "agent-error"
        : "judge-error",
      error: firstErr,
    };
  }

  const meanScore =
    judges.reduce((a, j) => a + j.score, 0) / judges.length;
  return {
    scenario_id: rec.scenario.id,
    title: rec.scenario.title,
    samples: judges,
    score: meanScore,
    passed: meanScore >= rec.scenario.pass_threshold,
    duration_ms: median(rec.samples.map((s) => s.duration_ms)),
    transcript_chars: rec.samples.reduce(
      (a, s) => a + s.transcript_chars,
      0,
    ),
    status: "ok",
  };
}

export function buildReport(
  meta: RunMeta,
  records: ScenarioRunRecord[],
): RunReport {
  const scenarios = records.map(aggregateScenario);

  const passed = scenarios.filter((s) => s.passed && s.status === "ok").length;
  const failed = scenarios.filter(
    (s) => !s.passed && s.status === "ok",
  ).length;
  const skipped = scenarios.filter((s) => s.status !== "ok").length;
  const meanScore =
    scenarios.length > 0
      ? scenarios.reduce((a, s) => a + s.score, 0) / scenarios.length
      : 0;

  // Weight-aware aggregate. Skipped scenarios contribute 0 with their
  // weight, which is what we want — a skip is a missing signal, not a free
  // pass.
  const totalWeight = records.reduce((a, r) => a + r.scenario.weight, 0);
  const weightedScore =
    totalWeight > 0
      ? records.reduce((a, r, i) => {
          const sc = scenarios[i]!;
          return a + (sc.status === "ok" ? sc.score * r.scenario.weight : 0);
        }, 0) / totalWeight
      : 0;

  return {
    meta,
    scenarios,
    summary: {
      total: scenarios.length,
      passed,
      failed,
      skipped,
      mean_score: meanScore,
      weighted_score: weightedScore,
    },
  };
}

export function writeReport(report: RunReport): string {
  if (!existsSync(RESULTS_DIR)) mkdirSync(RESULTS_DIR, { recursive: true });
  const stamp = report.meta.timestamp.replace(/[:.]/g, "-");
  const safe = (s: string) => s.replace(/[^A-Za-z0-9._-]+/g, "-");
  const filename = `${stamp}__${safe(report.meta.agent_model)}__${safe(report.meta.judge_model)}.json`;
  const path = join(RESULTS_DIR, filename);
  writeFileSync(path, `${JSON.stringify(report, null, 2)}\n`);
  return path;
}

/**
 * Persist the agent transcript for a single scenario sample to disk
 * alongside the result file. Used for diagnosis: when a scenario
 * scores low, the result file tells you *what* failed; the transcript
 * file tells you *why*. The transcript captures everything the
 * judge saw — text, tools_invoked, files_read, files_written.
 *
 * Returns the absolute path written. Never throws on disk errors —
 * a failed transcript dump is a debugging convenience, not a
 * blocking concern; the caller logs and moves on.
 */
export function writeTranscript(
  meta: RunMeta,
  scenarioId: string,
  sampleIdx: number,
  transcript: AgentTranscript,
): string | null {
  try {
    if (!existsSync(RESULTS_DIR)) mkdirSync(RESULTS_DIR, { recursive: true });
    const stamp = meta.timestamp.replace(/[:.]/g, "-");
    const filename = `${stamp}__${scenarioId}__sample-${sampleIdx + 1}.transcript.json`;
    const path = join(RESULTS_DIR, filename);
    const body = {
      meta: {
        timestamp: meta.timestamp,
        scenario_id: scenarioId,
        sample_index: sampleIdx,
        agent_model: meta.agent_model,
        agent_params: meta.agent_params,
      },
      transcript,
    };
    writeFileSync(path, `${JSON.stringify(body, null, 2)}\n`);
    return path;
  } catch {
    return null;
  }
}

export function printSummary(report: RunReport): void {
  const { summary, scenarios, meta } = report;
  const pct = (n: number): string => `${(n * 100).toFixed(1)}%`;

  console.log("");
  console.log("─".repeat(64));
  console.log(`magik-repo evals — ${meta.timestamp}`);
  console.log(`  plugin:  ${meta.plugin_version}`);
  const fmt = (params: typeof meta.agent_params): string =>
    params.length > 0
      ? params.map((p) => `${p.id}=${p.value}`).join(",")
      : "(default)";
  console.log(`  agent:   ${meta.agent_model} ${fmt(meta.agent_params)}`);
  console.log(`  judge:   ${meta.judge_model} ${fmt(meta.judge_params)}`);
  console.log(`  cursor sdk: ${meta.cursor_sdk_version}`);
  console.log("─".repeat(64));

  for (const s of scenarios) {
    const tag =
      s.status === "ok"
        ? s.passed
          ? "PASS"
          : "FAIL"
        : s.status.toUpperCase();
    const score = s.status === "ok" ? pct(s.score) : "—";
    console.log(
      `  ${tag.padEnd(13)} ${s.scenario_id.padEnd(36)} ${score.padStart(7)}   (${(s.duration_ms / 1000).toFixed(1)}s)`,
    );
    if (s.error) console.log(`                ↳ ${s.error}`);
  }

  console.log("─".repeat(64));
  console.log(
    `  ${summary.passed} passed · ${summary.failed} failed · ${summary.skipped} skipped`,
  );
  console.log(
    `  mean score: ${pct(summary.mean_score)} · weighted: ${pct(summary.weighted_score)}`,
  );
  console.log("─".repeat(64));
}
