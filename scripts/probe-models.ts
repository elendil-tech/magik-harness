#!/usr/bin/env -S npx --yes tsx
/**
 * scripts/probe-models.ts — probe a list of Cursor model IDs (and
 * optionally variants) with a tiny `Agent.prompt` call. Reports a
 * table of pass/fail with duration. Skips `effort=max` per the
 * harness's "max mode off" rule.
 *
 * Usage:
 *   pnpm exec tsx scripts/probe-models.ts [tier]
 *     tier = top | second | third | all (default: all)
 *
 * Adds variants for models that have parameters discoverable via
 * inspect-models (e.g. opus thinking=true effort=xhigh).
 */

import "../evals/runner/bootstrap.ts";

import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Agent } from "@cursor/sdk";

interface Probe {
  modelId: string;
  params?: Array<{ id: string; value: string }>;
  label: string;
  tier: "top" | "second" | "third";
}

// Already tested earlier: composer-2 ✓, claude-sonnet-4-6 ✓,
// claude-opus-4-6 ✓, claude-opus-4-5 ✓, claude-opus-4-7 ✗, gpt-5.5 ✗.
// Skipping grok per user. NEVER use effort=max / reasoning=max per
// the harness rule (extra-high is the cap).
const PROBES_HIGH_VARIANTS: Probe[] = [
  // --- max-reasoning configs (NOT max mode) for working top models ---
  {
    modelId: "claude-opus-4-6",
    params: [
      { id: "thinking", value: "true" },
      { id: "context", value: "1m" },
      { id: "effort", value: "high" },
      { id: "fast", value: "false" },
    ],
    label: "claude-opus-4-6 (thinking=t, 1m, effort=high, fast=f) ⭐strong",
    tier: "top",
  },
  {
    modelId: "claude-opus-4-5",
    params: [
      { id: "thinking", value: "true" },
      { id: "effort", value: "high" },
    ],
    label: "claude-opus-4-5 (thinking=t, effort=high) ⭐strong",
    tier: "top",
  },
  {
    modelId: "claude-sonnet-4-6",
    params: [
      { id: "thinking", value: "true" },
      { id: "context", value: "1m" },
      { id: "effort", value: "high" },
    ],
    label: "claude-sonnet-4-6 (thinking=t, 1m, effort=high) ⭐strong",
    tier: "top",
  },
  {
    modelId: "claude-sonnet-4-5",
    params: [{ id: "thinking", value: "true" }],
    label: "claude-sonnet-4-5 (thinking=t)",
    tier: "top",
  },
  {
    modelId: "gpt-5.3-codex",
    params: [
      { id: "reasoning", value: "extra-high" },
      { id: "fast", value: "false" },
    ],
    label: "gpt-5.3-codex (reasoning=xhigh, fast=f) ⭐strong",
    tier: "top",
  },
  {
    modelId: "gpt-5.2-codex",
    params: [
      { id: "reasoning", value: "extra-high" },
      { id: "fast", value: "false" },
    ],
    label: "gpt-5.2-codex (reasoning=xhigh, fast=f) ⭐strong",
    tier: "top",
  },
  {
    modelId: "gpt-5.1-codex-max",
    params: [
      { id: "reasoning", value: "extra-high" },
      { id: "fast", value: "false" },
    ],
    label: "gpt-5.1-codex-max (reasoning=xhigh, fast=f) ⭐strong",
    tier: "top",
  },
  {
    modelId: "gpt-5.2",
    params: [
      { id: "reasoning", value: "extra-high" },
      { id: "fast", value: "false" },
    ],
    label: "gpt-5.2 (reasoning=xhigh, fast=f) ⭐strong",
    tier: "top",
  },
  {
    modelId: "gpt-5.1",
    params: [{ id: "reasoning", value: "high" }],
    label: "gpt-5.1 (reasoning=high) — no xhigh tier",
    tier: "top",
  },
];

