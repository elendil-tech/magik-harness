#!/usr/bin/env -S npx --yes tsx
/**
 * /setup hook — magik-repo v1.0 (the light harness).
 *
 * The repo is a normal code repo. Knowledge (the project's ground truth) and
 * memory (the agent's running log) live in an EXTERNAL vault and are resolved
 * through a tracked pointer at `.cursor/harness.json`. How the vault itself is
 * stored or git-tracked is the user's choice — the harness only points at it.
 * This hook performs the deterministic
 * file ops behind the interactive `/magik-repo-setup` command, given the answers the
 * agent collected (vault path + knowledge/memory mounts + access method):
 *
 *   Repo side (the code repo):
 *     - .cursor/harness.json     : the vault pointer (skip if present)
 *     - AGENTS.md                : marker-bounded primer block (prepend/upgrade)
 *     - .gitignore               : marker-bounded secret-hygiene block (append/upgrade)
 *     - .cursor/hooks/session-start.js + .cursor/hooks.json : memory injection (skip if present)
 *
 *   Vault side (the external store; only when accessVia=path):
 *     - <vault>/<knowledge-mount>/_index.md : orientation stub (skip if present)
 *     - <vault>/<memory-mount>/             : created if missing
 *
 * How the vault is stored or git-tracked is entirely the user's choice — the
 * harness only points at it. Setup never runs `git init` on the vault or writes
 * a vault `.gitignore`; it does not manage how the vault is stored or tracked.
 *
 * No knowledge/, memory/, workspace/, or codebase/ folders are created in the
 * code repo — those concepts are gone in v1.0. Full spec:
 * bundles/ARCHITECTURE-v1.md.
 *
 * Source-of-truth for the seed payload: <plugin-root>/seeds/, populated by
 * scripts/build.ts from <plugin-root>/seed-sources/.
 */

