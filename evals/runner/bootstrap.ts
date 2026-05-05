/**
 * evals/runner/bootstrap.ts — side-effect-only module that prepares
 * process.env BEFORE any `@cursor/sdk` import is evaluated.
 *
 * Why it exists: the Cursor SDK uses ripgrep for `.cursorignore` /
 * `.gitignore` resolution. When run outside the Cursor IDE (which
 * normally sets things up), the SDK throws at first call with
 * "Ripgrep path not configured. Call configureRipgrepPath() at
 * startup." — but that function is not exported. The supported escape
 * hatch is the `CURSOR_RIPGREP_PATH` environment variable, which the
 * SDK reads on first use.
 *
 * The SDK ships a bundled `rg` per platform as an optional dependency
 * (`@cursor/sdk-<platform>-<arch>`); we resolve the right one at
 * runtime and point the env var at it. If the user's environment
 * already sets `CURSOR_RIPGREP_PATH`, we leave it alone — explicit
 * override always wins.
 *
 * Importing this module has the side effect of setting the env var.
 * It must be the FIRST thing imported by anything that uses the
 * Cursor SDK; ESM hoists imports in order so a `import "./bootstrap.ts"`
 * at the top of the entry file is sufficient.
 */

import { existsSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const RUNNER_DIR = dirname(fileURLToPath(import.meta.url));
const PLUGIN_ROOT = dirname(dirname(RUNNER_DIR));

/**
 * Load `.env` (and `.env.local`, which overrides) into `process.env` if
 * present. Explicit shell exports always win over file values. Pure
 * best-effort — missing files are fine, which keeps `pnpm eval --dry-run`
 * working on a fresh checkout.
 *
 * Inline parser, no dotenv dep — minimal subset that handles
 * `KEY=value`, comments, and matched single/double quote stripping.
 * Runs BEFORE `configureRipgrep()` so a user-provided
 * `CURSOR_RIPGREP_PATH` from .env is honored as an explicit override.
 */
function loadDotEnv(): void {
  for (const name of [".env", ".env.local"]) {
    const path = join(PLUGIN_ROOT, name);
    if (!existsSync(path)) continue;
    const raw = readFileSync(path, "utf-8");
    for (const line of raw.split(/\r?\n/)) {
      const t = line.trim();
      if (t.length === 0 || t.startsWith("#")) continue;
      const eq = t.indexOf("=");
      if (eq <= 0) continue;
      const key = t.slice(0, eq).trim();
      let val = t.slice(eq + 1).trim();
      if (
        (val.startsWith('"') && val.endsWith('"')) ||
        (val.startsWith("'") && val.endsWith("'"))
      ) {
        val = val.slice(1, -1);
      }
      if (process.env[key] === undefined) process.env[key] = val;
    }
  }
}

function platformPackageName(): string {
  const platform = process.platform;
  const arch = process.arch;
  // Map Node's process.platform / process.arch to the SDK's published
  // platform packages: @cursor/sdk-<platform>-<arch>
  // Known set per @cursor/sdk@1.0.12 optionalDependencies:
  //   darwin-arm64, darwin-x64, linux-arm64, linux-x64, win32-x64.
  return `@cursor/sdk-${platform}-${arch}`;
}

function configureRipgrep(): void {
  if (process.env.CURSOR_RIPGREP_PATH) return; // explicit override wins

  const require = createRequire(import.meta.url);
  const pkgName = platformPackageName();

  let pkgRoot: string;
  try {
    // Resolve the platform package's package.json to find its root.
    const manifest = require.resolve(`${pkgName}/package.json`);
    pkgRoot = dirname(manifest);
  } catch {
    // Platform package isn't installed (e.g. running on an arch the SDK
    // doesn't bundle, or pnpm skipped optionalDependencies). Bail
    // silently — the SDK will still throw its original error, which is
    // the right outcome: "the platform you're on isn't supported by
    // this SDK version."
    return;
  }

  const rgName = process.platform === "win32" ? "rg.exe" : "rg";
  const rgPath = join(pkgRoot, "bin", rgName);

  if (!existsSync(rgPath)) {
    // Path layout differed from expectations. Don't lie about it —
    // leave the env var unset and let the SDK surface its native
    // error.
    return;
  }

  process.env.CURSOR_RIPGREP_PATH = rgPath;
}

loadDotEnv();
configureRipgrep();

// Suppress the lint-style "no-side-effect-only-import" by exporting a
// named symbol downstream files can re-export if useful.
export const RIPGREP_PATH: string | undefined = process.env.CURSOR_RIPGREP_PATH;

// Self-check helper — used by `pnpm exec tsx evals/runner/bootstrap.ts`
// (and by tests) to confirm wiring without spinning up the SDK.
if (
  import.meta.url === `file://${fileURLToPath(import.meta.url).replace(/\\/g, "/")}` &&
  process.argv[1] !== undefined &&
  process.argv[1].endsWith("bootstrap.ts")
) {
  console.log(
    RIPGREP_PATH
      ? `CURSOR_RIPGREP_PATH=${RIPGREP_PATH}`
      : "(not set — platform package missing or unrecognized layout)",
  );
}
