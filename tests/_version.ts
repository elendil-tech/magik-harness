/**
 * tests/_version.ts — shared helper that derives the plugin version from
 * package.json so individual test files don't have to hardcode it. Reading
 * from package.json (rather than from `hooks/init-harness.ts`'s
 * PLUGIN_VERSION constant) makes package.json the canonical source of truth
 * — the version-sync test then asserts every other location agrees.
 *
 * The `_` prefix keeps this file out of the `tests/*.test.ts` glob in the
 * test runner.
 */

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const TEST_DIR = dirname(fileURLToPath(import.meta.url));
const PLUGIN_ROOT = dirname(TEST_DIR);

interface PackageJson {
  version: string;
}

const pkg = JSON.parse(
  readFileSync(join(PLUGIN_ROOT, "package.json"), "utf-8"),
) as PackageJson;

export const PLUGIN_VERSION: string = pkg.version;
export const PLUGIN_ROOT_DIR: string = PLUGIN_ROOT;

/** Escape a string so it's safe to drop into a `RegExp` literal. */
export function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
