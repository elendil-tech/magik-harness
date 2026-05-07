/**
 * evals/runner/fixture.ts — build a ready-to-run agent cwd from one of
 * two fixture shapes.
 *
 * **Harnessed fixture (default).** Combines the seed payload (`seeds/`,
 * the harness as users get it) with a scenario-specific overlay
 * directory (`evals/fixtures/<name>/`). The seed gives us a harnessed
 * project (rules / skills / commands / knowledge skeletons / hook
 * seeds). The overlay adds whatever the scenario needs on top: a
 * populated KB entry, a pre-seeded registry, etc.
 *
 *   Overlay rules:
 *     - Files that don't exist in the seed are *added*.
 *     - Files that exist in the seed are *replaced* (with a soft warning
 *       printed to stderr — most overlays should add, not replace).
 *     - The seed is also written into the project's `.cursor/rules/`,
 *       `.cursor/skills/`, and `.cursor/commands/` so the agent has the
 *       full plugin payload available, since in the real product those
 *       come from the installed plugin (~/.cursor/plugins/local/magik-repo/).
 *
 * **No-harness fixture (control).** Used by `--control` mode for
 * content-only twins of harnessed fixtures. Declared by a `.fixture.json`
 * file inside the fixture directory containing `{"harness": false}`.
 * The runner skips ALL seed / `AGENTS.md` / `.cursor/` materialization
 * and just copies the fixture's contents verbatim as the project root.
 * The agent sees the same project *facts* but none of the harness's
 * organization, retrieval skills, or rules — so the delta vs. the
 * harnessed twin isolates the harness's contribution to self-steering.
 *
 * The result is an absolute path under `os.tmpdir()/magik-repo-evals/`
 * (outside the plugin source tree on purpose; see `TMP_DIR` rationale
 * below). The caller is responsible for cleanup; the CLI uses
 * `try/finally rmSync`.
 */

import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
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

/**
 * Built fixtures live OUTSIDE the plugin source tree on purpose. If we
 * built them inside the project (e.g. `evals/.tmp/`), an agent under
 * test could break out of its CWD via broad `glob`, `grep`, or
 * absolute-path reads and accidentally find the source `evals/fixtures/`,
 * the plugin's `rules/`, `skills/`, `seeds/`, etc. — contaminating the
 * eval. Particularly catastrophic for content-only control fixtures:
 * they would be able to read from the harnessed twin's better-organized
 * source files, defeating the comparison.
 *
 * `os.tmpdir()` resolves to /tmp (Linux/macOS) or %LOCALAPPDATA%\Temp
 * (Windows), well outside any project home.
 */
const TMP_DIR = join(tmpdir(), "magik-repo-evals");

export interface BuiltFixture {
  /** Absolute path to the assembled project cwd. */
  projectRoot: string;
  /** Cleanup hook — caller must invoke in a `finally`. */
  cleanup: () => void;
  /** Diagnostic info: relative paths of files coming from the overlay. */
  overlayFiles: string[];
  /**
   * Whether this fixture provides the harness wiring. `true` (default)
   * means seeds + AGENTS.md + .cursor/{rules,skills,commands} were laid
   * out before the overlay. `false` means the fixture was copied verbatim
   * — used for content-only control twins. Read from the fixture's
   * `.fixture.json` `harness` field; defaults to `true` when absent.
   */
  harness: boolean;
}

interface FixtureMeta {
  harness?: boolean;
  description?: string;
  twin_of?: string;
  purpose?: string;
}

function readFixtureMeta(fixtureDir: string): FixtureMeta {
  const metaPath = join(fixtureDir, ".fixture.json");
  if (!existsSync(metaPath)) return {};
  try {
    return JSON.parse(readFileSync(metaPath, "utf-8")) as FixtureMeta;
  } catch (err) {
    throw new Error(
      `fixture ${fixtureDir}: invalid .fixture.json — ${(err as Error).message}`,
    );
  }
}

/**
 * Top-level fixture subdirectories that should NEVER be copied as
 * fixture content, even if they exist on disk. These are runtime-local
 * lanes — when an agent runs against a fixture, it may write into
 * `workspace/` (craft artifacts) and `memory/` (thought artifacts).
 * Without this guard, those writes leak into every subsequent run of
 * the same fixture, polluting the test environment with agent-
 * generated state from a previous session.
 *
 * Both lanes are also git-ignored under each fixture directory so
 * they don't pollute the source tree (see `evals/fixtures/<name>/`
 * patterns in .gitignore). This list is the runtime-side counterpart
 * of that gitignore rule.
 */
const FIXTURE_RUNTIME_DIRS = new Set(["workspace", "memory"]);

