#!/usr/bin/env -S npx --yes tsx
/**
 * scripts/build-results.ts — generate evals/RESULTS.md from one or
 * more baseline files under evals/baselines/.
 *
 * Picks the newest baseline by mtime as the headline result, and
 * lists older baselines as history. Outputs a single GitHub-flavored
 * markdown file with:
 *   - Headline summary (mean / weighted / pass-fail counts).
 *   - Configuration used (agent + judge model + params).
 *   - Per-scenario table with verdict + score + link to scenario YAML.
 *   - A history list pointing at older baselines.
 *
 * The intent is for this file to be the public face of the eval
 * harness — anyone landing on the repo can read it to see what's
 * being tested and how the harness scores. Re-run after adding a new
 * baseline.
 *
 * Usage:
 *   pnpm exec tsx scripts/build-results.ts             # writes evals/RESULTS.md
 *   pnpm exec tsx scripts/build-results.ts --check     # exit 1 if RESULTS.md is stale
 *   pnpm exec tsx scripts/build-results.ts --print     # print to stdout, don't write
 */

import { readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const PLUGIN_ROOT = dirname(SCRIPT_DIR);
const BASELINES_DIR = join(PLUGIN_ROOT, "evals", "baselines");
const SCENARIOS_DIR = join(PLUGIN_ROOT, "evals", "scenarios");
const OUT_PATH = join(PLUGIN_ROOT, "evals", "RESULTS.md");

interface Expectation {
  label: string;
  met: boolean;
  evidence: string;
}
interface Sample {
  expectations: Expectation[];
  notes: string;
  score: number;
  passed: boolean;
}
interface ScenarioResult {
  scenario_id: string;
  title: string;
  /**
   * Which fixture the agent ran against. Optional for backwards
   * compatibility with pre-v0.6.0 baselines (treat undefined as
   * "harnessed").
   */
  condition?: "harnessed" | "content-only";
  status: string;
  score: number;
  /**
   * Multi-sample variance fields. Optional for backwards compatibility:
   * pre-v0.6.0 reports lacked these; treat absent values as "no
   * variance signal" (single-sample run).
   */
  score_min?: number;
  score_max?: number;
  score_stddev?: number;
  pass_rate?: number;
  passed: boolean;
  duration_ms: number;
  transcript_chars: number;
  samples: Sample[];
  error?: string;
}
interface ModelParam {
  id: string;
  value: string;
}
interface RunMeta {
  timestamp: string;
  plugin_version: string;
  agent_model: string;
  agent_params: ModelParam[];
  judge_model: string;
  judge_params: ModelParam[];
  cursor_sdk_version: string;
  host: string;
}
interface Report {
  meta: RunMeta;
  scenarios: ScenarioResult[];
  summary: {
    total: number;
    passed: number;
    failed: number;
    skipped: number;
    mean_score: number;
    weighted_score: number;
  };
}
interface Baseline {
  filename: string;
  mtime: number;
  report: Report;
}

function listBaselines(): Baseline[] {
  let entries: string[];
  try {
    entries = readdirSync(BASELINES_DIR);
  } catch {
    return [];
  }
  const out: Baseline[] = [];
  for (const f of entries) {
    if (!f.endsWith(".json")) continue;
    const path = join(BASELINES_DIR, f);
    const stat = statSync(path);
    if (!stat.isFile()) continue;
    const report = JSON.parse(readFileSync(path, "utf-8")) as Report;
    out.push({ filename: f, mtime: stat.mtimeMs, report });
  }
  // Sort newest-first by file mtime; ties broken by report timestamp.
  out.sort(
    (a, b) => b.mtime - a.mtime || b.report.meta.timestamp.localeCompare(a.report.meta.timestamp),
  );
  return out;
}

function fmtParams(params: ModelParam[]): string {
  return params.length === 0
    ? "_default_"
    : params.map((p) => `\`${p.id}=${p.value}\``).join(", ");
}

function fmtPct(n: number): string {
  return `${(n * 100).toFixed(1)}%`;
}

function statusBadge(s: ScenarioResult): string {
  if (s.status !== "ok") return `❗ ${s.status}`;
  return s.passed ? "✅ pass" : "❌ fail";
}

function fmtPpDelta(n: number): string {
  const v = (n * 100).toFixed(1);
  return n >= 0 ? `+${v}pp` : `${v}pp`;
}

function normalizedCondition(s: ScenarioResult): "harnessed" | "content-only" {
  return s.condition ?? "harnessed";
}

/**
 * Group scenario results by `scenario_id`. When `--control` was used
 * each scenario produces two entries (harnessed + content-only); when
 * not, one entry. The grouped list keeps both entries together so the
 * rendered tables can show the per-condition delta inline.
 */
function groupByScenario(
  scenarios: ScenarioResult[],
): Map<string, ScenarioResult[]> {
  const map = new Map<string, ScenarioResult[]>();
  for (const s of scenarios) {
    const list = map.get(s.scenario_id) ?? [];
    list.push(s);
    map.set(s.scenario_id, list);
  }
  for (const [id, list] of map) {
    list.sort((a, b) => {
      const order = (c: "harnessed" | "content-only"): number =>
        c === "harnessed" ? 0 : 1;
      return order(normalizedCondition(a)) - order(normalizedCondition(b));
    });
    map.set(id, list);
  }
  return map;
}

/** True if any scenario carries an explicit `condition` field — i.e. the run was --control. */
function hasControlData(scenarios: ScenarioResult[]): boolean {
  return scenarios.some((s) => s.condition !== undefined);
}

function escapeMd(s: string): string {
  return s.replace(/\|/g, "\\|").replace(/\n/g, " ");
}

function scenarioYamlLink(scenarioId: string): string {
  // Most stable resolution: glob for files in scenarios/ that start
  // with the id. Stays correct even if scenarios get archived /
  // renamed in the future.
  try {
    const files = readdirSync(SCENARIOS_DIR);
    const match = files.find((f) => f.startsWith(`${scenarioId}.`));
    if (match) {
      const rel = relative(
        PLUGIN_ROOT,
        join(SCENARIOS_DIR, match),
      ).split("\\").join("/");
      return `./${rel.replace(/^evals\//, "")}`;
    }
  } catch {
    // fall through
  }
  return `./scenarios/${scenarioId}.yaml`;
}

function renderHeadline(b: Baseline): string {
  const { meta, summary, scenarios } = b.report;
  const isControl = hasControlData(scenarios);

  // In control-mode runs the harnessed condition's pass/fail is the
  // signal that matches "did the harness work?". The content-only
  // condition is *expected* to fail in many scenarios — that's what
  // makes the delta meaningful — so summing pass/fail across both
  // conditions gives a misleading headline. Compute a harnessed-only
  // headline summary for control runs; fall back to the report's
  // built-in summary for legacy single-condition runs.
  const harnessedScenarios = isControl
    ? scenarios.filter((s) => normalizedCondition(s) === "harnessed")
    : scenarios;
  const headlinePassed = isControl
    ? harnessedScenarios.filter((s) => s.status === "ok" && s.passed).length
    : summary.passed;
  const headlineFailed = isControl
    ? harnessedScenarios.filter((s) => s.status === "ok" && !s.passed).length
    : summary.failed;
  const headlineSkipped = isControl
    ? harnessedScenarios.filter((s) => s.status !== "ok").length
    : summary.skipped;
  const headlineTotal = isControl ? harnessedScenarios.length : summary.total;
  const headlineMean = isControl
    ? harnessedScenarios.reduce((a, s) => a + (s.status === "ok" ? s.score : 0), 0) /
      Math.max(harnessedScenarios.length, 1)
    : summary.mean_score;

  const ok = headlinePassed === headlineTotal && headlineSkipped === 0;
  const headlineEmoji = ok ? "🟢" : headlinePassed > 0 ? "🟡" : "🔴";

  const lines: string[] = [];
  lines.push(`# Eval results`);
  lines.push("");
  lines.push(
    `> Auto-generated from \`evals/baselines/${b.filename}\`. Re-run \`pnpm exec tsx scripts/build-results.ts\` after each new baseline. See [evals/README.md](./README.md) for the methodology.`,
  );
  lines.push("");
  const conditionTag = isControl ? " (harnessed condition)" : "";
  lines.push(
    `## ${headlineEmoji} ${fmtPct(headlineMean)} mean${conditionTag}`,
  );
  lines.push("");
  lines.push(
    `**${headlinePassed}** passed · **${headlineFailed}** failed · **${headlineSkipped}** skipped (out of ${headlineTotal} scenarios)`,
  );
  if (isControl) {
    lines.push("");
    lines.push(
      `_Control mode: each scenario also ran in a content-only condition (no harness wiring); see the per-scenario delta below for the harness's contribution to self-steering._`,
    );
  }
  lines.push("");
  lines.push(`## Configuration`);
  lines.push("");
  lines.push(`| | |`);
  lines.push(`|---|---|`);
  lines.push(`| Plugin version | \`${meta.plugin_version}\` |`);
  lines.push(`| Agent under test | \`${meta.agent_model}\` (${fmtParams(meta.agent_params)}) |`);
  lines.push(`| Judge | \`${meta.judge_model}\` (${fmtParams(meta.judge_params)}) |`);
  lines.push(`| Cursor SDK | \`${meta.cursor_sdk_version}\` |`);
  lines.push(`| Run timestamp | \`${meta.timestamp}\` |`);
  lines.push(`| Host | \`${meta.host}\` |`);
  lines.push("");

  const grouped = groupByScenario(scenarios);

  lines.push(`## Per-scenario results`);
  lines.push("");
  if (isControl) {
    // Control-mode runs measure the harness's contribution to self-
    // steering by holding *content* constant and varying the *system*
    // around it. The delta between conditions is the load-bearing
    // signal — a positive delta means the harness raised the agent's
    // score above what raw markdown alone would deliver.
    lines.push(
      `| Scenario | Harnessed | Content-only | Δ (harnessed − content-only) | Headline finding (harnessed sample) |`,
    );
    lines.push(`|---|---|---|---|---|`);
    for (const [scenarioId, group] of grouped) {
      const harnessed = group.find(
        (g) => normalizedCondition(g) === "harnessed",
      );
      const content = group.find(
        (g) => normalizedCondition(g) === "content-only",
      );
      const link = scenarioYamlLink(scenarioId);
      const title = harnessed?.title ?? content?.title ?? scenarioId;
      const fmtCell = (s: ScenarioResult | undefined): string => {
        if (!s) return "—";
        if (s.status !== "ok") return `❗ ${s.status}`;
        const pct = fmtPct(s.score);
        const variance =
          s.samples.length > 1 && s.score_min !== undefined && s.score_max !== undefined
            ? ` <sub>(${fmtPct(s.score_min)}–${fmtPct(s.score_max)})</sub>`
            : "";
        const verdict = s.passed ? "✅" : "❌";
        return `${verdict} ${pct}${variance}`;
      };
      const delta =
        harnessed && content && harnessed.status === "ok" && content.status === "ok"
          ? fmtPpDelta(harnessed.score - content.score)
          : "—";
      const sample = harnessed?.samples[0] ?? content?.samples[0];
      const headline = (harnessed ?? content)?.error
        ? `_${escapeMd((harnessed ?? content)!.error!)}_`
        : sample
          ? escapeMd(sample.notes.split(". ")[0]!.slice(0, 160))
          : "—";
      lines.push(
        `| [${scenarioId}](${link}) — ${escapeMd(title)} | ${fmtCell(harnessed)} | ${fmtCell(content)} | ${delta} | ${headline} |`,
      );
    }
  } else {
    lines.push(
      `| Scenario | Status | Score | Turns | Headline finding |`,
    );
    lines.push(`|---|---|---|---|---|`);
    for (const s of scenarios) {
      const status = statusBadge(s);
      const score = s.status === "ok" ? fmtPct(s.score) : "—";
      const variance =
        s.status === "ok" &&
        s.samples.length > 1 &&
        s.score_min !== undefined &&
        s.score_max !== undefined
          ? ` <sub>(${fmtPct(s.score_min)}–${fmtPct(s.score_max)})</sub>`
          : "";
      const sample = s.samples[0];
      const turns = sample ? sample.expectations.length : 0;
      const headline = s.error
        ? `_${escapeMd(s.error)}_`
        : sample
          ? escapeMd(sample.notes.split(". ")[0]!.slice(0, 160))
          : "—";
      const link = scenarioYamlLink(s.scenario_id);
      lines.push(
        `| [${s.scenario_id}](${link}) — ${escapeMd(s.title)} | ${status} | ${score}${variance} | ${turns} | ${headline} |`,
      );
    }
  }
  lines.push("");

  // Aggregate control-mode delta — one number for "did the harness
  // help?" across the suite.
  if (isControl) {
    const paired: number[] = [];
    for (const [, group] of grouped) {
      const h = group.find((g) => normalizedCondition(g) === "harnessed");
      const c = group.find((g) => normalizedCondition(g) === "content-only");
      if (h && c && h.status === "ok" && c.status === "ok") {
        paired.push(h.score - c.score);
      }
    }
    if (paired.length > 0) {
      const meanDelta =
        paired.reduce((a, n) => a + n, 0) / paired.length;
      lines.push(
        `**Control-mode aggregate:** ${paired.length} scenario(s) paired · mean Δ ${fmtPpDelta(meanDelta)} (harnessed − content-only).`,
      );
      lines.push("");
    }
  }

  // Per-scenario expectation breakdown (collapsible). Useful for
  // anyone who wants to see exactly what was checked, not just the
  // top-line score.
  lines.push(`## Expectation breakdown`);
  lines.push("");
  for (const [scenarioId, group] of grouped) {
    for (const s of group) {
      const condTag =
        s.condition !== undefined ? ` [${s.condition}]` : "";
      lines.push(`<details>`);
      lines.push(
        `<summary><strong>${scenarioId}${condTag}</strong> — ${escapeMd(s.title)} · ${statusBadge(s)} ${s.status === "ok" ? `· ${fmtPct(s.score)}` : ""}</summary>`,
      );
      lines.push("");
      if (s.error) {
        lines.push(`Error: \`${s.error}\``);
        lines.push("");
      }
      // Surface the variance band for multi-sample runs.
      if (
        s.status === "ok" &&
        s.samples.length > 1 &&
        s.score_min !== undefined &&
        s.score_max !== undefined
      ) {
        const stddevPp =
          s.score_stddev !== undefined
            ? `, σ=${(s.score_stddev * 100).toFixed(1)}pp`
            : "";
        const passRate =
          s.pass_rate !== undefined
            ? `, ${Math.round(s.pass_rate * s.samples.length)}/${s.samples.length} samples passed`
            : "";
        lines.push(
          `**Variance:** ${s.samples.length} samples, range ${fmtPct(s.score_min)}–${fmtPct(s.score_max)}${stddevPp}${passRate}.`,
        );
        lines.push("");
      }
      const sample = s.samples[0];
      if (sample) {
        lines.push(`**Notes:** ${sample.notes}`);
        lines.push("");
        for (const e of sample.expectations) {
          const icon = e.met ? "✓" : "✗";
          lines.push(`- ${icon} **${escapeMd(e.label)}**`);
          lines.push(`  ${escapeMd(e.evidence)}`);
        }
      }
      lines.push("");
      lines.push(`</details>`);
      lines.push("");
    }
  }

  return lines.join("\n");
}

function renderHistory(baselines: Baseline[]): string {
  if (baselines.length <= 1) return "";
  const lines: string[] = [];
  lines.push(`## Baseline history`);
  lines.push("");
  lines.push(
    `| Baseline | Plugin | Agent | Judge | Mean | Weighted | Pass / Fail / Skip |`,
  );
  lines.push(`|---|---|---|---|---|---|---|`);
  for (const b of baselines) {
    const m = b.report.meta;
    const s = b.report.summary;
    lines.push(
      `| [\`${b.filename}\`](./baselines/${b.filename}) | \`${m.plugin_version}\` | \`${m.agent_model}\` | \`${m.judge_model}\` | ${fmtPct(s.mean_score)} | ${fmtPct(s.weighted_score)} | ${s.passed} / ${s.failed} / ${s.skipped} |`,
    );
  }
  lines.push("");
  lines.push(
    `Older baselines remain in [\`evals/baselines/\`](./baselines/) so a regression diff is always git-traceable.`,
  );
  return lines.join("\n");
}

function build(): string {
  const baselines = listBaselines();
  if (baselines.length === 0) {
    return [
      `# Eval results`,
      "",
      `_No baselines yet._ Run \`pnpm eval\` and copy the result file from \`evals/results/\` into \`evals/baselines/\`, then re-run this script.`,
      "",
    ].join("\n");
  }

  const headline = renderHeadline(baselines[0]!);
  const history = renderHistory(baselines);
  const footer = [
    "",
    "## Methodology",
    "",
    "Each scenario boots a fresh Cursor SDK agent in a tmpdir cwd containing a built copy of the harness, drives it through 1–3 user turns, then asks an LLM judge to score the transcript against an expectation rubric. Expectations are mostly mechanical (`must_invoke_tools`, `must_cite`) plus a small set of semantic checks (`must_surface_concepts`, `must_not`). The judge can only see the structured transcript — assistant text, tool invocations, files read, files written — and emits a JSON verdict per expectation.",
    "",
    "Both the agent under test and the judge run on the Cursor SDK. See [evals/README.md](./README.md) for the full architecture, scenario format, and how to add a new scenario.",
    "",
  ].join("\n");

  return `${headline}${history}${footer}`;
}

function main(): void {
  const flags = new Set(process.argv.slice(2));
  const out = build();

  if (flags.has("--print")) {
    process.stdout.write(out);
    return;
  }

  if (flags.has("--check")) {
    let existing = "";
    try {
      existing = readFileSync(OUT_PATH, "utf-8");
    } catch {
      existing = "";
    }
    if (existing.trimEnd() !== out.trimEnd()) {
      console.error(
        `evals/RESULTS.md is stale. Re-run \`pnpm exec tsx scripts/build-results.ts\` and commit the result.`,
      );
      process.exit(1);
    }
    return;
  }

  writeFileSync(OUT_PATH, out.endsWith("\n") ? out : `${out}\n`);
  console.log(`wrote ${relative(PLUGIN_ROOT, OUT_PATH)}`);
}

main();
