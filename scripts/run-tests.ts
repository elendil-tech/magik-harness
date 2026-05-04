#!/usr/bin/env -S npx --yes tsx
/**
 * scripts/run-tests.ts — cross-platform test runner.
 *
 * Replaces the bare `node --test --import tsx tests/*.test.ts` command,
 * which:
 *   - relies on shell glob expansion (PowerShell on Windows passes the
 *     literal "tests/*.test.ts" through), and
 *   - relies on Node's own glob support inside `--test`, which only
 *     landed in Node 22.
 *
 * Enumerating the files in TS sidesteps both problems.
 */

import { spawnSync } from "node:child_process";
import { readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const PLUGIN_ROOT = dirname(SCRIPT_DIR);
const TESTS_DIR = join(PLUGIN_ROOT, "tests");

function main(): void {
  const files = readdirSync(TESTS_DIR)
    .filter((f) => f.endsWith(".test.ts"))
    .sort()
    .map((f) => join(TESTS_DIR, f));

  if (files.length === 0) {
    console.error(`error: no *.test.ts files found in ${TESTS_DIR}`);
    process.exit(1);
  }

  const result = spawnSync(
    process.execPath,
    ["--test", "--import", "tsx", ...files],
    { stdio: "inherit", cwd: PLUGIN_ROOT },
  );

  process.exit(result.status ?? 1);
}

main();
