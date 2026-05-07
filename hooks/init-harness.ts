#!/usr/bin/env -S npx --yes tsx
/**
 * /init-harness hook — v0.5.0
 *
 * Deterministic file ops that seed a project with the magik-repo harness:
 *   - AGENTS.md primer (marker-bounded prepend, in-place upgrade if stale)
 *   - .gitignore harness section (marker-bounded append, in-place upgrade if
 *     stale). v0.5.0: the harness section now also ignores `memory/`.
 *   - knowledge/, workspace/, codebase/ skeletons (skip-if-exists).
 *   - .cursor/ subtree (skill-authoring templates, services index,
 *     hooks/session-start.js, hooks/last-referenced-bump.js, hooks.json — all
 *     skip-if-exists; existing user hooks.json triggers a notice instead of
 *     a silent skip).
 *
 * v0.5.0: `memory/` is no longer seeded. It is gitignored runtime-local
 * agent state (parallel to workspace/); the agent creates `memory/daily/`
 * etc. on first write. Re-runs on a v0.4.x project upgrade the gitignore
 * block in place, which adds the `memory/` ignore line. Pre-existing
 * tracked memory files in the user's repo are left in place — `git rm`-ing
 * them is the user's call (CHANGELOG documents the migration). The seeds/
 * tree no longer contains memory/_index.md, memory/commitments.md, or
 * memory/{daily,distillations}/.gitkeep.
 *
 * v0.4.0 ships two project-side Cursor hooks:
 *   - sessionStart  → injects today's daily note + active commitments
 *                     into the session's initial system context.
 *   - postToolUse   → bumps `last_referenced` on KB entries when read,
 *                     7-day throttled.
 *
 * Source-of-truth for seed payload: <plugin-root>/seeds/, populated by
 * scripts/build.ts from <plugin-root>/seed-sources/.
 */