import {
  cpSync,
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { homedir } from "node:os";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

// --- Constants ---------------------------------------------------------------

const PLUGIN_VERSION = "1.2.0";
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

type AccessVia = "path" | "mcp";

interface CliArgs {
  dryRun: boolean;
  projectRoot: string;
  vault: string | null;
  knowledgeMount: string;
  memoryMount: string;
  accessVia: AccessVia;
}

type PlanKind = "create" | "modify" | "skip" | "notice";

interface PlanItem {
  kind: PlanKind;
  target: string;
  reason: string;
  apply?: () => void;
}

type MarkerState = "absent" | "clean" | "current" | "stale" | "corrupt";

// --- CLI parsing -------------------------------------------------------------

function parseArgs(argv: string[]): CliArgs {
  let dryRun = false;
  let projectRoot = process.cwd();
  let vault: string | null = null;
  let knowledgeMount = "knowledge";
  let memoryMount = "memory";
  let accessVia: AccessVia = "path";

  function takeValue(arg: string, inline: string | undefined, next: string | undefined): { value: string; consumedNext: boolean } {
    if (inline !== undefined) return { value: inline, consumedNext: false };
    if (next === undefined) throw new Error(`${arg} requires a value`);
    return { value: next, consumedNext: true };
  }

  for (let i = 0; i < argv.length; i++) {
    const raw = argv[i]!;
    const eq = raw.indexOf("=");
    const flag = eq >= 0 ? raw.slice(0, eq) : raw;
    const inline = eq >= 0 ? raw.slice(eq + 1) : undefined;
    const next = argv[i + 1];

    switch (flag) {
      case "--dry-run":
        dryRun = true;
        break;
      case "--yes":
      case "-y":
        break; // accepted for symmetry; setup never prompts
      case "--project-root": {
        const { value, consumedNext } = takeValue(flag, inline, next);
        projectRoot = resolve(value);
        if (consumedNext) i++;
        break;
      }
      case "--vault": {
        const { value, consumedNext } = takeValue(flag, inline, next);
        vault = value;
        if (consumedNext) i++;
        break;
      }
      case "--knowledge-mount": {
        const { value, consumedNext } = takeValue(flag, inline, next);
        knowledgeMount = value.replace(/^\/+|\/+$/g, "");
        if (consumedNext) i++;
        break;
      }
      case "--memory-mount": {
        const { value, consumedNext } = takeValue(flag, inline, next);
        memoryMount = value.replace(/^\/+|\/+$/g, "");
        if (consumedNext) i++;
        break;
      }
      case "--access-via": {
        const { value, consumedNext } = takeValue(flag, inline, next);
        if (value !== "path" && value !== "mcp") {
          throw new Error(`--access-via must be "path" or "mcp" (got "${value}")`);
        }
        accessVia = value;
        if (consumedNext) i++;
        break;
      }
      case "--version":
        console.log(`magik-repo ${PLUGIN_VERSION}`);
        process.exit(0);
        break;
      case "--help":
      case "-h":
        printUsage();
        process.exit(0);
        break;
      default:
        throw new Error(`Unknown argument: ${raw}`);
    }
  }

  return { dryRun, projectRoot, vault, knowledgeMount, memoryMount, accessVia };
}

function printUsage(): void {
  console.log(
    [
      "Usage: tsx hooks/setup.ts [options]",
      "",
      "Options:",
      "  --vault <path>            External vault root (supports ~). Required for accessVia=path.",
      "  --knowledge-mount <rel>   KB path under the vault (default: knowledge).",
      "  --memory-mount <rel>      Memory path under the vault (default: memory).",
      "  --access-via <path|mcp>   How workers reach the vault (default: path).",
      "  --project-root <path>     The code repo root (default: cwd).",
      "  --dry-run                 Print the plan; do not write.",
      "  --version                 Print plugin version and exit.",
      "  --help, -h                Show this help and exit.",
    ].join("\n"),
  );
}

// --- Helpers -----------------------------------------------------------------

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

function expandTilde(p: string): string {
  if (p === "~") return homedir();
  if (p.startsWith("~/")) return join(homedir(), p.slice(2));
  return p;
}

function ensureDir(dir: string): void {
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
}

function detectMarkerState(
  filePath: string,
  startRe: RegExp,
  endRe: RegExp,
): MarkerState {
  if (!existsSync(filePath)) return "absent";
  const content = readFileSync(filePath, "utf-8");
  const startCount = content.match(new RegExp(startRe.source, "gm"))?.length ?? 0;
  const endCount = content.match(new RegExp(endRe.source, "gm"))?.length ?? 0;
  if (startCount === 0 && endCount === 0) return "clean";
  if (startCount !== 1 || endCount !== 1) return "corrupt";
  const detected = content.match(startRe)?.[1];
  return detected === PLUGIN_VERSION ? "current" : "stale";
}

function readMarkerVersion(filePath: string, startRe: RegExp): string | null {
  if (!existsSync(filePath)) return null;
  return readFileSync(filePath, "utf-8").match(startRe)?.[1] ?? null;
}

function prependBlock(filePath: string, block: string): void {
  if (!existsSync(filePath)) {
    writeFileSync(filePath, `${block}\n`);
    return;
  }
  const existing = readFileSync(filePath, "utf-8");
  const normalized = existing.endsWith("\n") ? existing : `${existing}\n`;
  writeFileSync(filePath, `${block}\n\n${normalized}`);
}

function appendBlock(filePath: string, block: string): void {
  if (!existsSync(filePath)) {
    writeFileSync(filePath, `${block}\n`);
    return;
  }
  const existing = readFileSync(filePath, "utf-8");
  const normalized = existing.endsWith("\n") ? existing : `${existing}\n`;
  writeFileSync(filePath, `${normalized}\n${block}\n`);
}

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
    throw new Error(`cannot replace block in ${filePath}: marker missing`);
  }
  const startIdx = existing.indexOf(startMatch[0]);
  const endIdx = existing.indexOf(endMatch[0]) + endMatch[0].length;
  if (startIdx < 0 || endIdx <= startIdx) {
    throw new Error(`cannot replace block in ${filePath}: marker order invalid`);
  }
  writeFileSync(
    filePath,
    `${existing.slice(0, startIdx)}${newBlock}${existing.slice(endIdx)}`,
  );
}

// --- Manifest generation -----------------------------------------------------

/**
 * Render `.cursor/harness.json` from the seed template by substituting the
 * quoted placeholder tokens with the collected answers. Quoted-in / quoted-out
 * substitution keeps the result valid JSON; a null vault (mcp with no local
 * path) is rendered as a bare `null`.
 */
function renderManifest(args: CliArgs): string {
  const template = readSeed(".cursor/harness.json");
  return template
    .replace('"__VAULT__"', JSON.stringify(args.vault))
    .replace('"__KNOWLEDGE_MOUNT__"', JSON.stringify(args.knowledgeMount))
    .replace('"__MEMORY_MOUNT__"', JSON.stringify(args.memoryMount))
    .replace(/"__ACCESS_VIA__"/g, JSON.stringify(args.accessVia));
}

// --- Plan building -----------------------------------------------------------

