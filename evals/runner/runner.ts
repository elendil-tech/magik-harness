/**
 * evals/runner/runner.ts — drive a single scenario sample through the
 * Cursor SDK, multi-turn, and capture a structured transcript for the
 * judge.
 *
 * Pattern: `await Agent.create` + loop {`agent.send` + iterate
 * `run.stream()` + `run.wait()`} for every turn + `agent[Symbol.asyncDispose]`
 * in `finally`. The SDK's stream emits typed `SDKMessage` values; we
 * extract:
 *   - assistant text (concatenated for the judge prompt, with turn
 *     markers inserted between user messages)
 *   - tool invocations (name + best-effort path) from `assistant`
 *     blocks AND from `tool_call` events (the latter has authoritative
 *     args at execution time, the former is what the agent decided to
 *     call before it ran)
 *   - file paths read / written, derived from tool args
 *
 * `timeout_ms` is the *total* wall-clock for the whole multi-turn
 * sample, not per-turn — a runaway turn 1 won't be saved by a fresh
 * budget on turn 2.
 */

import { Agent, CursorAgentError } from "@cursor/sdk";
import type { SDKMessage } from "@cursor/sdk";
import type { AgentTranscript, ModelParam } from "./types.ts";

export interface RunnerOptions {
  projectRoot: string;
  /** One user message per turn, in order. Length ≥ 1. */
  turns: string[];
  model: string;
  /** SDK model params, e.g. `[{ id: "fast", value: "false" }]`. */
  params?: ModelParam[];
  apiKey: string;
  timeoutMs: number;
}

export interface RunnerResult {
  transcript: AgentTranscript;
  duration_ms: number;
  status: "ok" | "agent-error";
  error?: string;
}

const WRITE_TOOLS = new Set([
  "Write",
  "Edit",
  "MultiEdit",
  "StrReplace",
  "EditNotebook",
  "Delete",
]);

function extractPath(args: unknown): string | null {
  if (!args || typeof args !== "object") return null;
  const a = args as Record<string, unknown>;
  for (const key of ["path", "file_path", "filePath", "target_file"]) {
    const v = a[key];
    if (typeof v === "string" && v.length > 0) return v;
  }
  return null;
}

function relativize(p: string, projectRoot: string): string {
  // Best-effort: strip projectRoot prefix when present so transcripts are
  // portable across machines. Falls back to the original string.
  const norm = p.split("\\").join("/");
  const root = projectRoot.split("\\").join("/");
  if (norm.startsWith(root + "/")) return norm.slice(root.length + 1);
  if (norm === root) return ".";
  return norm;
}

export async function runScenarioOnce(
  opts: RunnerOptions,
): Promise<RunnerResult> {
  const start = Date.now();

  const textChunks: string[] = [];
  const toolsInvoked = new Set<string>();
  const filesRead = new Set<string>();
  const filesWritten = new Set<string>();
  let rawChars = 0;

  const agent = await Agent.create({
    apiKey: opts.apiKey,
    model: {
      id: opts.model,
      params: opts.params && opts.params.length > 0 ? opts.params : undefined,
    },
    local: { cwd: opts.projectRoot },
  });

  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
  }, opts.timeoutMs);

  function recordToolCall(name: string, args: unknown): void {
    toolsInvoked.add(name);
    const path = extractPath(args);
    if (!path) return;
    const rel = relativize(path, opts.projectRoot);
    if (WRITE_TOOLS.has(name)) filesWritten.add(rel);
    else if (name === "Read") filesRead.add(rel);
  }

  try {
    for (let i = 0; i < opts.turns.length; i++) {
      if (timedOut) break;
      const turn = opts.turns[i]!;
      textChunks.push(`\n──── user (turn ${i + 1}) ────\n${turn}`);

      const run = await agent.send(turn);
      textChunks.push(`\n──── assistant (turn ${i + 1}) ────`);

      for await (const msg of run.stream() as AsyncGenerator<SDKMessage, void>) {
        if (timedOut) break;
        try {
          rawChars += JSON.stringify(msg).length;
        } catch {
          // best-effort
        }

        if (msg.type === "assistant") {
          for (const block of msg.message.content) {
            if (block.type === "text") {
              textChunks.push(block.text);
            } else if (block.type === "tool_use") {
              recordToolCall(block.name, block.input);
            }
          }
          continue;
        }

        if (msg.type === "tool_call") {
          recordToolCall(msg.name, msg.args);
          continue;
        }

        // `system` / `thinking` / `status` / `request` / `task` events
        // contribute to rawChars (already counted above) but not to the
        // judge-facing transcript fields.
      }

      const result = await run.wait();
      if (timedOut) break;
      if (result.status === "error") {
        if (run.supports("cancel")) {
          try {
            await run.cancel();
          } catch {
            // best-effort
          }
        }
        return {
          transcript: assemble(),
          duration_ms: Date.now() - start,
          status: "agent-error",
          error: `turn ${i + 1}: run.status=error (id=${result.id ?? "?"})`,
        };
      }
    }

    if (timedOut) {
      return {
        transcript: assemble(),
        duration_ms: Date.now() - start,
        status: "agent-error",
        error: `agent session exceeded timeout_ms=${opts.timeoutMs}`,
      };
    }

    return {
      transcript: assemble(),
      duration_ms: Date.now() - start,
      status: "ok",
    };
  } catch (err) {
    if (err instanceof CursorAgentError) {
      return {
        transcript: assemble(),
        duration_ms: Date.now() - start,
        status: "agent-error",
        error: `CursorAgentError: ${err.message} (retryable=${err.isRetryable})`,
      };
    }
    return {
      transcript: assemble(),
      duration_ms: Date.now() - start,
      status: "agent-error",
      error: `unexpected: ${(err as Error).message ?? String(err)}`,
    };
  } finally {
    clearTimeout(timer);
    try {
      await agent[Symbol.asyncDispose]();
    } catch {
      // dispose is idempotent in spirit — never let cleanup mask the run result
    }
  }

  function assemble(): AgentTranscript {
    return {
      text: textChunks.join("\n").trim(),
      tools_invoked: [...toolsInvoked].sort(),
      files_read: [...filesRead].sort(),
      files_written: [...filesWritten].sort(),
      raw_chars: rawChars,
    };
  }
}
