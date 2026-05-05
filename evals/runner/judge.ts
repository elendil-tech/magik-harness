/**
 * evals/runner/judge.ts — LLM-as-judge running on the Cursor SDK only.
 *
 * Uses `Agent.prompt(...)` (Pattern 1: one-shot, auto-disposes) against
 * a strong reasoning model — default `claude-opus-4-7` with
 * `effort=xhigh` and `thinking=true`, NOT `effort=max`. The judge runs
 * in a tmpdir cwd so it cannot accidentally read project files; we
 * also instruct it explicitly not to use any tools and to respond
 * with a single JSON object.
 *
 * The response is parsed by stripping any leading prose / markdown
 * fences and validating against `JudgeResponseSchema`. On parse
 * failure we throw — the caller records the error and the scenario
 * lands in the `judge-error` bucket.
 *
 * Configuration precedence (highest → lowest) for every knob:
 *   1. function arg
 *   2. corresponding EVAL_JUDGE_* env var
 *   3. compiled-in default
 *
 * Defaults:
 *   model       claude-opus-4-7
 *   effort      xhigh   (extra high; max mode explicitly OFF)
 *   thinking    true
 *   context     1m
 */

import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { Agent, CursorAgentError } from "@cursor/sdk";
import {
  JudgeResponseSchema,
  type AgentTranscript,
  type CursorEffort,
  type JudgeResponse,
  type Scenario,
} from "./types.ts";

const RUNNER_DIR = dirname(fileURLToPath(import.meta.url));
const SYSTEM_PROMPT_PATH = join(RUNNER_DIR, "prompts", "judge-system.md");

const DEFAULT_JUDGE_MODEL = "claude-opus-4-7";
const DEFAULT_JUDGE_EFFORT: CursorEffort = "xhigh";
const DEFAULT_JUDGE_THINKING = true;
const DEFAULT_JUDGE_CONTEXT = "1m";

const VALID_EFFORTS: readonly CursorEffort[] = [
  "low",
  "medium",
  "high",
  "xhigh",
  "max",
];

export interface JudgeOptions {
  model?: string;
  effort?: CursorEffort;
  thinking?: boolean;
  apiKey?: string;
}

export function resolveJudgeModel(opts: JudgeOptions = {}): string {
  return opts.model ?? process.env.EVAL_JUDGE_MODEL ?? DEFAULT_JUDGE_MODEL;
}

export function resolveJudgeEffort(opts: JudgeOptions = {}): CursorEffort {
  const fromEnv = process.env.EVAL_JUDGE_EFFORT;
  const candidate =
    opts.effort ?? (fromEnv as CursorEffort | undefined) ?? DEFAULT_JUDGE_EFFORT;
  if (!VALID_EFFORTS.includes(candidate)) {
    throw new Error(
      `invalid judge effort "${candidate}" — must be one of ${VALID_EFFORTS.join(" | ")}`,
    );
  }
  return candidate;
}

export function resolveJudgeThinking(opts: JudgeOptions = {}): boolean {
  if (typeof opts.thinking === "boolean") return opts.thinking;
  const fromEnv = process.env.EVAL_JUDGE_THINKING;
  if (fromEnv === undefined) return DEFAULT_JUDGE_THINKING;
  return fromEnv === "1" || fromEnv.toLowerCase() === "true";
}

function buildJudgePrompt(
  scenario: Scenario,
  transcript: AgentTranscript,
): string {
  const system = readFileSync(SYSTEM_PROMPT_PATH, "utf-8");
  const rubric = {
    id: scenario.id,
    title: scenario.title,
    turns: scenario.turns,
    expectations: scenario.expectations,
    pass_threshold: scenario.pass_threshold,
  };

  const responseShape = `{
  "scenario_id": "<string, must equal scenario.id>",
  "passed": <boolean>,
  "score": <number, 0..1>,
  "expectations": [
    { "label": "<the expectation in plain English>", "met": <bool>, "evidence": "<brief quote or paraphrase>" }
  ],
  "notes": "<1-3 sentences explaining the score>"
}`;

  return [
    system,
    "",
    "## Output protocol",
    "",
    "**Do not use any tools.** Do not Read, Write, Grep, Glob, Shell, or any",
    "other tool. Your entire response must be a single JSON object — nothing",
    "before it, nothing after it, no markdown fences, no commentary.",
    "",
    "Schema:",
    "",
    "```",
    responseShape,
    "```",
    "",
    "## Scenario",
    "",
    "```json",
    JSON.stringify(rubric, null, 2),
    "```",
    "",
    "## Transcript (agent under test)",
    "",
    "### Tools invoked (deduped, sorted)",
    transcript.tools_invoked.length > 0
      ? transcript.tools_invoked.map((t) => `- ${t}`).join("\n")
      : "_none_",
    "",
    "### Files read (relative to project root)",
    transcript.files_read.length > 0
      ? transcript.files_read.map((f) => `- ${f}`).join("\n")
      : "_none_",
    "",
    "### Files written (relative to project root)",
    transcript.files_written.length > 0
      ? transcript.files_written.map((f) => `- ${f}`).join("\n")
      : "_none_",
    "",
    "### Conversation (user turns interleaved with assistant text)",
    "",
    transcript.text || "_(no assistant text captured)_",
    "",
    "---",
    "",
    "Now emit the `JudgeResponse` JSON object. Set `passed = score >= pass_threshold`. JSON only.",
  ].join("\n");
}

