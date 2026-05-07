/**
 * evals/runner/regression.ts — compare a fresh RunReport against a
 * previously captured baseline and identify per-(scenario, condition)
 * regressions.
 *
 * Why a fixed 15pp tolerance for now (instead of a per-scenario derived
 * one): with `samples: 3`, the `score_stddev` from a single run is
 * itself noisy — deriving a tolerance from a 3-point stddev produces
 * an unstable threshold that drifts run to run. Starting fixed and
 * deliberately generous lets the gate catch real collapses (which
 * almost always show up as 30-70pp drops, not 5-15pp ones) while we
 * accumulate enough baseline runs to compute stable per-scenario
 * stddevs. Once we have ≥ 5 historical baselines per scenario, the
 * `tolerance` argument should switch to a derived per-scenario value
 * (something like `2.5 × pooled_stddev`).
 */

import { readFileSync } from "node:fs";
import type {
  FixtureCondition,
  RunReport,
  ScenarioResult,
} from "./types.ts";

/**
 * Default per-scenario tolerance, in score units (0..1). 15pp = 0.15.
 * A scenario is flagged as a regression when
 *   `baseline.score - current.score > tolerance`.
 *
 * Improvements over baseline are NEVER flagged — only regressions.
 */
export const DEFAULT_REGRESSION_TOLERANCE = 0.15;

export interface RegressionEntry {
  scenario_id: string;
  condition: FixtureCondition;
  baseline_score: number;
  current_score: number;
  /** `current - baseline` (negative for regressions, positive for wins). */
  delta: number;
  /** Always `delta < -tolerance` for entries returned in `regressions`. */
  is_regression: boolean;
  /** "baseline-only" means the baseline had this entry but the current run did not. */
  status: "compared" | "baseline-only" | "current-only";
}

export interface RegressionReport {
  /** Tolerance used for this comparison, in score units. */
  tolerance: number;
  /** Path the baseline was loaded from. */
  baseline_path: string;
  /** Plugin version at the time the baseline was captured (if recorded). */
  baseline_plugin_version?: string;
  /** All paired entries — the operator-facing comparison table. */
  entries: RegressionEntry[];
  /** Subset of entries flagged as regressions (delta < -tolerance). */
  regressions: RegressionEntry[];
}

/**
 * Load and parse a baseline RunReport. We accept either the canonical
 * RunReport shape (`{ meta, scenarios, summary }`) or — defensively —
 * a bare scenarios array, in case anyone hand-crafts a baseline file.
 */
function loadBaseline(path: string): RunReport | { scenarios: ScenarioResult[] } {
  let raw: string;
  try {
    raw = readFileSync(path, "utf-8");
  } catch (err) {
    throw new Error(
      `failed to read baseline at "${path}": ${(err as Error).message}`,
    );
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    throw new Error(
      `baseline at "${path}" is not valid JSON: ${(err as Error).message}`,
    );
  }
  if (
    typeof parsed === "object" &&
    parsed !== null &&
    "scenarios" in parsed &&
    Array.isArray((parsed as { scenarios: unknown }).scenarios)
  ) {
    return parsed as RunReport;
  }
  if (Array.isArray(parsed)) {
    return { scenarios: parsed as ScenarioResult[] };
  }
  throw new Error(
    `baseline at "${path}" has unexpected shape: expected RunReport or scenarios[]`,
  );
}

/**
 * Treat `condition === undefined` as "harnessed" — keeps us
 * compatible with pre-v0.6.0 baselines that didn't track conditions.
 */
function normalizedCondition(s: ScenarioResult): FixtureCondition {
  return s.condition ?? "harnessed";
}

function pairKey(scenarioId: string, condition: FixtureCondition): string {
  return `${scenarioId}::${condition}`;
}

/**
 * Compare a fresh run against a baseline. Pairs entries by
 * `(scenario_id, condition)`; entries present in only one side are
 * surfaced (status = "baseline-only" / "current-only") but never
 * flagged as regressions — they reflect changes to the scenario set,
 * not regressions in agent behavior.
 *
 * Skipped or errored scenarios in the current run still count as
 * regressions if the baseline had them passing, because a judge or
 * agent error IS a real signal — the harness silently broke.
 */
