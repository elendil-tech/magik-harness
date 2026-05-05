#!/usr/bin/env -S npx --yes tsx
/**
 * scripts/debug-judge.ts — single Agent.prompt call against the judge
 * model + params, with full result + event dump. Used when the judge
 * is failing in evals and we need to see what the SDK actually returns.
 */

import "../evals/runner/bootstrap.ts";

import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Agent } from "@cursor/sdk";

async function main(): Promise<void> {
  const apiKey = process.env.CURSOR_API_KEY;
  if (!apiKey) {
    console.error("CURSOR_API_KEY not set");
    process.exit(1);
  }

  const cwd = mkdtempSync(join(tmpdir(), "judge-debug-"));
  console.log(`cwd: ${cwd}`);
  console.log(`ripgrep: ${process.env.CURSOR_RIPGREP_PATH}`);

  const prompt =
    "Output exactly the JSON object: " +
    '{ "ok": true, "msg": "hello" }. ' +
    "No tools. No commentary. JSON only.";

  try {
    const modelId = process.argv[2] ?? "claude-opus-4-7";
    const params: Array<{ id: string; value: string }> = [];
    for (const arg of process.argv.slice(3)) {
      const eq = arg.indexOf("=");
      if (eq > 0) {
        params.push({ id: arg.slice(0, eq), value: arg.slice(eq + 1) });
      }
    }
    console.log(
      `model=${modelId} params=${params.length > 0 ? JSON.stringify(params) : "(none)"}`,
    );
    const result = await Agent.prompt(prompt, {
      apiKey,
      model: { id: modelId, params: params.length > 0 ? params : undefined },
      local: { cwd, settingSources: [] },
    });
    console.log("─".repeat(60));
    console.log("status:", result.status);
    console.log("id:", result.id);
    console.log("durationMs:", result.durationMs);
    console.log("model:", JSON.stringify(result.model));
    console.log("─".repeat(60));
    console.log("result text:");
    console.log(result.result ?? "(none)");
  } catch (err) {
    console.log("THREW:");
    console.log((err as Error).name, (err as Error).message);
    if ("isRetryable" in (err as object)) {
      console.log("isRetryable:", (err as { isRetryable: unknown }).isRetryable);
    }
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
}

main().catch((e: unknown) => {
  console.error("fatal:", (e as Error).message);
  process.exit(1);
});
