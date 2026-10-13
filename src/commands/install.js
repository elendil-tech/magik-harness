// @ts-check
/**
 * install.js — `magik-harness install` and `magik-harness upgrade`.
 *
 * `upgrade` is `install` seeded from the lock: same options as last time, newer
 * content. Both go through buildInstall() -> planDesired() -> applyPlan(), so the
 * dry run, the JSON output and the real run can never disagree.
 */

import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { isAbsolute, join, relative, resolve } from "node:path";

import { expandPath, projectInfo, readJson } from "../../runtime/resolve.mjs";
import { parseFlags, toList, UsageError } from "../lib/args.js";
import { loadCatalog, loadProfiles, packProblems } from "../lib/catalog.js";
import { exists, realish, toPosix } from "../lib/fsx.js";
import { detectLegacy, legacyHookRelease } from "../lib/legacy.js";
import { readLock, writeLock } from "../lib/lock.js";
import { applyPlan, computeLock, planDesired } from "../lib/plan.js";
import { createPrompter } from "../lib/prompt.js";
import { formatPlan, formatSummary, planToJson } from "../lib/report.js";
import { globalConfigJson, gitignoreBody, pointerJson, renderPrimer, vaultIndex } from "../lib/render.js";
import { buildScope, DEFAULT_SKILLS_DIR } from "../lib/scope.js";
import { readText } from "../lib/fsx.js";
import { skillFilesAt } from "../tools/common.js";
import { selectTools, TOOLS } from "../tools/index.js";
import { PKG_ROOT, VERSION } from "../version.js";
import { today } from "../../runtime/session-start.mjs";

export const INSTALL_FLAGS = {
  boolean: ["dry-run", "force", "yes", "json", "keep-legacy-pointer", "drop-legacy-hook", "help"],
  string: [
    "scope",
    "project-root",
    "tools",
    "profile",
    "packs",
    "pack-dir",
    "skills-dir",
    "vault",
    "knowledge-mount",
    "memory-mount",
    "access-via",
    "kb-autonomy",
    "layout",
  ],
  alias: { h: "help", y: "yes" },
};

export const INSTALL_HELP = `Usage: magik-harness install [options]
       magik-harness upgrade [options]

Install the harness into the current project (default) or your whole machine.

Scope
  --scope project|global     project: files committed in the repo (default)
                             global: files under your home directory, nothing in any repo
  --project-root <dir>       project to install into (default: the git root of the cwd)

What to install
  --profile minimal|knowledge  minimal: delivery loop + git protocol, no vault
                               knowledge: + knowledge base, memory, KB skills (default with a vault)
  --packs <a,b>              opt-in skill packs (see \`magik-harness list\`)
  --pack-dir <dir>           extra directory of pack folders (a private team's own packs)
  --tools <list>             auto (default) | none | cursor,claude,codex,generic
  --skills-dir <dir>         where skills are written (default .agents/skills)

Vault (knowledge profile)
  --vault <dir>              the vault folder (supports ~); created if missing
  --layout multi|single      multi: <project>/knowledge, <project>/memory (default)
                             single: knowledge, memory
  --knowledge-mount <path>   override the knowledge mount
  --memory-mount <path>      override the memory mount
  --access-via path|mcp      path (default) or a remote store reached through MCP
  --kb-autonomy open|ask|readonly   how freely the agent writes the KB (default open)

Safety
  --dry-run                  print the plan, write nothing
  --force                    overwrite files you modified (a backup is made first)
  --yes                      no prompts
  --json                     machine-readable output
  --keep-legacy-pointer      1.x projects: keep .cursor/harness.json where it is
  --drop-legacy-hook         1.x projects: also remove a locally modified 1.x hook script
`;

/**
 * @typedef {Object} IO
 * @property {string} cwd
 * @property {NodeJS.ProcessEnv} env
 * @property {(s: string) => void} out
 * @property {(s: string) => void} err
 * @property {boolean} interactive
 * @property {string} home
 */

