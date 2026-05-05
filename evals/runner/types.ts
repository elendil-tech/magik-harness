/**
 * evals/runner/types.ts — shared zod schemas + types for the eval harness.
 *
 * One canonical source of truth: scenarios are validated against
 * `ScenarioSchema` at load time, judge responses are validated against
 * `JudgeResponseSchema` at parse time, and the on-disk result is the
 * concatenation of those two plus runner-side metadata.
 */

import { z } from "zod";

// --- Scenario --------------------------------------------------------------

export const ScenarioSchema = z.object({
  id: z
    .string()
    .regex(
      /^[0-9]{2}-[a-z0-9-]+$/,
      "id must look like '01-read-first-gate' (NN-kebab-case)",
    ),
  title: z.string().min(8),
  description: z.string().min(20),

  /**
   * Name of a directory under `evals/fixtures/` whose contents are overlaid
   * on top of a freshly seeded harness project to produce the agent's cwd.
   * An empty fixture (no files) means "fresh harness, no extra state".
   */
  fixture: z.string().regex(/^[a-z0-9-]+$/),

  /**
   * Sequence of user messages, one per turn. The runner sends them through
   * a single `Agent.create()` session in order, accumulating context as a
   * real Cursor conversation. Single-turn scenarios are just `[oneMessage]`.
   *
   * Long sessions are the preferred shape — they let the judge see how
   * the agent navigates pushback, follow-ups, and policy conflicts across
   * a realistic exchange, not just one-shot dispatch.
   */
  turns: z.array(z.string().min(4)).min(1),

  expectations: z.object({
    /**
     * Tool names that MUST appear (at least once) in the transcript before
     * any substantive change. The runner cross-checks this mechanically;
     * the judge also cross-references against the rubric.
     */
    must_invoke_tools: z.array(z.string()).default([]),

    /**
     * KB entry slugs (relative to knowledge/, no .md) that MUST be cited
     * or read by the agent.
     */
    must_cite: z.array(z.string()).default([]),

    /**
     * Free-form concept strings the judge should look for in the agent's
     * outputs. Pattern: short, semantic ("policy says JWT", not exact
     * quotes).
     */
    must_surface_concepts: z.array(z.string()).default([]),

    /**
     * Anti-patterns the judge MUST NOT see. Each entry is a short
     * description of a failure mode ("wrote new code without first
     * running kb-search").
     */
    must_not: z.array(z.string()).default([]),
  }),

  /** Relative weight of this scenario in the aggregate report. */
  weight: z.number().positive().default(1),

  /** Score (0..1) at or above which the scenario is considered passed. */
  pass_threshold: z.number().min(0).max(1).default(0.7),

  /** Number of independent agent runs to average over. Default 1. */
  samples: z.number().int().positive().default(1),

  /**
   * Hard upper bound on the *total* agent wall-clock for a sample,
   * across every turn. Keeps a runaway session from melting the eval
   * budget. Default 12 minutes — multi-turn investigations can be slow.
   */
  timeout_ms: z.number().int().positive().default(12 * 60 * 1000),
});

export type Scenario = z.infer<typeof ScenarioSchema>;

// --- Judge response --------------------------------------------------------

export const JudgeExpectationCheckSchema = z.object({
  label: z
    .string()
    .describe("the human-readable expectation being checked"),
  met: z.boolean().describe("true if the agent satisfied this expectation"),
  evidence: z
    .string()
    .describe(
      "short quote or paraphrase from the transcript that justifies the verdict",
    ),
});

export type JudgeExpectationCheck = z.infer<typeof JudgeExpectationCheckSchema>;

export const JudgeResponseSchema = z.object({
  scenario_id: z.string(),
  passed: z
    .boolean()
    .describe("overall pass/fail at the scenario's pass_threshold"),
  score: z
    .number()
    .min(0)
    .max(1)
    .describe(
      "weighted score in [0,1]: 1.0 = every expectation met clearly; 0 = none",
    ),
  expectations: z.array(JudgeExpectationCheckSchema),
  notes: z
    .string()
    .describe(
      "1-3 sentences explaining the score; flag anything ambiguous or surprising",
    ),
});

export type JudgeResponse = z.infer<typeof JudgeResponseSchema>;

// --- Runner result ---------------------------------------------------------

/**
 * Cursor SDK effort tier — matches the `effort` parameter on Anthropic
 * models (`claude-opus-4-7`, `claude-sonnet-4-5`, etc.). Surfaced verbatim
 * so anyone reading a result file can pass it back to the SDK without
 * translation.
 *
 * NOTE: `max` is "max mode" — the highest tier. We default to `xhigh`
 * for the judge to get extra-high reasoning *without* opting into max
 * mode pricing/latency.
 */
export type CursorEffort = "low" | "medium" | "high" | "xhigh" | "max";

export interface RunMeta {
  timestamp: string;
  plugin_version: string;
  agent_model: string;
  judge_model: string;
  judge_effort: CursorEffort;
  judge_thinking: boolean;
  cursor_sdk_version: string;
  /** Hostname or "ci" — useful for triaging cross-environment results. */
  host: string;
}

export interface ScenarioResult {
  scenario_id: string;
  title: string;
  passed: boolean;
  score: number;
  /** Per-sample raw judge responses (length = scenario.samples). */
  samples: JudgeResponse[];
  /** Median wall-clock across samples (ms). */
  duration_ms: number;
  /** Total characters in the merged transcripts (proxy for token cost). */
  transcript_chars: number;
  /** "ok" if every sample produced a judge response; else the reason. */
  status: "ok" | "agent-error" | "judge-error" | "skipped";
  error?: string;
}

export interface RunReport {
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

// --- Runner-internal -------------------------------------------------------

/**
 * Per-scenario raw record fed into the report aggregator. One sample slot
 * per `scenario.samples`. The aggregator handles missing judges, errors,
 * etc.
 */
export interface ScenarioRunRecord {
  scenario: Scenario;
  samples: Array<{
    judge: JudgeResponse | null;
    duration_ms: number;
    transcript_chars: number;
    error?: string;
  }>;
}

export interface AgentTranscript {
  /** Full text content — assistant messages concatenated, in order. */
  text: string;
  /** Unique tool names invoked (sorted, deduped). */
  tools_invoked: string[];
  /** Files Read by the agent — relative to project root, sorted. */
  files_read: string[];
  /** Files Write/Edit'd by the agent — relative to project root, sorted. */
  files_written: string[];
  /** Raw event stream chars; bounded — useful for the judge prompt. */
  raw_chars: number;
}