export function checkRegression(
  current: RunReport,
  baselinePath: string,
  options: { tolerance?: number } = {},
): RegressionReport {
  const tolerance = options.tolerance ?? DEFAULT_REGRESSION_TOLERANCE;
  const baseline = loadBaseline(baselinePath);

  const baselineByKey = new Map<string, ScenarioResult>();
  for (const s of baseline.scenarios) {
    baselineByKey.set(pairKey(s.scenario_id, normalizedCondition(s)), s);
  }
  const currentByKey = new Map<string, ScenarioResult>();
  for (const s of current.scenarios) {
    currentByKey.set(pairKey(s.scenario_id, normalizedCondition(s)), s);
  }

  const entries: RegressionEntry[] = [];
  const seen = new Set<string>();

  for (const [key, b] of baselineByKey) {
    seen.add(key);
    const c = currentByKey.get(key);
    if (!c) {
      entries.push({
        scenario_id: b.scenario_id,
        condition: normalizedCondition(b),
        baseline_score: b.score,
        current_score: 0,
        delta: -b.score,
        is_regression: false,
        status: "baseline-only",
      });
      continue;
    }
    const delta = c.score - b.score;
    entries.push({
      scenario_id: b.scenario_id,
      condition: normalizedCondition(b),
      baseline_score: b.score,
      current_score: c.score,
      delta,
      is_regression: delta < -tolerance,
      status: "compared",
    });
  }
  for (const [key, c] of currentByKey) {
    if (seen.has(key)) continue;
    entries.push({
      scenario_id: c.scenario_id,
      condition: normalizedCondition(c),
      baseline_score: 0,
      current_score: c.score,
      delta: c.score,
      is_regression: false,
      status: "current-only",
    });
  }

  entries.sort((a, b) => {
    if (a.scenario_id !== b.scenario_id) {
      return a.scenario_id.localeCompare(b.scenario_id);
    }
    const order = (cond: FixtureCondition): number =>
      cond === "harnessed" ? 0 : 1;
    return order(a.condition) - order(b.condition);
  });

  return {
    tolerance,
    baseline_path: baselinePath,
    baseline_plugin_version:
      "meta" in baseline && baseline.meta
        ? baseline.meta.plugin_version
        : undefined,
    entries,
    regressions: entries.filter((e) => e.is_regression),
  };
}

/**
 * Pretty-print a regression report to stdout. Always prints, regardless
 * of whether anything regressed — operators want to see the comparison
 * even on clean runs ("v0.6.1 won by +3.2pp on scenario 02"). Caller
 * decides what to do with the result.regressions list (e.g. exit
 * non-zero unless --accept-regression was passed).
 */
export function printRegressionReport(report: RegressionReport): void {
  const pct = (n: number): string => `${(n * 100).toFixed(1)}%`;
  const ppDelta = (n: number): string => {
    const v = (n * 100).toFixed(1);
    return n >= 0 ? `+${v}pp` : `${v}pp`;
  };

  console.log("");
  console.log("─".repeat(72));
  const versionTag = report.baseline_plugin_version
    ? ` (v${report.baseline_plugin_version})`
    : "";
  console.log(
    `regression check vs. baseline${versionTag}: ${report.baseline_path}`,
  );
  console.log(`  tolerance: ${pct(report.tolerance)}pp`);
  console.log("─".repeat(72));

  for (const e of report.entries) {
    const tag = e.is_regression
      ? "REGRESS"
      : e.status === "baseline-only"
        ? "MISSING"
        : e.status === "current-only"
          ? "NEW"
          : e.delta >= 0
            ? "OK"
            : "DIP";
    const condTag = `[${e.condition}]`;
    const scoreCol =
      e.status === "baseline-only"
        ? `${pct(e.baseline_score)} → —`
        : e.status === "current-only"
          ? `— → ${pct(e.current_score)}`
          : `${pct(e.baseline_score)} → ${pct(e.current_score)}`;
    console.log(
      `  ${tag.padEnd(8)} ${e.scenario_id.padEnd(28)} ${condTag.padEnd(16)} ${scoreCol.padStart(20)}   ${ppDelta(e.delta).padStart(8)}`,
    );
  }

  console.log("─".repeat(72));
  if (report.regressions.length === 0) {
    console.log("  no regressions detected.");
  } else {
    console.log(
      `  ${report.regressions.length} regression(s) at tolerance ${pct(report.tolerance)}pp.`,
    );
  }
  console.log("─".repeat(72));
}