/** @param {string} root @param {string} rel */
function isGitIgnored(root, rel) {
  const r = spawnSync("git", ["check-ignore", "-q", "--", rel], { cwd: root, stdio: "ignore", windowsHide: true });
  return r.status === 0;
}

/**
 * @param {Object} p
 * @param {"project"|"global"} p.kind
 * @param {string} p.root
 * @param {string|undefined} p.flag
 * @param {import("../lib/lock.js").Lock|null} p.prior
 * @param {string[]} p.tools
 * @returns {{ dir: string, note: string|null }}
 */
function chooseSkillsDir(p) {
  if (p.flag) return { dir: p.flag, note: null };
  if (p.prior?.skillsDir) return { dir: p.prior.skillsDir, note: null };
  if (p.kind === "global") return { dir: DEFAULT_SKILLS_DIR, note: null };
  if (!isGitIgnored(p.root, `${DEFAULT_SKILLS_DIR}/magik-probe/SKILL.md`)) return { dir: DEFAULT_SKILLS_DIR, note: null };
  const alt = ".cursor/skills";
  if (p.tools.includes("cursor") && !isGitIgnored(p.root, `${alt}/magik-probe/SKILL.md`)) {
    return { dir: alt, note: `.agents/ is git-ignored in this repo, so skills go to ${alt}/ (tracked). Override with --skills-dir.` };
  }
  throw new UsageError(".agents/skills is git-ignored in this repo and there is no tracked fallback; pass --skills-dir <dir>");
}

/**
 * Store a vault path so a tracked pointer works on every machine: relative input is resolved
 * against the cwd, and anything under the home directory is written as `~/...`.
 * @param {string} v
 * @param {string} cwd
 * @param {string} home
 * @returns {{ value: string, portable: boolean }}
 */
export function portableVault(v, cwd, home) {
  if (v === "~" || v.startsWith("~/") || v.startsWith("~\\")) return { value: toPosix(v), portable: true };
  const abs = resolve(cwd, v);
  // Compare both the spelled and the real paths: macOS /tmp -> /private/tmp, NFS homes, etc.
  for (const [h, p] of [[home, abs], [realish(home), realish(abs)]]) {
    const rel = relative(h, p);
    if (rel === "") return { value: "~", portable: true };
    if (!rel.startsWith("..") && !isAbsolute(rel)) return { value: `~/${toPosix(rel)}`, portable: true };
  }
  return { value: toPosix(abs), portable: false };
}

/** @param {any} doc */
function migratePointer(doc) {
  /** @type {Record<string, any>} */
  const out = {
    schema: "magik-harness/harness@2",
    _doc: "Vault pointer. Tracked, so every worktree and clone resolves the same vault. Per-machine overrides go in .magik/harness.local.json (gitignored). Secrets never go here. Spec: docs/ARCHITECTURE.md in magik-harness.",
  };
  for (const [k, v] of Object.entries(doc)) if (k !== "schema" && k !== "_doc") out[k] = v;
  return JSON.stringify(out, null, 2) + "\n";
}

/**
 * @typedef {Object} InstallOptions
 * @property {"install"|"upgrade"} mode
 * @property {"project"|"global"} scope
 * @property {string} [projectRoot]
 * @property {string[]} tools
 * @property {string|undefined} profile
 * @property {string[]|undefined} packs
 * @property {string[]} packDirs
 * @property {string|undefined} skillsDir
 * @property {string|undefined} vault
 * @property {"multi"|"single"} layout
 * @property {string|undefined} knowledgeMount
 * @property {string|undefined} memoryMount
 * @property {"path"|"mcp"} accessVia
 * @property {"open"|"ask"|"readonly"} autonomy
 * @property {boolean} dryRun
 * @property {boolean} force
 * @property {boolean} yes
 * @property {boolean} json
 * @property {boolean} keepLegacyPointer
 * @property {boolean} dropLegacyHook
 */

/**
 * @param {string[]} argv
 * @param {"install"|"upgrade"} mode
 * @param {IO} io
 * @returns {InstallOptions & { help: boolean }}
 */