import {
  cpSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

// --- Constants ---------------------------------------------------------------

const PLUGIN_VERSION = "0.5.0";
const HOOK_DIR = dirname(fileURLToPath(import.meta.url));
const PLUGIN_ROOT = dirname(HOOK_DIR);
const SEEDS_DIR = join(PLUGIN_ROOT, "seeds");

const PRIMER_START = `<!-- harness:primer:start v=${PLUGIN_VERSION} -->`;
const PRIMER_END = "<!-- harness:primer:end -->";
const PRIMER_START_RE = /<!-- harness:primer:start v=([\d.]+) -->/;
const PRIMER_END_RE = /<!-- harness:primer:end -->/;

const GITIGNORE_START = `# harness:gitignore:start v=${PLUGIN_VERSION}`;
const GITIGNORE_END = "# harness:gitignore:end";
const GITIGNORE_START_RE = /^# harness:gitignore:start v=([\d.]+)$/m;
const GITIGNORE_END_RE = /^# harness:gitignore:end$/m;

// --- Types -------------------------------------------------------------------

interface CliArgs {
  dryRun: boolean;
  yes: boolean;
  projectRoot: string;
}

type PlanKind = "create" | "modify" | "skip" | "notice";

interface PlanItem {
  kind: PlanKind;
  target: string;
  reason: string;
  source?: string;
}

interface Plan {
  version: string;
  projectRoot: string;
  items: PlanItem[];
}

type MarkerState = "absent" | "clean" | "current" | "stale" | "corrupt";

// --- CLI parsing -------------------------------------------------------------

function parseArgs(argv: string[]): CliArgs {
  let dryRun = false;
  let yes = false;
  let projectRoot = process.cwd();

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]!;
    if (arg === "--dry-run") {
      dryRun = true;
    } else if (arg === "--yes" || arg === "-y") {
      yes = true;
    } else if (arg === "--project-root") {
      const next = argv[i + 1];
      if (!next) {
        throw new Error("--project-root requires a path argument");
      }
      projectRoot = resolve(next);
      i++;
    } else if (arg.startsWith("--project-root=")) {
      projectRoot = resolve(arg.slice("--project-root=".length));
    } else if (arg === "--version") {
      console.log(`magik-repo ${PLUGIN_VERSION}`);
      process.exit(0);
    } else if (arg === "--help" || arg === "-h") {
      printUsage();
      process.exit(0);
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  return { dryRun, yes, projectRoot };
}

function printUsage(): void {
  console.log(
    [
      "Usage: tsx hooks/init-harness.ts [options]",
      "",
      "Options:",
      "  --project-root <path>   Project root (default: cwd)",
      "  --dry-run               Print the plan; do not write",
      "  --yes, -y               Apply without prompting (no-op in v0.1.0)",
      "  --version               Print plugin version and exit",
      "  --help, -h              Show this help and exit",
    ].join("\n"),
  );
}

// --- Marker detection --------------------------------------------------------

function detectMarkerState(
  filePath: string,
  startRe: RegExp,
  endRe: RegExp,
): MarkerState {
  if (!existsSync(filePath)) return "absent";
  const content = readFileSync(filePath, "utf-8");

  const startMatches = content.match(new RegExp(startRe.source, "gm"));
  const endMatches = content.match(new RegExp(endRe.source, "gm"));

  const startCount = startMatches?.length ?? 0;
  const endCount = endMatches?.length ?? 0;

  if (startCount === 0 && endCount === 0) return "clean";
  if (startCount !== 1 || endCount !== 1) return "corrupt";

  const versionMatch = content.match(startRe);
  const detectedVersion = versionMatch?.[1];
  if (detectedVersion === PLUGIN_VERSION) return "current";
  return "stale";
}

function readMarkerVersion(filePath: string, startRe: RegExp): string | null {
  if (!existsSync(filePath)) return null;
  const content = readFileSync(filePath, "utf-8");
  const m = content.match(startRe);
  return m?.[1] ?? null;
}

// --- Seed payload ------------------------------------------------------------

function ensureSeedsAvailable(): void {
  if (!existsSync(SEEDS_DIR)) {
    throw new Error(
      `Seed payload missing at ${SEEDS_DIR}. Run \`pnpm build\` (or \`npm run build\`) to populate it.`,
    );
  }
}

function readSeed(relPath: string): string {
  const full = join(SEEDS_DIR, relPath);
  if (!existsSync(full)) {
    throw new Error(`Seed file missing: ${relPath} (looked in ${SEEDS_DIR})`);
  }
  return readFileSync(full, "utf-8");
}

/**
 * Walk a directory under SEEDS_DIR and produce a list of relative file paths
 * (relative to the seed subtree's root). Order is deterministic (sorted).
 */
function listSeedTree(seedSubpath: string): string[] {
  const root = join(SEEDS_DIR, seedSubpath);
  if (!existsSync(root)) return [];
  const out: string[] = [];

  function walk(dir: string): void {
    const entries = readdirSync(dir, { withFileTypes: true }).sort((a, b) =>
      a.name.localeCompare(b.name),
    );
    for (const entry of entries) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(full);
      } else if (entry.isFile()) {
        out.push(relative(root, full));
      }
    }
  }

  walk(root);
  return out;
}

// --- Plan building -----------------------------------------------------------

