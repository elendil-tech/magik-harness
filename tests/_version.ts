/**
 * tests/_version.ts: the package version and root, read from package.json so
 * individual test files never hardcode them. package.json is the canonical
 * source of truth; tests/version-sync.test.ts asserts every other place that
 * states the version agrees.
 *
 * The `_` prefix keeps this file out of the `tests/*.test.ts` glob.
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
