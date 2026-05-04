/**
 * evals/runner/judge.ts — LLM-as-judge using the Vercel AI SDK with the
 * Anthropic provider.
 *
 * The judge receives:
 *   - the static system prompt at prompts/judge-system.md
 *   - a structured user message with the scenario rubric and the agent
 *     transcript (text + tools + files)
 * …and returns a `JudgeResponse` validated against the zod schema. The
 * `generateObject` call enforces structure at the SDK boundary, so we
 * never have to parse free-form JSON.
 *
 * Model selection precedence (highest → lowest):
 *   1. function arg
 *   2. EVAL_JUDGE_MODEL env var
 *   3. default: "claude-opus-4-7"
 *
 * Thinking effort (Anthropic extended-thinking budget) precedence:
 *   1. function arg
 *   2. EVAL_JUDGE_THINKING_EFFORT env var
 *   3. default: "high"
 */

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { generateObject } from "ai";
import { anthropic } from "@ai-sdk/anthropic";
import {
  JudgeResponseSchema,
  type AgentTranscript,
  type JudgeResponse,
  type Scenario,
} from "./types.ts";

const RUNNER_DIR = dirname(fileURLToPath(import.meta.url));
const SYSTEM_PROMPT_PATH = join(RUNNER_DIR, "prompts", "judge-system.md");

const DEFAULT_JUDGE_MODEL = "claude-opus-4-7";
const DEFAULT_THINKING_EFFORT: ThinkingEffort = "high";

type ThinkingEffort = "minimal" | "low" | "medium" | "high";

export interface JudgeOptions {
  model?: string;
  thinkingEffort?: ThinkingEffort;
}

export function resolveJudgeModel(opts: JudgeOptions = {}): string {
  return opts.model ?? process.env.EVAL_JUDGE_MODEL ?? DEFAULT_JUDGE_MODEL;
}

export function resolveJudgeEffort(opts: JudgeOptions = {}): ThinkingEffort {
  const fromEnv = process.env.EVAL_JUDGE_THINKING_EFFORT as
    | ThinkingEffort
    | undefined;
  return opts.thinkingEffort ?? fromEnv ?? DEFAULT_THINKING_EFFORT;
}

function buildUserPrompt(
  scenario: Scenario,
  transcript: AgentTranscript,
): string {
  const rubric = {
    id: scenario.id,
    title: scenario.title,
    task: scenario.task,
    expectations: scenario.expectations,
    pass_threshold: scenario.pass_threshold,
  };

  return [
    "## Scenario",
    "",
    "```json",
    JSON.stringify(rubric, null, 2),
    "```",
    "",
    "## Transcript (agent under test)",
    "",
    "### Tools invoked (deduped)",
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
    "### Assistant text (concatenated, in order)",
    "",
    transcript.text || "_(no assistant text captured)_",
    "",
    "---",
    "",
    "Return a single `JudgeResponse` JSON object scoring the agent's behavior against every expectation in the scenario. Set `passed = score >= pass_threshold`.",
  ].join("\n");
}

export async function judge(
  scenario: Scenario,
  transcript: AgentTranscript,
  opts: JudgeOptions = {},
): Promise<JudgeResponse> {
  const model = resolveJudgeModel(opts);
  const effort = resolveJudgeEffort(opts);
  const system = readFileSync(SYSTEM_PROMPT_PATH, "utf-8");
  const user = buildUserPrompt(scenario, transcript);

  // The Anthropic provider exposes an `extended thinking` budget via
  // providerOptions; the AI SDK normalizes that to its own 'reasoning'
  // controls. Use both to stay forward-compatible: providerOptions is the
  // typed Anthropic surface; in older SDKs `thinkingEffort` may be a
  // top-level option.
  const result = await generateObject({
    model: anthropic(model),
    schema: JudgeResponseSchema,
    schemaName: "JudgeResponse",
    schemaDescription: "Structured eval verdict for a single scenario sample.",
    system,
    prompt: user,
    providerOptions: {
      anthropic: {
        thinking: { type: "enabled", budgetTokens: budgetForEffort(effort) },
      },
    },
    maxOutputTokens: 8000,
  });

  // Defensive: even though generateObject schema-validates, run our own
  // parse to catch any drift between the AI SDK's parser and ours.
  const parsed = JudgeResponseSchema.safeParse(result.object);
  if (!parsed.success) {
    throw new Error(
      `judge returned a JudgeResponse that fails our schema: ${parsed.error.message}`,
    );
  }
  return parsed.data;
}

function budgetForEffort(effort: ThinkingEffort): number {
  switch (effort) {
    case "minimal":
      return 1024;
    case "low":
      return 4096;
    case "medium":
      return 12000;
    case "high":
    default:
      return 24000;
  }
}