export function parseInstallOptions(argv, mode, io) {
  const { flags, positional } = parseFlags(argv, INSTALL_FLAGS);
  if (positional.length > 0) throw new UsageError(`unexpected argument "${positional[0]}"`);
  const scope = /** @type {string} */ (flags.scope ?? "project");
  if (scope !== "project" && scope !== "global") throw new UsageError(`--scope must be project or global (got "${scope}")`);
  const layout = /** @type {string} */ (flags.layout ?? "multi");
  if (layout !== "multi" && layout !== "single") throw new UsageError(`--layout must be multi or single (got "${layout}")`);
  const accessVia = /** @type {string} */ (flags["access-via"] ?? "path");
  if (accessVia !== "path" && accessVia !== "mcp") throw new UsageError(`--access-via must be path or mcp (got "${accessVia}")`);
  const autonomy = /** @type {string} */ (flags["kb-autonomy"] ?? "open");
  if (!["open", "ask", "readonly"].includes(autonomy)) throw new UsageError(`--kb-autonomy must be open, ask or readonly (got "${autonomy}")`);
  const profile = /** @type {string|undefined} */ (flags.profile);
  return {
    help: flags.help === true,
    mode,
    scope,
    projectRoot: /** @type {string|undefined} */ (flags["project-root"]),
    tools: toList(flags.tools),
    profile,
    packs: flags.packs !== undefined ? toList(flags.packs) : undefined,
    packDirs: toList(flags["pack-dir"]).map((d) => resolve(io.cwd, d)),
    skillsDir: /** @type {string|undefined} */ (flags["skills-dir"]),
    vault: /** @type {string|undefined} */ (flags.vault),
    layout,
    knowledgeMount: /** @type {string|undefined} */ (flags["knowledge-mount"]),
    memoryMount: /** @type {string|undefined} */ (flags["memory-mount"]),
    accessVia,
    autonomy: /** @type {any} */ (autonomy),
    dryRun: flags["dry-run"] === true,
    force: flags.force === true,
    yes: flags.yes === true,
    json: flags.json === true,
    keepLegacyPointer: flags["keep-legacy-pointer"] === true,
    dropLegacyHook: flags["drop-legacy-hook"] === true,
  };
}

/**
 * Describe everything an install would do. Reads the disk; writes nothing.
 *
 * @param {InstallOptions} o
 * @param {IO} io
 */