/**
 * Best-effort JSON extraction. Models occasionally wrap output in
 * ```json … ``` fences or prepend a sentence despite our instructions;
 * find the first balanced object and return it.
 */
function extractJson(text: string): string {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const candidate = (fenced?.[1] ?? text).trim();
  const start = candidate.indexOf("{");
  if (start < 0) {
    throw new Error(`no JSON object found in judge response: ${truncate(text)}`);
  }
  // Walk to find the matching closing brace, respecting strings/escapes.
  let depth = 0;
  let inString = false;
  let escape = false;
  for (let i = start; i < candidate.length; i++) {
    const c = candidate[i]!;
    if (escape) {
      escape = false;
      continue;
    }
    if (c === "\\") {
      escape = true;
      continue;
    }
    if (c === '"') {
      inString = !inString;
      continue;
    }
    if (inString) continue;
    if (c === "{") depth++;
    else if (c === "}") {
      depth--;
      if (depth === 0) return candidate.slice(start, i + 1);
    }
  }
  throw new Error(`unbalanced JSON in judge response: ${truncate(text)}`);
}

function truncate(s: string): string {
  return s.length > 400 ? `${s.slice(0, 400)}…` : s;
}

export async function judge(
  scenario: Scenario,
  transcript: AgentTranscript,
  opts: JudgeOptions = {},
): Promise<JudgeResponse> {
  const model = resolveJudgeModel(opts);
  const effort = resolveJudgeEffort(opts);
  const thinking = resolveJudgeThinking(opts);
  const apiKey = opts.apiKey ?? process.env.CURSOR_API_KEY;
  if (!apiKey) {
    throw new Error("judge: CURSOR_API_KEY not set");
  }

  const prompt = buildJudgePrompt(scenario, transcript);

  // Empty tmpdir cwd — the judge has nothing local to read, so it can't
  // accidentally exfil project files even if something tells it to.
  const judgeCwd = mkdtempSync(join(tmpdir(), "magik-judge-"));
  try {
    let result;
    try {
      result = await Agent.prompt(prompt, {
        apiKey,
        model: {
          id: model,
          params: [
            { id: "thinking", value: String(thinking) },
            { id: "context", value: DEFAULT_JUDGE_CONTEXT },
            { id: "effort", value: effort },
          ],
        },
        local: { cwd: judgeCwd, settingSources: [] },
      });
    } catch (err) {
      if (err instanceof CursorAgentError) {
        throw new Error(
          `judge agent failed to start: ${err.message} (retryable=${err.isRetryable})`,
        );
      }
      throw err;
    }

    if (result.status !== "finished") {
      throw new Error(
        `judge run did not finish cleanly: status=${result.status} id=${result.id}`,
      );
    }
    const text = result.result ?? "";
    if (text.length === 0) {
      throw new Error("judge returned empty result");
    }

    const json = extractJson(text);
    let parsed: unknown;
    try {
      parsed = JSON.parse(json);
    } catch (err) {
      throw new Error(
        `judge response is not valid JSON: ${(err as Error).message}\n--- raw ---\n${truncate(text)}`,
      );
    }
    const validated = JudgeResponseSchema.safeParse(parsed);
    if (!validated.success) {
      throw new Error(
        `judge response failed schema validation: ${validated.error.message}\n--- raw ---\n${truncate(text)}`,
      );
    }
    return validated.data;
  } finally {
    try {
      rmSync(judgeCwd, { recursive: true, force: true });
    } catch {
      // best-effort
    }
  }
}