function listFiles(root: string): string[] {
  const out: string[] = [];
  function walk(dir: string, depth: number): void {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      // Skip runtime-local lanes at the top level only; a fixture's
      // documented content can legitimately live under any other path.
      if (depth === 0 && entry.isDirectory() && FIXTURE_RUNTIME_DIRS.has(entry.name)) {
        continue;
      }
      const full = join(dir, entry.name);
      if (entry.isDirectory()) walk(full, depth + 1);
      else if (entry.isFile()) out.push(full);
    }
  }
  if (existsSync(root) && statSync(root).isDirectory()) walk(root, 0);
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

  const meta = readFixtureMeta(overlayDir);
  const harness = meta.harness ?? true;

  // No-harness fixtures (control twins) skip all seed / AGENTS.md /
  // .cursor materialization. The fixture is copied verbatim as the
  // project root — the agent sees only what the user authored under
  // `evals/fixtures/<name>/`. Used by `--control` mode to measure the
  // harness's contribution to self-steering.
  if (!harness) return buildBareFixture(opts, overlayDir);

  ensureSeedsBuilt();

  if (!existsSync(TMP_DIR)) mkdirSync(TMP_DIR, { recursive: true });
  const projectRoot =
    opts.outDir ??
    mkdtempSync(join(TMP_DIR, `${opts.fixture}-`));

  // 1. Copy the seed payload (the harness as users get it).
  cpSync(SEEDS_DIR, projectRoot, { recursive: true });

  // 1b. Materialize the primer as AGENTS.md so Cursor's primer
  // discovery picks it up. In production /init-harness does the
  // marker-aware merge into the user's AGENTS.md; in the eval
  // fixture the project starts empty so we just wrap the primer
  // body in the same harness markers and write it out.
  //
  // Without this step, the primer (which carries the always-loaded
  // harness contract) never reaches the agent — the v0.4.1 baseline
  // ran with this gap and the harness's "mandatory protocols"
  // language was not in scope. This was the single biggest reason
  // for the eval-vs-production behavior delta.
  const primerSrc = join(projectRoot, "AGENTS.primer.md");
  const agentsMdDst = join(projectRoot, "AGENTS.md");
  if (existsSync(primerSrc) && !existsSync(agentsMdDst)) {
    const primerBody = readFileSync(primerSrc, "utf-8").trimEnd();
    // Read the canonical version from package.json so the marker
    // stays in sync with releases. The file lives at the plugin
    // root, two levels above evals/runner/.
    const pkg = JSON.parse(
      readFileSync(join(PLUGIN_ROOT, "package.json"), "utf-8"),
    ) as { version?: string };
    const v = pkg.version ?? "0.0.0";
    const wrapped = [
      `<!-- harness:primer:start v=${v} -->`,
      primerBody,
      `<!-- harness:primer:end -->`,
      "",
    ].join("\n");
    writeFileSync(agentsMdDst, wrapped);
  }

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
    // `.fixture.json` is metadata for the runner, not content for the
    // agent. Skip it when materializing the project root.
    if (rel === ".fixture.json") continue;
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
    harness: true,
    cleanup: () => {
      // Only auto-clean fixtures we created via mkdtemp; --keep preserves them.
      if (!opts.outDir && existsSync(projectRoot)) {
        rmSync(projectRoot, { recursive: true, force: true });
      }
    },
  };
}

/**
 * Build a no-harness ("content-only") fixture. The fixture's directory
 * contents are copied verbatim into a fresh project root — no seeds, no
 * AGENTS.md, no .cursor/. The `.fixture.json` metadata file is skipped
 * (it's runner config, not project content).
 */
function buildBareFixture(
  opts: BuildFixtureOptions,
  fixtureDir: string,
): BuiltFixture {
  if (!existsSync(TMP_DIR)) mkdirSync(TMP_DIR, { recursive: true });
  const projectRoot =
    opts.outDir ??
    mkdtempSync(join(TMP_DIR, `${opts.fixture}-bare-`));

  const overlayFiles: string[] = [];
  for (const abs of listFiles(fixtureDir)) {
    const rel = relative(fixtureDir, abs);
    if (rel === ".fixture.json") continue;
    const dst = join(projectRoot, rel);
    mkdirSync(dirname(dst), { recursive: true });
    cpSync(abs, dst);
    overlayFiles.push(rel);
  }
  overlayFiles.sort();

  return {
    projectRoot,
    overlayFiles,
    harness: false,
    cleanup: () => {
      if (!opts.outDir && existsSync(projectRoot)) {
        rmSync(projectRoot, { recursive: true, force: true });
      }
    },
  };
}