function buildPlan(args: CliArgs): Plan {
  ensureSeedsAvailable();
  const items: PlanItem[] = [];
  const root = args.projectRoot;

  // AGENTS.md
  const agentsPath = join(root, "AGENTS.md");
  const agentsState = detectMarkerState(agentsPath, PRIMER_START_RE, PRIMER_END_RE);
  switch (agentsState) {
    case "absent":
      items.push({
        kind: "create",
        target: "AGENTS.md",
        reason: "create with harness primer block",
        source: "AGENTS.primer.md",
      });
      break;
    case "clean":
      items.push({
        kind: "modify",
        target: "AGENTS.md",
        reason: "prepend harness primer block",
        source: "AGENTS.primer.md",
      });
      break;
    case "current":
      items.push({
        kind: "skip",
        target: "AGENTS.md",
        reason: `already harnessed at v=${PLUGIN_VERSION}`,
      });
      break;
    case "stale": {
      const oldVersion = readMarkerVersion(agentsPath, PRIMER_START_RE);
      items.push({
        kind: "modify",
        target: "AGENTS.md",
        reason: `upgrade harness primer block (v=${oldVersion ?? "unknown"} → v=${PLUGIN_VERSION})`,
        source: "AGENTS.primer.md",
      });
      break;
    }
    case "corrupt":
      items.push({
        kind: "skip",
        target: "AGENTS.md",
        reason: "multiple/unmatched harness markers — fix manually",
      });
      break;
  }

  // .gitignore
  const gitignorePath = join(root, ".gitignore");
  const gitignoreState = detectMarkerState(
    gitignorePath,
    GITIGNORE_START_RE,
    GITIGNORE_END_RE,
  );
  switch (gitignoreState) {
    case "absent":
      items.push({
        kind: "create",
        target: ".gitignore",
        reason: "create with harness section",
        source: "gitignore.harness",
      });
      break;
    case "clean":
      items.push({
        kind: "modify",
        target: ".gitignore",
        reason: "append harness section",
        source: "gitignore.harness",
      });
      break;
    case "current":
      items.push({
        kind: "skip",
        target: ".gitignore",
        reason: `already harnessed at v=${PLUGIN_VERSION}`,
      });
      break;
    case "stale": {
      const oldVersion = readMarkerVersion(gitignorePath, GITIGNORE_START_RE);
      items.push({
        kind: "modify",
        target: ".gitignore",
        reason: `upgrade harness section (v=${oldVersion ?? "unknown"} → v=${PLUGIN_VERSION})`,
        source: "gitignore.harness",
      });
      break;
    }
    case "corrupt":
      items.push({
        kind: "skip",
        target: ".gitignore",
        reason: "multiple/unmatched harness markers — fix manually",
      });
      break;
  }

  // knowledge/ tree
  for (const relPath of listSeedTree("knowledge")) {
    const target = join("knowledge", relPath);
    const fullTarget = join(root, target);
    if (existsSync(fullTarget)) {
      items.push({
        kind: "skip",
        target,
        reason: "exists; not overwriting",
      });
    } else {
      items.push({
        kind: "create",
        target,
        reason: "create from seed",
        source: join("knowledge", relPath),
      });
    }
  }

  // memory/
  for (const relPath of listSeedTree("memory")) {
    const target = join("memory", relPath);
    const fullTarget = join(root, target);
    if (existsSync(fullTarget)) {
      items.push({
        kind: "skip",
        target,
        reason: "exists; not overwriting",
      });
    } else {
      items.push({
        kind: "create",
        target,
        reason: "create from seed",
        source: join("memory", relPath),
      });
    }
  }

  // workspace/
  for (const relPath of listSeedTree("workspace")) {
    const target = join("workspace", relPath);
    const fullTarget = join(root, target);
    if (existsSync(fullTarget)) {
      items.push({
        kind: "skip",
        target,
        reason: "exists; not overwriting",
      });
    } else {
      items.push({
        kind: "create",
        target,
        reason: "create from seed",
        source: join("workspace", relPath),
      });
    }
  }

  // codebase/
  const codebaseDir = join(root, "codebase");
  const codebaseHasContent =
    existsSync(codebaseDir) &&
    readdirSync(codebaseDir).some((name) => name !== "README.md");
  for (const relPath of listSeedTree("codebase")) {
    const target = join("codebase", relPath);
    const fullTarget = join(root, target);
    if (existsSync(fullTarget)) {
      items.push({
        kind: "skip",
        target,
        reason: "exists; not overwriting",
      });
    } else if (codebaseHasContent && relPath === "README.md") {
      items.push({
        kind: "skip",
        target,
        reason: "codebase/ already populated; not seeding README",
      });
    } else {
      items.push({
        kind: "create",
        target,
        reason: "create from seed",
        source: join("codebase", relPath),
      });
    }
  }

  // .cursor/ — project-side scaffolding seeded by the harness:
  //   - skills/_templates/<file>.md  : scaffolding-author input templates
  //   - skills/services/_index.md   : services-skill area placeholder
  //   - hooks/session-start.js      : sessionStart hook (memory injection)
  //   - hooks/last-referenced-bump.js : postToolUse hook for KB read tracking
  //   - hooks.json                  : wires the above into Cursor's hook surface
  // Plugin-distributed framework content (rules + _core skills) is NOT
  // seeded — it comes from the magik-repo plugin install.
  for (const relPath of listSeedTree(".cursor")) {
    const target = join(".cursor", relPath);
    const fullTarget = join(root, target);
    if (existsSync(fullTarget)) {
      // Existing user-authored .cursor/hooks.json — surface a clear notice
      // rather than the generic "exists" line, since silent skip would mean
      // the harness hooks are never wired.
      if (relPath === "hooks.json") {
        items.push({
          kind: "notice",
          target,
          reason:
            "user .cursor/hooks.json already present — harness hooks not auto-merged. " +
            "To enable sessionStart memory injection and postToolUse last_referenced bumping, " +
            "merge the entries from seeds/.cursor/hooks.json (plugin-side) into your hooks.json.",
        });
      } else {
        items.push({
          kind: "skip",
          target,
          reason: "exists; not overwriting",
        });
      }
    } else {
      items.push({
        kind: "create",
        target,
        reason: "create from seed",
        source: join(".cursor", relPath),
      });
    }
  }

  // Code-at-root notice (informational only in v0.1.0).
  const codeAtRoot = detectCodeAtRoot(root);
  if (codeAtRoot.length > 0) {
    items.push({
      kind: "notice",
      target: "<repo root>",
      reason: `detected ${codeAtRoot.join(", ")} at repo root — the harness expects code under codebase/. Not moved. See codebase/README.md for migration patterns.`,
    });
  }

  return {
    version: PLUGIN_VERSION,
    projectRoot: root,
    items,
  };
}