export function buildInstall(o, io) {
  const home = io.home;
  const magikHome = io.env.MAGIK_HOME;
  const info = o.scope === "project" ? projectInfo(resolve(io.cwd, o.projectRoot ?? ".")) : null;
  const baseScope = buildScope({ kind: o.scope, projectRoot: info?.projectRoot, home, magikHome });
  const priorRead = readLock(baseScope.lockPath);
  const prior = priorRead.ok ? priorRead.lock : null;
  if (!priorRead.ok && !priorRead.missing) throw new Error(`${baseScope.display(baseScope.lockPath)} is unreadable (${priorRead.error}); fix or delete it`);
  if (o.mode === "upgrade" && !prior) {
    throw new UsageError(`nothing to upgrade: ${baseScope.display(baseScope.lockPath)} does not exist. Run \`magik-harness install\` first.`);
  }

  // --- settings -----------------------------------------------------------
  const savedPackDirs = (prior?.packDirs ?? []).map((d) => expandPath(d, home, baseScope.root));
  const catalog = loadCatalog({ packDirs: [...new Set([...savedPackDirs, ...o.packDirs])] });
  const { profiles, globalOnly } = loadProfiles();
  /** @type {string[]} */
  const notes = [];

  const toolSel = selectTools(o.tools.length > 0 ? o.tools : prior ? prior.tools : [], baseScope);
  if (toolSel.how === "default") notes.push("no tool configuration detected; defaulting to cursor (pass --tools to change)");
  const tools = toolSel.tools;

  const projectRoot = baseScope.root;
  const pointerNew = join(projectRoot, ".magik", "harness.json");
  const pointerLegacy = join(projectRoot, ".cursor", "harness.json");
  const overlayNew = join(projectRoot, ".magik", "harness.local.json");
  const overlayLegacy = join(projectRoot, ".cursor", "harness.local.json");
  const legacy = o.scope === "project" ? detectLegacy(projectRoot) : null;

  /** @type {any} */
  let existingVault = null;
  /** @type {string|null} a pointer file that exists but cannot be read */
  let brokenPointer = null;
  const pointerSrc = o.scope === "project" ? (exists(pointerNew) ? pointerNew : exists(pointerLegacy) ? pointerLegacy : null) : exists(baseScope.pointerPath) ? baseScope.pointerPath : null;
  if (pointerSrc) {
    const r = readJson(pointerSrc);
    if (r.ok && r.value && typeof r.value === "object" && !Array.isArray(r.value)) existingVault = r.value.vault ?? null;
    else brokenPointer = pointerSrc;
  }
  const hasPointer = pointerSrc !== null;
  const vaultKnown = Boolean(o.vault) || Boolean(existingVault) || (o.accessVia === "mcp" && hasPointer);
  if (brokenPointer && !o.vault && !o.profile && !prior) {
    // Guessing "minimal" here would stick (an upgrade keeps the saved profile) and silently drop the knowledge base.
    throw new UsageError(`${baseScope.display(brokenPointer)} exists but is not valid JSON, so this project's vault cannot be read. Fix or delete it, or pass --vault <dir> (or --profile minimal) to go on without it.`);
  }

  const profileName = o.profile ?? prior?.profile ?? (vaultKnown ? "knowledge" : "minimal");
  const profile = profiles[profileName];
  if (!profile) throw new UsageError(`unknown profile "${profileName}" (choose ${Object.keys(profiles).join(", ")})`);

  const packNames = o.packs ?? prior?.packs ?? [];
  /** @type {string[]} */
  const packWarnings = [];
  for (const p of packNames) {
    const pack = catalog.packs.find((x) => x.name === p);
    if (!pack) throw new UsageError(`unknown pack "${p}" (see \`magik-harness list\`)`);
    packWarnings.push(...packProblems(pack, { env: io.env }));
  }

  const skillsChoice = chooseSkillsDir({ kind: o.scope, root: projectRoot, flag: o.skillsDir, prior, tools });
  if (skillsChoice.note) notes.push(skillsChoice.note);
  const scope = buildScope({ kind: o.scope, projectRoot: info?.projectRoot, home, magikHome, skillsDir: skillsChoice.dir });

  // skills
  const skillNames = new Set(profile.skills);
  for (const p of packNames) for (const s of catalog.packs.find((x) => x.name === p)?.skills ?? []) skillNames.add(s);
  if (o.scope === "global") for (const s of globalOnly) skillNames.add(s);
  const skills = [...skillNames].sort().map((n) => {
    const s = catalog.all.get(n);
    if (!s) throw new Error(`profile or pack references skill "${n}" that is not in the package`);
    return s;
  });

  // --- desired state --------------------------------------------------------
  /** @type {import("../lib/plan.js").Desired[]} */
  const desired = [];

  for (const name of ["resolve.mjs", "gitctx.mjs", "session-start.mjs"]) {
    const abs = join(scope.runtimeDir, name);
    desired.push({ type: "file", abs, key: scope.key(abs), content: readFileSync(join(PKG_ROOT, "runtime", name)), group: "runtime" });
  }
  desired.push(...skillFilesAt(skills, scope.skillsDir, scope));

  // pointer / config
  const name = info?.projectName ?? "project";
  const vaultArg = o.vault ? portableVault(o.vault, io.cwd, home) : null;
  if (vaultArg && !vaultArg.portable) {
    notes.push(`the vault path ${vaultArg.value} is absolute and outside your home directory, so it will not resolve on other machines; use .magik/harness.local.json for per-machine paths`);
  }
  if (vaultArg && existingVault) {
    const have = resolve(expandPath(String(existingVault), home, projectRoot));
    const want = resolve(expandPath(vaultArg.value, home, projectRoot));
    if (have !== want) {
      notes.push(`${o.scope === "project" ? ".magik/harness.json" : "~/.magik/config.json"} already names the vault ${existingVault}, so --vault ${vaultArg.value} was ignored; edit that file (or use .magik/harness.local.json for this machine only) to change it`);
    }
  }
  const knowledgeMount = o.knowledgeMount ?? (o.layout === "multi" ? `${name}/knowledge` : "knowledge");
  const memoryMount = o.memoryMount ?? (o.layout === "multi" ? `${name}/memory` : "memory");
  let scaffold = false;

  if (o.scope === "project") {
    if (profile.vault && !exists(pointerNew)) {
      if (exists(pointerLegacy) && !o.keepLegacyPointer) {
        const r = readJson(pointerLegacy);
        if (r.ok && r.value && typeof r.value === "object" && !Array.isArray(r.value)) {
          desired.push({ type: "seed", abs: pointerNew, key: scope.key(pointerNew), content: migratePointer(r.value) });
          desired.push({ type: "remove", abs: pointerLegacy, reason: "moved to .magik/harness.json" });
        } else {
          desired.push({ type: "notice", level: "warn", message: `.cursor/harness.json is unreadable; fix it, then re-run install to migrate it.` });
        }
      } else if (!exists(pointerLegacy)) {
        if (!o.vault && o.accessVia === "path") {
          throw new UsageError("the knowledge profile needs a vault: pass --vault <dir> (or --profile minimal for no knowledge base)");
        }
        desired.push({
          type: "seed",
          abs: pointerNew,
          key: scope.key(pointerNew),
          content: pointerJson({ vault: vaultArg?.value ?? null, knowledgeMount, memoryMount, accessVia: o.accessVia, autonomy: o.autonomy }),
        });
        scaffold = o.accessVia === "path" && Boolean(o.vault);
      }
    }
    if (legacy?.overlayPath && !exists(overlayNew) && !o.keepLegacyPointer) {
      const text = readText(legacy.overlayPath);
      if (text !== null) {
        desired.push({ type: "seed", abs: overlayNew, key: scope.key(overlayNew), content: text });
        desired.push({ type: "remove", abs: overlayLegacy, reason: "moved to .magik/harness.local.json" });
      }
    }
  } else {
    if (!exists(baseScope.pointerPath)) {
      if (profile.vault && !o.vault && o.accessVia === "path") {
        throw new UsageError("a global knowledge install needs a vault: pass --vault <dir> (or --profile minimal)");
      }
      desired.push({
        type: "seed",
        abs: scope.pointerPath,
        key: scope.key(scope.pointerPath),
        content: globalConfigJson({ vault: vaultArg?.value ?? null, autonomy: o.autonomy, git: profile.vault ? "harnessed" : "always" }),
      });
    }
  }

  // vault scaffolding: only when this run creates the pointer from an explicit --vault
  if (scaffold && vaultArg) {
    const vaultDir = expandPath(vaultArg.value, home, projectRoot);
    const kb = isAbsolute(knowledgeMount) ? knowledgeMount : join(vaultDir, knowledgeMount);
    const mem = isAbsolute(memoryMount) ? memoryMount : join(vaultDir, memoryMount);
    desired.push({ type: "dir", abs: kb });
    desired.push({ type: "dir", abs: mem });
    const idx = join(kb, "_index.md");
    desired.push({ type: "seed", abs: idx, key: scope.key(idx), content: vaultIndex(".magik/harness.json", today(io.env)) });
  }

  // primer + gitignore (project)
  const primerBody = renderPrimer(profile.primer, scope);
  if (o.scope === "project") {
    desired.push({
      type: "block",
      abs: join(projectRoot, "AGENTS.md"),
      id: "primer",
      style: "html",
      name: "magik-harness:primer",
      legacyNames: ["harness:primer"],
      body: primerBody,
      position: "top",
    });
    desired.push({
      type: "block",
      abs: join(projectRoot, ".gitignore"),
      id: "gitignore",
      style: "hash",
      name: "magik-harness:gitignore",
      legacyNames: ["harness:gitignore"],
      body: gitignoreBody({ cursor: tools.includes("cursor") }),
      position: "bottom",
      keepLegacyRemainder: true,
    });
  }

  // legacy 1.x hook script + registration
  let dropLegacyHook = false;
  if (legacy?.hookPath) {
    const release = legacyHookRelease(readText(legacy.hookPath));
    dropLegacyHook = release !== null || o.dropLegacyHook;
    desired.push({
      type: "remove",
      abs: legacy.hookPath,
      reason: release ? `1.x hook (release ${release}) replaced by .magik/runtime/session-start.mjs` : "locally modified 1.x hook removed (--drop-legacy-hook)",
      onlyIf: (text) => legacyHookRelease(text) !== null || o.dropLegacyHook,
      keepReason: "locally modified 1.x hook kept; its registration is kept too (use --drop-legacy-hook to remove it)",
    });
    if (release === null && !o.dropLegacyHook) {
      desired.push({
        type: "notice",
        level: "warn",
        message: "the old 1.x hook .cursor/hooks/session-start.js was edited, so it was kept and is still registered next to the new hook: every session start injects context twice. Port your edits, then re-run with --drop-legacy-hook (or delete the old hook and its entry yourself).",
      });
    }
  } else if (legacy?.hookRegistered) {
    dropLegacyHook = true;
  }

  for (const w of packWarnings) desired.push({ type: "notice", level: "warn", message: w });

  // tools
  for (const id of tools) {
    const adapter = TOOLS[id];
    desired.push(...adapter.artifacts({ scope, primerBody, skills, dropLegacyHook }).desired);
  }
  if (o.scope === "global") desired.push(...TOOLS.generic.artifacts({ scope, primerBody, skills, dropLegacyHook }).desired);

  const settings = {
    version: VERSION,
    scope: o.scope,
    tools,
    profile: profileName,
    packs: packNames,
    // stored home-relative (`~/…`) where possible: the project lock is committed and must not carry this machine's home path
    packDirs: [...new Set([...(prior?.packDirs ?? []), ...o.packDirs.map((d) => portableVault(d, io.cwd, home).value)])],
    skillsDir: skillsChoice.dir,
  };
  return { scope, prior, desired, settings, notes, catalog, skills, profileName, tools, toolHow: toolSel.how, legacy, scaffold };
}

