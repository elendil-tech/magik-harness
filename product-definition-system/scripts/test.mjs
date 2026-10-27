#!/usr/bin/env node
// Runs every test file with the Node test runner. A runner of our own rather than a glob on the
// command line, so that the same command works on every supported Node: a quoted glob needs Node 21,
// and a bare `node --test` would also run the shared helpers as if they were tests.
//
//   npm test                          everything
//   npm test -- --test-name-pattern approval
import { spawnSync } from "node:child_process";
import { readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const dir = join(dirname(fileURLToPath(import.meta.url)), "..", "tools", "test");
const files = readdirSync(dir)
  .filter((f) => f.endsWith(".test.mjs"))
  .sort()
  .map((f) => join(dir, f));

const result = spawnSync(process.execPath, ["--test", ...process.argv.slice(2), ...files], { stdio: "inherit" });
process.exit(result.status ?? 1);