const CODE_AT_ROOT_FILES = [
  "package.json",
  "pnpm-lock.yaml",
  "yarn.lock",
  "bun.lockb",
  "pyproject.toml",
  "poetry.lock",
  "uv.lock",
  "requirements.txt",
  "Cargo.toml",
  "go.mod",
  "Gemfile",
  "mix.exs",
  "composer.json",
  "pom.xml",
  "build.gradle",
];

function detectCodeAtRoot(root: string): string[] {
  const hits: string[] = [];
  for (const f of CODE_AT_ROOT_FILES) {
    if (existsSync(join(root, f))) hits.push(f);
  }
  const srcDir = join(root, "src");
  if (existsSync(srcDir) && statSync(srcDir).isDirectory()) {
    const entries = readdirSync(srcDir);
    if (entries.length > 0) hits.push("src/");
  }
  return hits;
}

// --- Plan printing -----------------------------------------------------------

function printPlan(plan: Plan): void {
  const creates = plan.items.filter((i) => i.kind === "create");
  const modifies = plan.items.filter((i) => i.kind === "modify");
  const skips = plan.items.filter((i) => i.kind === "skip");
  const notices = plan.items.filter((i) => i.kind === "notice");

  console.log(`/init-harness — plan (magik-repo@${plan.version})`);
  console.log(`  project root: ${plan.projectRoot}`);
  console.log("");

  function block(label: string, items: PlanItem[]): void {
    if (items.length === 0) return;
    console.log(`  ${label}:`);
    for (const item of items) {
      console.log(`    ${item.target.padEnd(48)} ${item.reason}`);
    }
    console.log("");
  }

  block("Create", creates);
  block("Modify", modifies);
  block("Skip", skips);

  if (notices.length > 0) {
    console.log("  Notices:");
    for (const n of notices) {
      console.log(`    ${n.target}: ${n.reason}`);
    }
    console.log("");
  }

  console.log(
    `  Net writes: ${creates.length} create, ${modifies.length} modify, ${skips.length} skip, ${notices.length} notice.`,
  );
}

// --- Apply -------------------------------------------------------------------

function ensureDir(dir: string): void {
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
}

function prependPrimer(filePath: string, body: string): void {
  const block = `${PRIMER_START}\n\n${body.trim()}\n\n${PRIMER_END}`;
  if (!existsSync(filePath)) {
    writeFileSync(filePath, `${block}\n`);
    return;
  }
  const existing = readFileSync(filePath, "utf-8");
  // Edge case: file ends without trailing newline. Normalize one.
  const normalized = existing.endsWith("\n") ? existing : `${existing}\n`;
  writeFileSync(filePath, `${block}\n\n${normalized}`);
}