function buildPlan(args: CliArgs): PlanItem[] {
  ensureSeedsAvailable();
  const items: PlanItem[] = [];
  const root = args.projectRoot;

  if (args.accessVia === "path" && !args.vault) {
    throw new Error("--vault is required when --access-via=path");
  }

  // 1. .cursor/harness.json (the pointer)
  const manifestPath = join(root, ".cursor", "harness.json");
  if (existsSync(manifestPath)) {
    items.push({
      kind: "skip",
      target: ".cursor/harness.json",
      reason: "exists; not overwriting (edit it directly to re-point the vault)",
    });
  } else {
    items.push({
      kind: "create",
      target: ".cursor/harness.json",
      reason: `vault pointer → ${args.vault ?? "(mcp)"}`,
      apply: () => {
        ensureDir(dirname(manifestPath));
        writeFileSync(manifestPath, renderManifest(args));
      },
    });
  }

  // 2. AGENTS.md primer
  const agentsPath = join(root, "AGENTS.md");
  const agentsState = detectMarkerState(agentsPath, PRIMER_START_RE, PRIMER_END_RE);
  const primerBody = readSeed("AGENTS.primer.md").trim();
  const primerBlock = `${PRIMER_START}\n\n${primerBody}\n\n${PRIMER_END}`;
  switch (agentsState) {
    case "absent":
    case "clean":
      items.push({
        kind: agentsState === "absent" ? "create" : "modify",
        target: "AGENTS.md",
        reason: agentsState === "absent" ? "create with harness primer" : "prepend harness primer",
        apply: () => prependBlock(agentsPath, primerBlock),
      });
      break;
    case "current":
      items.push({ kind: "skip", target: "AGENTS.md", reason: `already harnessed at v=${PLUGIN_VERSION}` });
      break;
    case "stale": {
      const old = readMarkerVersion(agentsPath, PRIMER_START_RE);
      items.push({
        kind: "modify",
        target: "AGENTS.md",
        reason: `upgrade harness primer (v=${old ?? "?"} → v=${PLUGIN_VERSION})`,
        apply: () => replaceMarkerBlock(agentsPath, PRIMER_START_RE, PRIMER_END_RE, primerBlock),
      });
      break;
    }
    case "corrupt":
      items.push({ kind: "skip", target: "AGENTS.md", reason: "multiple/unmatched harness markers — fix manually" });
      break;
  }

  // 3. .gitignore secret-hygiene block
  const gitignorePath = join(root, ".gitignore");
  const giState = detectMarkerState(gitignorePath, GITIGNORE_START_RE, GITIGNORE_END_RE);
  const giBody = readSeed("gitignore.harness").trim();
  const giBlock = `${GITIGNORE_START}\n\n${giBody}\n\n${GITIGNORE_END}`;
  switch (giState) {
    case "absent":
    case "clean":
      items.push({
        kind: giState === "absent" ? "create" : "modify",
        target: ".gitignore",
        reason: giState === "absent" ? "create with harness section" : "append harness section",
        apply: () => appendBlock(gitignorePath, giBlock),
      });
      break;
    case "current":
      items.push({ kind: "skip", target: ".gitignore", reason: `already harnessed at v=${PLUGIN_VERSION}` });
      break;
    case "stale": {
      const old = readMarkerVersion(gitignorePath, GITIGNORE_START_RE);
      items.push({
        kind: "modify",
        target: ".gitignore",
        reason: `upgrade harness section (v=${old ?? "?"} → v=${PLUGIN_VERSION})`,
        apply: () => replaceMarkerBlock(gitignorePath, GITIGNORE_START_RE, GITIGNORE_END_RE, giBlock),
      });
      break;
    }
    case "corrupt":
      items.push({ kind: "skip", target: ".gitignore", reason: "multiple/unmatched harness markers — fix manually" });
      break;
  }

  // 4. Project hooks (session-start + hooks.json)
  const hookTarget = join(root, ".cursor", "hooks", "session-start.js");
  if (existsSync(hookTarget)) {
    items.push({ kind: "skip", target: ".cursor/hooks/session-start.js", reason: "exists; not overwriting" });
  } else {
    items.push({
      kind: "create",
      target: ".cursor/hooks/session-start.js",
      reason: "memory injection hook",
      apply: () => {
        ensureDir(dirname(hookTarget));
        cpSync(join(SEEDS_DIR, ".cursor/hooks/session-start.js"), hookTarget);
      },
    });
  }

  const hooksJsonTarget = join(root, ".cursor", "hooks.json");
  if (existsSync(hooksJsonTarget)) {
    items.push({
      kind: "notice",
      target: ".cursor/hooks.json",
      reason:
        "user .cursor/hooks.json already present — harness hooks not auto-merged. " +
        "To enable sessionStart memory injection, merge the sessionStart entry from " +
        "seeds/.cursor/hooks.json (plugin-side) into your hooks.json.",
    });
  } else {
    items.push({
      kind: "create",
      target: ".cursor/hooks.json",
      reason: "wire sessionStart",
      apply: () => {
        ensureDir(dirname(hooksJsonTarget));
        cpSync(join(SEEDS_DIR, ".cursor/hooks.json"), hooksJsonTarget);
      },
    });
  }

  // 5. Vault scaffolding (path access only)
  if (args.accessVia === "path" && args.vault) {
    const vaultRoot = expandTilde(args.vault);
    const vaultAbs = isAbsolute(vaultRoot) ? vaultRoot : resolve(root, vaultRoot);

    const kbIndex = join(vaultAbs, args.knowledgeMount, "_index.md");
    if (existsSync(kbIndex)) {
      items.push({ kind: "skip", target: relForVault(args, "_index.md", "knowledge"), reason: "exists; not overwriting" });
    } else {
      items.push({
        kind: "create",
        target: relForVault(args, "_index.md", "knowledge"),
        reason: "KB orientation stub",
        apply: () => {
          ensureDir(dirname(kbIndex));
          cpSync(join(SEEDS_DIR, "vault/knowledge/_index.md"), kbIndex);
        },
      });
    }

    const memDir = join(vaultAbs, args.memoryMount);
    if (!existsSync(memDir)) {
      items.push({
        kind: "create",
        target: `${args.vault}/${args.memoryMount}/`,
        reason: "memory store (the agent's running log)",
        apply: () => ensureDir(memDir),
      });
    } else {
      items.push({ kind: "skip", target: `${args.vault}/${args.memoryMount}/`, reason: "exists" });
    }

    items.push({
      kind: "notice",
      target: `${args.vault}`,
      reason:
        "how the vault is stored and git-tracked is yours to manage — the harness only points at it. " +
        "Setup does not run `git init` or write a vault `.gitignore`.",
    });
  } else if (args.accessVia === "mcp") {
    items.push({
      kind: "notice",
      target: "<vault>",
      reason: "accessVia=mcp — vault scaffolding skipped. Wire the vault through your MCP config; the manifest carries the logical mount ids.",
    });
  }

  return items;
}

