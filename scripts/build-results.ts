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
  status: string;
  score: number;
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
  const ok = summary.passed === summary.total;
  const headlineEmoji = ok ? "🟢" : summary.passed > 0 ? "🟡" : "🔴";

  const lines: string[] = [];
  lines.push(`# Eval results`);
  lines.push("");
  lines.push(
    `> Auto-generated from \`evals/baselines/${b.filename}\`. Re-run \`pnpm exec tsx scripts/build-results.ts\` after each new baseline. See [evals/README.md](./README.md) for the methodology.`,
  );
  lines.push("");
  lines.push(`## ${headlineEmoji} ${fmtPct(summary.mean_score)} mean · ${fmtPct(summary.weighted_score)} weighted`);
  lines.push("");
  lines.push(
    `**${summary.passed}** passed · **${summary.failed}** failed · **${summary.skipped}** skipped (out of ${summary.total} scenarios)`,
  );
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

  lines.push(`## Per-scenario results`);
  lines.push("");
  lines.push(
    `| Scenario | Status | Score | Turns | Headline finding |`,
  );
  lines.push(`|---|---|---|---|---|`);
  for (const s of scenarios) {
    const status = statusBadge(s);
    const score = s.status === "ok" ? fmtPct(s.score) : "—";
    const sample = s.samples[0];
    const turns = sample
      ? sample.expectations.length
      : 0;
    const headline = s.error
      ? `_${escapeMd(s.error)}_`
      : sample
        ? escapeMd(sample.notes.split(". ")[0]!.slice(0, 160))
        : "—";
    const link = scenarioYamlLink(s.scenario_id);
    lines.push(
      `| [${s.scenario_id}](${link}) — ${escapeMd(s.title)} | ${status} | ${score} | ${turns} | ${headline} |`,
    );
  }
  lines.push("");

  // Per-scenario expectation breakdown (collapsible). Useful for
  // anyone who wants to see exactly what was checked, not just the
  // top-line score.
  lines.push(`## Expectation breakdown`);
  lines.push("");
  for (const s of scenarios) {
    lines.push(`<details>`);
    lines.push(
      `<summary><strong>${s.scenario_id}</strong> — ${escapeMd(s.title)} · ${statusBadge(s)} ${s.status === "ok" ? `· ${fmtPct(s.score)}` : ""}</summary>`,
    );
    lines.push("");
    if (s.error) {
      lines.push(`Error: \`${s.error}\``);
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