function appendGitignoreSection(filePath: string, body: string): void {
  const block = `${GITIGNORE_START}\n\n${body.trim()}\n\n${GITIGNORE_END}`;
  if (!existsSync(filePath)) {
    writeFileSync(filePath, `${block}\n`);
    return;
  }
  const existing = readFileSync(filePath, "utf-8");
  const normalized = existing.endsWith("\n") ? existing : `${existing}\n`;
  writeFileSync(filePath, `${normalized}\n${block}\n`);
}

/**
 * Replace an existing marker-bounded block in place. Used to upgrade an
 * older harness version's primer/gitignore section to the current one
 * while preserving everything outside the markers verbatim.
 */
function replaceMarkerBlock(
  filePath: string,
  startRe: RegExp,
  endRe: RegExp,
  newBlock: string,
): void {
  const existing = readFileSync(filePath, "utf-8");
  const startMatch = existing.match(startRe);
  const endMatch = existing.match(endRe);
  if (!startMatch || !endMatch) {
    throw new Error(
      `cannot replace block in ${filePath}: start or end marker missing`,
    );
  }
  const startIdx = existing.indexOf(startMatch[0]);
  const endIdx = existing.indexOf(endMatch[0]) + endMatch[0].length;
  if (startIdx < 0 || endIdx <= startIdx) {
    throw new Error(`cannot replace block in ${filePath}: marker order invalid`);
  }
  const before = existing.slice(0, startIdx);
  const after = existing.slice(endIdx);
  writeFileSync(filePath, `${before}${newBlock}${after}`);
}

function copySeedFile(seedRelPath: string, targetAbs: string): void {
  ensureDir(dirname(targetAbs));
  cpSync(join(SEEDS_DIR, seedRelPath), targetAbs);
}

function applyPlan(plan: Plan): void {
  for (const item of plan.items) {
    const target = join(plan.projectRoot, item.target);
    if (item.kind === "skip" || item.kind === "notice") continue;

    if (item.target === "AGENTS.md") {
      const body = readSeed("AGENTS.primer.md");
      const state = detectMarkerState(target, PRIMER_START_RE, PRIMER_END_RE);
      if (state === "stale") {
        const block = `${PRIMER_START}\n\n${body.trim()}\n\n${PRIMER_END}`;
        replaceMarkerBlock(target, PRIMER_START_RE, PRIMER_END_RE, block);
      } else {
        prependPrimer(target, body);
      }
      continue;
    }

    if (item.target === ".gitignore") {
      const body = readSeed("gitignore.harness");
      const state = detectMarkerState(
        target,
        GITIGNORE_START_RE,
        GITIGNORE_END_RE,
      );
      if (state === "stale") {
        const block = `${GITIGNORE_START}\n\n${body.trim()}\n\n${GITIGNORE_END}`;
        replaceMarkerBlock(target, GITIGNORE_START_RE, GITIGNORE_END_RE, block);
      } else {
        appendGitignoreSection(target, body);
      }
      continue;
    }

    if (item.kind === "create" && item.source) {
      copySeedFile(item.source, target);
    }
  }
}

// --- Main --------------------------------------------------------------------

function main(): void {
  let args: CliArgs;
  try {
    args = parseArgs(process.argv.slice(2));
  } catch (err) {
    console.error(`error: ${(err as Error).message}`);
    printUsage();
    process.exit(1);
  }

  let plan: Plan;
  try {
    plan = buildPlan(args);
  } catch (err) {
    console.error(`error: ${(err as Error).message}`);
    process.exit(1);
  }

  printPlan(plan);

  if (args.dryRun) {
    console.log("\n(dry run — no files written)");
    process.exit(0);
  }

  try {
    applyPlan(plan);
  } catch (err) {
    console.error(`error during apply: ${(err as Error).message}`);
    process.exit(1);
  }

  console.log("\n/init-harness — applied (magik-repo@" + PLUGIN_VERSION + ")");
  console.log("\nNext: run /audit to pick your starting domains.");
  process.exit(0);
}

main();
