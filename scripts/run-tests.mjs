#!/usr/bin/env node
/**
 * scripts/run-tests.mjs: cross-platform test runner.
 *
 * Replaces a bare `node --test --import tsx tests/*.test.ts`, which relies on
 * shell glob expansion (PowerShell passes the literal pattern through) or on
 * Node's own glob support (only in Node 22+). Enumerating the files here
 * sidesteps both.
 */

import { spawnSync } from "node:child_process";
import { readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const TESTS = join(ROOT, "tests");

const only = process.argv.slice(2).filter((a) => !a.startsWith("-"));
const files = readdirSync(TESTS)
  .filter((f) => f.endsWith(".test.ts"))
  .filter((f) => only.length === 0 || only.some((o) => f.includes(o)))
  .sort()
  .map((f) => join(TESTS, f));

if (files.length === 0) {
  console.error(`error: no matching *.test.ts files in ${TESTS}`);
  process.exit(1);
}

const result = spawnSync(process.execPath, ["--test", "--import", "tsx", ...files], { stdio: "inherit", cwd: ROOT });
process.exit(result.status ?? 1);
