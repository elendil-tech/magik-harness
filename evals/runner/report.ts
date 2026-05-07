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

/**
 * Population standard deviation. Returns 0 for a single-sample input —
 * the report treats samples=1 as "no variance estimate" rather than NaN.
 */
function stddev(nums: number[]): number {
  if (nums.length <= 1) return 0;
  const mean = nums.reduce((a, n) => a + n, 0) / nums.length;
  const variance =
    nums.reduce((a, n) => a + (n - mean) ** 2, 0) / nums.length;
  return Math.sqrt(variance);
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
      condition: rec.condition,
      passed: false,
      score: 0,
      score_min: 0,
      score_max: 0,
      score_stddev: 0,
      pass_rate: 0,
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

  const scores = judges.map((j) => j.score);
  const meanScore = scores.reduce((a, s) => a + s, 0) / scores.length;
  const passRate =
    judges.filter((j) => j.passed).length / judges.length;

  return {
    scenario_id: rec.scenario.id,
    title: rec.scenario.title,
    condition: rec.condition,
    samples: judges,
    score: meanScore,
    score_min: Math.min(...scores),
    score_max: Math.max(...scores),
    score_stddev: stddev(scores),
    pass_rate: passRate,
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
 * `sampleTag` is either a 0-based sample index (single-condition runs)
 * or a `${condition}-${idx}` string (control-mode runs, so transcripts
 * from the two conditions don't overwrite each other).
 *
 * Returns the absolute path written. Never throws on disk errors —
 * a failed transcript dump is a debugging convenience, not a
 * blocking concern; the caller logs and moves on.
 */
export function writeTranscript(
  meta: RunMeta,
  scenarioId: string,
  sampleTag: number | string,
  transcript: AgentTranscript,
): string | null {
  try {
    if (!existsSync(RESULTS_DIR)) mkdirSync(RESULTS_DIR, { recursive: true });
    const stamp = meta.timestamp.replace(/[:.]/g, "-");
    const slug =
      typeof sampleTag === "number" ? `sample-${sampleTag + 1}` : sampleTag;
    const filename = `${stamp}__${scenarioId}__${slug}.transcript.json`;
    const path = join(RESULTS_DIR, filename);
    const body = {
      meta: {
        timestamp: meta.timestamp,
        scenario_id: scenarioId,
        sample_tag: sampleTag,
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
  const ppDelta = (n: number): string => {
    const v = (n * 100).toFixed(1);
    return n >= 0 ? `+${v}pp` : `${v}pp`;
  };

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

  // Group results by scenario_id so control-mode runs render the two
  // conditions together (with the delta) rather than as separate rows
  // far apart in the report. Single-condition runs still render one
  // row per scenario.
  const byScenario = new Map<string, ScenarioResult[]>();
  for (const s of scenarios) {
    const list = byScenario.get(s.scenario_id) ?? [];
    list.push(s);
    byScenario.set(s.scenario_id, list);
  }

  for (const [scenarioId, group] of byScenario) {
    // Single condition (the common case): one row, same as before.
    if (group.length === 1) {
      printScenarioRow(group[0]!, "");
      continue;
    }

    // Multi-condition (control mode): render harnessed first, then
    // content-only, then a delta line. Order is deterministic: harnessed
    // before content-only, then anything else by string sort (defensive).
    const sorted = [...group].sort((a, b) => {
      const order = (c?: string): number =>
        c === "harnessed" ? 0 : c === "content-only" ? 1 : 2;
      return order(a.condition) - order(b.condition);
    });
    console.log(`  ${scenarioId}`);
    for (const s of sorted) {
      const condTag = s.condition ?? "harnessed";
      printScenarioRow(s, `[${condTag}]`, /*indent*/ true);
    }
    const harnessed = sorted.find((s) => s.condition === "harnessed");
    const content = sorted.find((s) => s.condition === "content-only");
    if (
      harnessed &&
      content &&
      harnessed.status === "ok" &&
      content.status === "ok"
    ) {
      const delta = harnessed.score - content.score;
      console.log(
        `      delta ${ppDelta(delta).padStart(8)}   (harnessed − content-only)`,
      );
    }
  }

  function printScenarioRow(
    s: ScenarioResult,
    suffix: string,
    indent: boolean = false,
  ): void {
    const tag =
      s.status === "ok"
        ? s.passed
          ? "PASS"
          : "FAIL"
        : s.status.toUpperCase();
    const score = s.status === "ok" ? pct(s.score) : "—";
    const lead = indent ? "    " : "  ";
    const idCol = indent ? suffix : `${s.scenario_id} ${suffix}`.trim();
    console.log(
      `${lead}${tag.padEnd(13)} ${idCol.padEnd(36)} ${score.padStart(7)}   (${(s.duration_ms / 1000).toFixed(1)}s)`,
    );
    if (s.status === "ok" && s.samples.length > 1) {
      const passedCount = Math.round(s.pass_rate * s.samples.length);
      console.log(
        `${lead}            ↳ ${s.samples.length} samples · ` +
          `range ${pct(s.score_min)}–${pct(s.score_max)} · ` +
          `σ=${(s.score_stddev * 100).toFixed(1)}pp · ` +
          `${passedCount}/${s.samples.length} samples passed`,
      );
    }
    if (s.error) console.log(`${lead}            ↳ ${s.error}`);
  }

  console.log("─".repeat(64));
  console.log(
    `  ${summary.passed} passed · ${summary.failed} failed · ${summary.skipped} skipped`,
  );
  console.log(
    `  mean score: ${pct(summary.mean_score)} · weighted: ${pct(summary.weighted_score)}`,
  );

  // In control mode, also print an aggregate delta across all scenarios
  // that had both conditions. It's a one-number "did the harness help?"
  // signal — but read it alongside the per-scenario deltas, since a
  // mean can hide one-scenario regressions.
  const paired: Array<{ scenarioId: string; delta: number }> = [];
  for (const [scenarioId, group] of byScenario) {
    const harnessed = group.find(
      (s) => s.condition === "harnessed" && s.status === "ok",
    );
    const content = group.find(
      (s) => s.condition === "content-only" && s.status === "ok",
    );
    if (harnessed && content) {
      paired.push({ scenarioId, delta: harnessed.score - content.score });
    }
  }
  if (paired.length > 0) {
    const meanDelta =
      paired.reduce((a, p) => a + p.delta, 0) / paired.length;
    console.log(
      `  control: ${paired.length} scenario(s) paired · mean delta ${ppDelta(meanDelta)} (harnessed − content-only)`,
    );
  }
  console.log("─".repeat(64));
}
