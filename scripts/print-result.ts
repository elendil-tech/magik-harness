#!/usr/bin/env -S npx --yes tsx
/**
 * scripts/print-result.ts — pretty-print a result file's per-scenario
 * verdicts and expectation breakdowns. Used to triage a baseline run
 * without having to read JSON by eye.
 *
 * Usage:
 *   pnpm exec tsx scripts/print-result.ts <result.json>
 *   pnpm exec tsx scripts/print-result.ts evals/results/<latest>.json
 */

import { readFileSync } from "node:fs";

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
interface Scenario {
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
interface Report {
  meta: { agent_model: string; judge_model: string; timestamp: string };
  scenarios: Scenario[];
  summary: { mean_score: number; weighted_score: number };
}

function main(): void {
  const path = process.argv[2];
  if (!path) {
    console.error("usage: print-result.ts <result.json>");
    process.exit(1);
  }
  const r = JSON.parse(readFileSync(path, "utf-8")) as Report;
  console.log(`agent=${r.meta.agent_model}  judge=${r.meta.judge_model}`);
  console.log(`timestamp=${r.meta.timestamp}`);
  console.log("");

  for (const s of r.scenarios) {
    const tag = s.status === "ok" ? (s.passed ? "PASS" : "FAIL") : s.status.toUpperCase();
    console.log("─".repeat(80));
    console.log(
      `${tag.padEnd(13)} ${s.scenario_id}   score=${(s.score * 100).toFixed(0)}%   dur=${(s.duration_ms / 1000).toFixed(1)}s   transcript=${s.transcript_chars}c`,
    );
    if (s.error) {
      console.log(`  ↳ error: ${s.error}`);
    }
    if (s.samples[0]) {
      console.log(`  notes: ${s.samples[0].notes}`);
      console.log("");
      for (const e of s.samples[0].expectations) {
        const icon = e.met ? "✓" : "✗";
        console.log(`  ${icon} ${e.label}`);
        console.log(`      ${e.evidence}`);
      }
    }
  }
  console.log("─".repeat(80));
  console.log(
    `mean=${(r.summary.mean_score * 100).toFixed(1)}%  weighted=${(r.summary.weighted_score * 100).toFixed(1)}%`,
  );
}

main();
