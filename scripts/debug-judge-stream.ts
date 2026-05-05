#!/usr/bin/env -S npx --yes tsx
/**
 * scripts/debug-judge-stream.ts — same as debug-judge.ts but uses
 * Agent.create + stream so we can see the error events that
 * Agent.prompt swallows when status=error.
 */

import "../evals/runner/bootstrap.ts";

import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Agent } from "@cursor/sdk";
import type { SDKMessage } from "@cursor/sdk";

async function main(): Promise<void> {
  const apiKey = process.env.CURSOR_API_KEY;
  if (!apiKey) {
    console.error("CURSOR_API_KEY not set");
    process.exit(1);
  }

  const modelId = process.argv[2] ?? "claude-opus-4-7";
  const params: Array<{ id: string; value: string }> = [];
  for (const arg of process.argv.slice(3)) {
    const eq = arg.indexOf("=");
    if (eq > 0) {
      params.push({ id: arg.slice(0, eq), value: arg.slice(eq + 1) });
    }
  }
  console.log(`model=${modelId} params=${JSON.stringify(params)}`);

  const cwd = mkdtempSync(join(tmpdir(), "judge-stream-"));
  const agent = await Agent.create({
    apiKey,
    model: { id: modelId, params: params.length > 0 ? params : undefined },
    local: { cwd, settingSources: [] },
  });

  try {
    const run = await agent.send("Output: { \"ok\": true }");
    let i = 0;
    for await (const msg of run.stream() as AsyncGenerator<SDKMessage, void>) {
      i++;
      console.log(`[${i}] ${msg.type}:`, JSON.stringify(msg).slice(0, 400));
    }
    const result = await run.wait();
    console.log("─".repeat(60));
    console.log("status:", result.status);
    console.log("result:", result.result ?? "(none)");
  } finally {
    await agent[Symbol.asyncDispose]();
    rmSync(cwd, { recursive: true, force: true });
  }
}

main().catch((e: unknown) => {
  console.error("fatal:", (e as Error).message);
  process.exit(1);
});