const PROBES: Probe[] = [
  // -------- TOP TIER --------------------------------------------------
  // Frontier reasoning. Try a few new ones, plus high-effort variants
  // of models we already know work, to confirm they survive max-effort
  // configurations (xhigh, NOT max).
  { modelId: "gpt-5.4", label: "gpt-5.4 (default)", tier: "top" },
  {
    modelId: "gpt-5.3-codex",
    label: "gpt-5.3-codex (default)",
    tier: "top",
  },
  { modelId: "gemini-3.1-pro", label: "gemini-3.1-pro (default)", tier: "top" },
  {
    modelId: "claude-opus-4-6",
    params: [
      { id: "thinking", value: "true" },
      { id: "context", value: "1m" },
      { id: "effort", value: "high" },
      { id: "fast", value: "false" },
    ],
    label: "claude-opus-4-6 (thinking=true,1m,effort=high,fast=false)",
    tier: "top",
  },
  {
    modelId: "claude-opus-4-5",
    params: [
      { id: "thinking", value: "true" },
      { id: "effort", value: "high" },
    ],
    label: "claude-opus-4-5 (thinking=true,effort=high)",
    tier: "top",
  },
  // -------- SECOND TIER -----------------------------------------------
  { modelId: "gpt-5.4-mini", label: "gpt-5.4-mini (default)", tier: "second" },
  { modelId: "gpt-5.2", label: "gpt-5.2 (default)", tier: "second" },
  { modelId: "gpt-5.2-codex", label: "gpt-5.2-codex (default)", tier: "second" },
  {
    modelId: "gpt-5.1-codex-max",
    label: "gpt-5.1-codex-max (default)",
    tier: "second",
  },
  {
    modelId: "claude-sonnet-4-5",
    label: "claude-sonnet-4-5 (default)",
    tier: "second",
  },
  { modelId: "gemini-3-flash", label: "gemini-3-flash (default)", tier: "second" },
  // -------- THIRD TIER ------------------------------------------------
  { modelId: "gpt-5.4-nano", label: "gpt-5.4-nano (default)", tier: "third" },
  { modelId: "gpt-5.1", label: "gpt-5.1 (default)", tier: "third" },
  {
    modelId: "gpt-5.1-codex-mini",
    label: "gpt-5.1-codex-mini (default)",
    tier: "third",
  },
  {
    modelId: "claude-haiku-4-5",
    label: "claude-haiku-4-5 (default)",
    tier: "third",
  },
  { modelId: "claude-sonnet-4", label: "claude-sonnet-4 (default)", tier: "third" },
  { modelId: "gpt-5-mini", label: "gpt-5-mini (default)", tier: "third" },
  {
    modelId: "gemini-2.5-flash",
    label: "gemini-2.5-flash (default)",
    tier: "third",
  },
  { modelId: "composer-1.5", label: "composer-1.5 (default)", tier: "third" },
  {
    modelId: "gpt-5.3-codex-spark",
    label: "gpt-5.3-codex-spark (default)",
    tier: "third",
  },
  { modelId: "kimi-k2.5", label: "kimi-k2.5 (default)", tier: "third" },
];

interface ProbeResult {
  probe: Probe;
  status: "finished" | "error" | "threw";
  durationMs: number;
  output: string;
  error?: string;
}

async function probeOne(probe: Probe, apiKey: string): Promise<ProbeResult> {
  const cwd = mkdtempSync(join(tmpdir(), "probe-"));
  const start = Date.now();
  try {
    const result = await Agent.prompt(
      'Reply with exactly: { "ok": true }. JSON only, no tools, no commentary.',
      {
        apiKey,
        model: { id: probe.modelId, params: probe.params },
        local: { cwd, settingSources: [] },
      },
    );
    return {
      probe,
      status: result.status === "finished" ? "finished" : "error",
      durationMs: result.durationMs ?? Date.now() - start,
      output: (result.result ?? "").slice(0, 80),
    };
  } catch (err) {
    return {
      probe,
      status: "threw",
      durationMs: Date.now() - start,
      output: "",
      error: (err as Error).message.slice(0, 200),
    };
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
}

async function main(): Promise<void> {
  const apiKey = process.env.CURSOR_API_KEY;
  if (!apiKey) {
    console.error("CURSOR_API_KEY not set");
    process.exit(1);
  }

  const tierFilter = (process.argv[2] ?? "all") as
    | "top"
    | "second"
    | "third"
    | "all"
    | "variants";
  const probes =
    tierFilter === "variants"
      ? PROBES_HIGH_VARIANTS
      : tierFilter === "all"
        ? PROBES
        : PROBES.filter((p) => p.tier === tierFilter);

  console.log(`probing ${probes.length} model variant(s)...`);
  console.log("─".repeat(82));
  console.log(
    "tier   | result   | dur     | model".padEnd(82, " "),
  );
  console.log("─".repeat(82));

  const results: ProbeResult[] = [];
  for (const probe of probes) {
    process.stdout.write(`${probe.tier.padEnd(7)}| ... ${probe.label}`);
    const res = await probeOne(probe, apiKey);
    results.push(res);
    const flag =
      res.status === "finished" ? "✓ ok    " : res.status === "error" ? "✗ ERROR " : "✗ THREW ";
    process.stdout.write(
      `\r${probe.tier.padEnd(7)}| ${flag} | ${(res.durationMs / 1000).toFixed(1).padStart(5)}s | ${probe.label}\n`,
    );
    if (res.error) console.log(`        └─ ${res.error}`);
  }

  console.log("─".repeat(82));
  const ok = results.filter((r) => r.status === "finished");
  const fail = results.filter((r) => r.status !== "finished");
  console.log(`summary: ${ok.length}/${results.length} working`);
  console.log("");
  console.log("WORKING:");
  for (const r of ok) console.log(`  ✓ ${r.probe.label} (${(r.durationMs / 1000).toFixed(1)}s)`);
  console.log("");
  console.log("FAILING:");
  for (const r of fail)
    console.log(
      `  ✗ ${r.probe.label} [${r.status}]${r.error ? ` ${r.error}` : ""}`,
    );
}

main().catch((e: unknown) => {
  console.error("fatal:", (e as Error).message);
  process.exit(1);
});
