/**
 * evals/runner/fixture.ts — build a ready-to-run agent cwd by combining
 * the seed payload (`seeds/`, the harness as users get it) with a
 * scenario-specific overlay directory (`evals/fixtures/<name>/`).
 *
 * The seed gives us a harnessed project (rules / skills / commands /
 * memory + knowledge skeletons / hook seeds). The overlay adds whatever
 * the scenario needs on top: a populated KB entry, a pre-seeded
 * registry, an existing memory note, etc.
 *
 * Overlay rules:
 *   - Files that don't exist in the seed are *added*.
 *   - Files that exist in the seed are *replaced* (with a soft warning
 *     printed to stderr — most overlays should add, not replace).
 *   - The seed is also written into the project's `.cursor/rules/` and
 *     `.cursor/skills/` so the agent has the full plugin payload
 *     available, since in the real product those come from the
 *     installed plugin (~/.cursor/plugins/local/magik-repo/).
 *
 * The result is an absolute path under `evals/.tmp/` (gitignored). The
 * caller is responsible for cleanup; the CLI uses `try/finally rmSync`.
 */

import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  rmSync,
  statSync,
} from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const RUNNER_DIR = dirname(fileURLToPath(import.meta.url));
const EVALS_DIR = dirname(RUNNER_DIR);
const PLUGIN_ROOT = dirname(EVALS_DIR);
const SEEDS_DIR = join(PLUGIN_ROOT, "seeds");
const RULES_SRC = join(PLUGIN_ROOT, "rules");
const SKILLS_SRC = join(PLUGIN_ROOT, "skills");
const COMMANDS_SRC = join(PLUGIN_ROOT, "commands");
const FIXTURES_DIR = join(EVALS_DIR, "fixtures");
const TMP_DIR = join(EVALS_DIR, ".tmp");

export interface BuiltFixture {
  /** Absolute path to the assembled project cwd. */
  projectRoot: string;
  /** Cleanup hook — caller must invoke in a `finally`. */
  cleanup: () => void;
  /** Diagnostic info: relative paths of files coming from the overlay. */
  overlayFiles: string[];
}

function listFiles(root: string): string[] {
  const out: string[] = [];
  function walk(dir: string): void {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.isFile()) out.push(full);
    }
  }
  if (existsSync(root) && statSync(root).isDirectory()) walk(root);
  return out;
}

function ensureSeedsBuilt(): void {
  if (!existsSync(SEEDS_DIR)) {
    throw new Error(
      `seeds/ missing at ${SEEDS_DIR}. Run \`pnpm build\` before the eval suite.`,
    );
  }
}

export interface BuildFixtureOptions {
  fixture: string;
  /**
   * If set, the fixture is built under this absolute path instead of an
   * mkdtemp'd location. Used by `--keep` debugging.
   */
  outDir?: string;
}

export function buildFixture(opts: BuildFixtureOptions): BuiltFixture {
  ensureSeedsBuilt();

  const overlayDir = join(FIXTURES_DIR, opts.fixture);
  // It's fine for an overlay to be empty — that means "fresh harness, no
  // extra state" — but the directory must exist so we don't silently
  // typo-fixture-name into an empty fixture.
  if (!existsSync(overlayDir)) {
    throw new Error(
      `fixture "${opts.fixture}" not found at ${overlayDir}. ` +
        `Create the directory (it can be empty) or fix the scenario's "fixture:" field.`,
    );
  }

  if (!existsSync(TMP_DIR)) mkdirSync(TMP_DIR, { recursive: true });
  const projectRoot =
    opts.outDir ??
    mkdtempSync(join(TMP_DIR, `${opts.fixture}-`));

  // 1. Copy the seed payload (the harness as users get it).
  cpSync(SEEDS_DIR, projectRoot, { recursive: true });

  // 2. Lay the plugin's authored content into .cursor/{rules,skills,commands}.
  // In production these come from ~/.cursor/plugins/local/magik-repo/, but
  // for an isolated agent run we materialize them inside the project so
  // Cursor's resolver picks them up when the agent boots in projectRoot.
  // Skills here go alongside the seeded `_templates/` and `services/`,
  // not on top of them.
  cpSync(RULES_SRC, join(projectRoot, ".cursor", "rules"), { recursive: true });
  for (const skillName of readdirSync(SKILLS_SRC)) {
    const src = join(SKILLS_SRC, skillName);
    if (!statSync(src).isDirectory()) continue;
    const dst = join(projectRoot, ".cursor", "skills", skillName);
    cpSync(src, dst, { recursive: true });
  }
  cpSync(COMMANDS_SRC, join(projectRoot, ".cursor", "commands"), {
    recursive: true,
  });

  // 3. Apply the overlay last — it can override seed defaults.
  const overlayFiles: string[] = [];
  for (const abs of listFiles(overlayDir)) {
    const rel = relative(overlayDir, abs);
    const dst = join(projectRoot, rel);
    if (existsSync(dst)) {
      // Overlay overrides — most fixtures should add new files. Print a
      // soft notice so an accidental override is visible.
      process.stderr.write(
        `[fixture ${opts.fixture}] overlay overrides existing file: ${rel}\n`,
      );
    }
    mkdirSync(dirname(dst), { recursive: true });
    cpSync(abs, dst);
    overlayFiles.push(rel);
  }
  overlayFiles.sort();

  return {
    projectRoot,
    overlayFiles,
    cleanup: () => {
      // Only auto-clean fixtures we created via mkdtemp; --keep preserves them.
      if (!opts.outDir && existsSync(projectRoot)) {
        rmSync(projectRoot, { recursive: true, force: true });
      }
    },
  };
}