/**
 * Run the installed hook once. A broken hook is the failure mode that matters most.
 * @param {import("../lib/scope.js").Scope} scope
 * @returns {{ ok: boolean, detail: string }}
 */
export function selfTestHook(scope) {
  const script = join(scope.runtimeDir, "session-start.mjs");
  if (!exists(script)) return { ok: false, detail: `${scope.display(script)} is missing` };
  const r = spawnSync(process.execPath, [script, "--format", "text", "--no-git"], {
    cwd: scope.kind === "project" ? scope.root : scope.home,
    env: { ...process.env, MAGIK_PROJECT_DIR: scope.kind === "project" ? scope.root : scope.home, MAGIK_HOME: scope.harnessDir },
    input: "",
    encoding: "utf8",
    timeout: 10_000,
    windowsHide: true,
  });
  if (r.status !== 0) return { ok: false, detail: `exited ${r.status}: ${(r.stderr || "").trim().slice(0, 200)}` };
  return { ok: true, detail: (r.stdout || "").includes("magik-harness session context") ? "emits the session context" : "runs, and stays silent here because no harness resolves in this directory" };
}

/**
 * @param {string[]} argv
 * @param {IO} io
 * @param {"install"|"upgrade"} mode
 * @returns {Promise<number>}
 */
export async function runInstall(argv, io, mode = "install") {
  const o = parseInstallOptions(argv, mode, io);
  if (o.help) {
    io.out(INSTALL_HELP);
    return 0;
  }

  // Interactive convenience: ask for the vault when a human runs a bare install.
  if (io.interactive && !o.yes && !o.json && mode === "install" && !o.vault && !o.profile) {
    const probe = buildInstall({ ...o, dryRun: true }, io);
    if (!probe.prior && probe.profileName === "minimal") {
      const p = createPrompter();
      try {
        const v = await p.ask("Vault folder for this project's knowledge + memory (blank = none, minimal install)", "");
        if (v) o.vault = v;
      } finally {
        p.close();
      }
    }
  }

  const b = buildInstall(o, io);
  const ctx = { scope: b.scope, prior: b.prior, version: VERSION, force: o.force };
  const items = planDesired(b.desired, ctx);
  const pending = items.filter((i) => !["unchanged", "skip", "notice"].includes(i.action) && i.action !== "keep" && i.action !== "conflict").length;

  if (o.json) {
    io.out(
      JSON.stringify(
        { command: mode, dryRun: o.dryRun, scope: o.scope, tools: b.tools, profile: b.profileName, packs: b.settings.packs, skillsDir: b.settings.skillsDir, notes: b.notes, items: planToJson(items, b.scope) },
        null,
        2,
      ) + "\n",
    );
  } else {
    io.out(`magik-harness ${mode} - ${o.scope} scope${o.dryRun ? " (dry run)" : ""}\n`);
    io.out(`  root:     ${b.scope.root}\n`);
    io.out(`  profile:  ${b.profileName}   tools: ${b.tools.length ? b.tools.join(", ") : "none"}   packs: ${b.settings.packs.length ? b.settings.packs.join(", ") : "none"}\n`);
    io.out(`  skills:   ${b.scope.display(b.scope.skillsDir)} (${b.skills.length} skills)\n\n`);
    for (const n of b.notes) io.out(`  note: ${n}\n`);
    if (b.notes.length) io.out("\n");
    const lines = formatPlan(items, b.scope);
    io.out((lines.length ? lines.join("\n") : "  (nothing to change)") + "\n\n");
  }

  if (o.dryRun) {
    if (!o.json) io.out(`Dry run: ${formatSummary(items)}. Nothing was written.\n`);
    return 0;
  }

  if (o.scope === "global" && io.interactive && !o.yes && !o.json && pending > 0) {
    const p = createPrompter();
    try {
      if (!(await p.confirm("Apply these changes to your home directory? (files you edit are backed up first)", true))) {
        io.out("Cancelled. Nothing was written.\n");
        return 1;
      }
    } finally {
      p.close();
    }
  }

  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const { backups } = applyPlan(items, { scope: b.scope, stamp });
  const lock = computeLock(b.prior, items, b.settings);
  writeLock(b.scope.lockPath, lock);

  const test = selfTestHook(b.scope);
  const conflicts = items.filter((i) => i.action === "conflict").length;
  if (!o.json) {
    io.out(`Done: ${formatSummary(items)}.\n`);
    for (const bk of backups) io.out(`  backup: ${bk}\n`);
    io.out(`  hook self-test: ${test.ok ? "ok" : "FAILED"} (${test.detail})\n`);
    if (conflicts) io.out(`  ${conflicts} path(s) already existed and were left alone; resolve them or re-run with --force.\n`);
    // A re-run that changed nothing does not repeat the "what to do next" advice.
    const changed = items.some((i) => ["create", "insert", "update", "merge", "remove"].includes(i.action));
    if (changed && o.scope === "project") {
      io.out("\nNext: review `git status`, then commit .magik/, the skills folder, AGENTS.md, .gitignore and the tool config files so every clone and worktree has the harness.\n");
    } else if (changed) {
      io.out("\nNext: start a new agent session. Per project, run `magik-harness init` (creates the vault folders) or add a .magik/harness.json.\n");
    }
    io.out(`${changed ? "" : "\n"}Check anytime with: magik-harness doctor${o.scope === "global" ? " --scope global" : ""}\n`);
  }
  return test.ok ? 0 : 1;
}