function relForVault(args: CliArgs, leaf: string, which: "knowledge" | "memory"): string {
  const mount = which === "knowledge" ? args.knowledgeMount : args.memoryMount;
  return `${args.vault}/${mount}/${leaf}`;
}

// --- Printing ----------------------------------------------------------------

function printPlan(args: CliArgs, items: PlanItem[]): void {
  console.log(`/magik-repo-setup — plan (magik-repo@${PLUGIN_VERSION})`);
  console.log(`  project root: ${args.projectRoot}`);
  if (args.vault) console.log(`  vault       : ${args.vault} (${args.accessVia})`);
  console.log("");

  const groups: Array<[string, PlanKind]> = [
    ["Create", "create"],
    ["Modify", "modify"],
    ["Skip", "skip"],
  ];
  for (const [label, kind] of groups) {
    const group = items.filter((i) => i.kind === kind);
    if (group.length === 0) continue;
    console.log(`  ${label}:`);
    for (const it of group) console.log(`    ${it.target.padEnd(52)} ${it.reason}`);
    console.log("");
  }

  const notices = items.filter((i) => i.kind === "notice");
  if (notices.length > 0) {
    console.log("  Notices:");
    for (const n of notices) console.log(`    ${n.target}: ${n.reason}`);
    console.log("");
  }

  const c = items.filter((i) => i.kind === "create").length;
  const m = items.filter((i) => i.kind === "modify").length;
  const s = items.filter((i) => i.kind === "skip").length;
  console.log(`  Net: ${c} create, ${m} modify, ${s} skip, ${notices.length} notice.`);
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

  let items: PlanItem[];
  try {
    items = buildPlan(args);
  } catch (err) {
    console.error(`error: ${(err as Error).message}`);
    process.exit(1);
  }

  printPlan(args, items);

  if (args.dryRun) {
    console.log("\n(dry run — no files written)");
    process.exit(0);
  }

  try {
    for (const it of items) it.apply?.();
  } catch (err) {
    console.error(`error during apply: ${(err as Error).message}`);
    process.exit(1);
  }

  console.log(`\n/magik-repo-setup — applied (magik-repo@${PLUGIN_VERSION})`);
  console.log(
    "\nNext: open the KB in your editor and author the project's foundational context. " +
      "Run /magik-repo-kb-sanitize to keep it clean, /magik-repo-kb-code-sync to check it against the code.",
  );
  process.exit(0);
}

main();
