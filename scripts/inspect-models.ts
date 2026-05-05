#!/usr/bin/env -S npx --yes tsx
/**
 * scripts/inspect-models.ts — print the raw `Cursor.models.list()` catalog
 * for the active CURSOR_API_KEY. Used to discover model ids + their tunable
 * parameters (e.g. reasoning effort, max mode).
 *
 * Auto-loads .env via the eval bootstrap (no --env-file flag needed):
 *   pnpm exec tsx scripts/inspect-models.ts [filter]
 *
 * Optional positional arg filters by `id` substring.
 */

import "../evals/runner/bootstrap.ts";

import { Cursor } from "@cursor/sdk";

const filter = process.argv[2];

async function main(): Promise<void> {
  const apiKey = process.env.CURSOR_API_KEY;
  if (!apiKey) {
    console.error("CURSOR_API_KEY not set. Source .env or pass --env-file=.env.");
    process.exit(1);
  }
  const models = await Cursor.models.list({ apiKey });
  const filtered = filter
    ? models.filter((m) => m.id.toLowerCase().includes(filter.toLowerCase()))
    : models;

  for (const m of filtered) {
    console.log("─".repeat(72));
    console.log(`id:         ${m.id}`);
    console.log(`displayName:${m.displayName}`);
    if (m.description) console.log(`desc:       ${m.description}`);
    if (m.parameters?.length) {
      console.log("parameters:");
      for (const p of m.parameters) {
        const vals = p.values.map((v) => v.value).join(" | ");
        console.log(`  - ${p.id} (${p.displayName ?? "—"}): ${vals}`);
      }
    }
    if (m.variants?.length) {
      console.log("variants:");
      for (const v of m.variants) {
        const params = v.params.map((p) => `${p.id}=${p.value}`).join(", ");
        console.log(
          `  - "${v.displayName}"${v.isDefault ? " [default]" : ""}: ${params || "(no params)"}`,
        );
      }
    }
  }
  console.log("─".repeat(72));
  console.log(`total: ${filtered.length}${filter ? ` (filter="${filter}")` : ""}`);
}

main().catch((err: unknown) => {
  console.error("error:", (err as Error).message);
  process.exit(1);
});
