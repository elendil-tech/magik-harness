#!/usr/bin/env node
// @ts-check
/**
 * resolve.mjs — magik-harness pointer resolver (zero dependencies, Node >= 18).
 *
 * One implementation shared by the session hook, the CLI (`magik-harness
 * resolve|doctor|status`) and anything that wants to know where a project's
 * knowledge base and memory live. Copied verbatim into installs
 * (`.magik/runtime/` or `~/.magik/runtime/`), so it must stay self-contained.
 *
 * Resolution order (docs/ARCHITECTURE.md section 5.2):
 *   1. project pointer  `.magik/harness.json`
 *      deep-merged with `.magik/harness.local.json`
 *   2. global config    `~/.magik/config.json` (`$MAGIK_HOME`), per-project layout
 *   3. nothing -> the repo is not harnessed (no error)
 *
 * Run directly:  node resolve.mjs [--json] [--project-root <dir>]
 */

import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, realpathSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { basename, dirname, isAbsolute, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

/** Version of the runtime files. Kept in step with package.json (version-sync test). */
export const RUNTIME_VERSION = "2.0.1";

export const POINTER_SCHEMA = "magik-harness/harness@2";
export const CONFIG_SCHEMA = "magik-harness/config@1";

export const DEFAULT_MEMORY_MAX_BYTES = 4000;
const AUTONOMY = ["open", "ask", "readonly"];

/** Where a project keeps its pointer and the per-machine overlay, relative to the project root. */
export const POINTER_PATH = ".magik/harness.json";
export const OVERLAY_PATH = ".magik/harness.local.json";

/**
 * @typedef {Object} Store
 * @property {string} name
 * @property {"knowledge"|"memory"} role
 * @property {string|null} mount
 * @property {"path"|"mcp"} accessVia
 * @property {string|null} dir        absolute directory for path stores
 * @property {boolean} exists
 * @property {"open"|"ask"|"readonly"|null} autonomy   knowledge stores only
 */

/**
 * @typedef {Object} Resolution
 * @property {boolean} active                 a harness applies to this project
 * @property {"project"|"global"|"none"} source
 * @property {string} projectRoot
 * @property {string} primaryRoot
 * @property {string} projectName
 * @property {boolean} isLinkedWorktree
 * @property {string|null} pointerPath
 * @property {string|null} overlayPath
 * @property {string|null} schema
 * @property {string|null} vault              as written (before expansion)
 * @property {string|null} vaultDir           absolute
 * @property {boolean} vaultExists
 * @property {Store|null} knowledge
 * @property {Store|null} memory
 * @property {Store[]} mounts                 extra stores from `mounts[]`
 * @property {{maxBytes:number}} memoryInject
 * @property {string} gitPolicy               "always"|"harnessed"|"never"
 * @property {string|null} configPath
 * @property {string[]} warnings              broken-but-configured conditions (loud)
 * @property {string[]} notes                 informational
 */

// ---------------------------------------------------------------------------
// small helpers
// ---------------------------------------------------------------------------

/** @param {string} p */
function isDir(p) {
  try {
    return statSync(p).isDirectory();
  } catch {
    return false;
  }
}

/**
 * @param {string} p
 * @returns {{ ok: true, value: any } | { ok: false, error: string, missing: boolean }}
 */
export function readJson(p) {
  let raw;
  try {
    raw = readFileSync(p, "utf8");
  } catch (e) {
    return { ok: false, error: String(/** @type {any} */ (e)?.message ?? e), missing: /** @type {any} */ (e)?.code === "ENOENT" };
  }
  try {
    return { ok: true, value: JSON.parse(raw.replace(/^\uFEFF/, "")) };
  } catch (e) {
    return { ok: false, error: String(/** @type {any} */ (e)?.message ?? e), missing: false };
  }
}

/** @param {unknown} v */
function isPlainObject(v) {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/**
 * Deep-merge `over` onto `base`. Plain objects merge recursively; arrays and
 * scalars replace; `undefined` is ignored; `null` replaces.
 * @param {any} base
 * @param {any} over
 * @returns {any}
 */
export function deepMerge(base, over) {
  if (!isPlainObject(base) || !isPlainObject(over)) return over === undefined ? base : over;
  /** @type {Record<string, any>} */
  const out = { ...base };
  for (const [k, v] of Object.entries(over)) {
    if (v === undefined) continue;
    out[k] = k in base ? deepMerge(base[k], v) : v;
  }
  return out;
}

/**
 * Expand a leading `~` and resolve relative paths against `baseDir`.
 * @param {string} p
 * @param {string} home
 * @param {string} baseDir
 */
export function expandPath(p, home, baseDir) {
  let q = p;
  if (q === "~") q = home;
  else if (q.startsWith("~/") || q.startsWith("~\\")) q = join(home, q.slice(2));
  return isAbsolute(q) ? resolve(q) : resolve(baseDir, q);
}

/**
 * @param {string} cwd
 * @param {string[]} args
 * @returns {string|null}
 */
function git(cwd, args) {
  try {
    return execFileSync("git", args, {
      cwd,
      encoding: "utf8",
      timeout: 1500,
      stdio: ["ignore", "pipe", "ignore"],
      windowsHide: true,
    }).trim();
  } catch {
    return null;
  }
}

/**
 * Project and primary-checkout roots for a directory.
 * @param {string} dir
 * @returns {{ projectRoot: string, primaryRoot: string, projectName: string, isLinkedWorktree: boolean, isGit: boolean }}
 */
export function projectInfo(dir) {
  const start = resolve(dir);
  const top = git(start, ["rev-parse", "--show-toplevel"]);
  if (!top) {
    return { projectRoot: start, primaryRoot: start, projectName: basename(start), isLinkedWorktree: false, isGit: false };
  }
  const projectRoot = resolve(top);
  let primaryRoot = projectRoot;
  let isLinkedWorktree = false;
  const common = git(projectRoot, ["rev-parse", "--git-common-dir"]);
  if (common) {
    const commonAbs = resolve(projectRoot, common);
    // `<primary>/.git` for normal repos and for linked worktrees; submodules and bare
    // repos have a different shape, in which case the toplevel is the best answer.
    if (basename(commonAbs) === ".git") {
      primaryRoot = dirname(commonAbs);
      isLinkedWorktree = resolve(primaryRoot) !== projectRoot;
    }
  }
  return { projectRoot, primaryRoot, projectName: basename(primaryRoot), isLinkedWorktree, isGit: true };
}

/**
 * @param {unknown} v
 * @returns {"open"|"ask"|"readonly"}
 */
function normalizeAutonomy(v) {
  return typeof v === "string" && AUTONOMY.includes(v) ? /** @type {any} */ (v) : "open";
}

/**
 * @param {unknown} v
 * @param {number} fallback
 */
function normalizeMaxBytes(v, fallback) {
  return typeof v === "number" && Number.isFinite(v) && v >= 0 ? Math.floor(v) : fallback;
}

/**
 * @param {"knowledge"|"memory"} role
 * @param {string} name
 * @param {any} raw
 * @param {string|null} vaultDir
 */
function buildStore(role, name, raw, vaultDir) {
  const r = isPlainObject(raw) ? raw : {};
  const accessVia = r.accessVia === "mcp" ? "mcp" : "path";
  const mount = typeof r.mount === "string" && r.mount.length > 0 ? r.mount : null;
  /** @type {string|null} */
  let dir = null;
  let exists = false;
  if (accessVia === "path" && mount) {
    if (isAbsolute(mount)) dir = resolve(mount);
    else if (vaultDir) dir = resolve(vaultDir, mount);
    exists = dir ? isDir(dir) : false;
  }
  /** @type {Store} */
  const store = {
    name,
    role,
    mount,
    accessVia,
    dir,
    exists,
    autonomy: role === "knowledge" ? normalizeAutonomy(r.autonomy) : null,
  };
  return store;
}

/** @param {string} root @param {string} rel */
function existingAt(root, rel) {
  const path = join(root, rel);
  return existsSync(path) ? { path } : null;
}

// ---------------------------------------------------------------------------
// resolution
// ---------------------------------------------------------------------------

/**
 * @param {Object} [opts]
 * @param {string} [opts.cwd]           directory the session started in
 * @param {string} [opts.home]          override the home directory (tests)
 * @param {string} [opts.magikHome]     override `~/.magik` (also `$MAGIK_HOME`)
 * @param {NodeJS.ProcessEnv} [opts.env]
 * @returns {Resolution}
 */
export function resolveHarness(opts = {}) {
  const env = opts.env ?? process.env;
  const home = opts.home ?? homedir();
  const magikHome = opts.magikHome ?? env.MAGIK_HOME ?? join(home, ".magik");
  const info = projectInfo(opts.cwd ?? process.cwd());

  /** @type {Resolution} */
  const res = {
    active: false,
    source: "none",
    projectRoot: info.projectRoot,
    primaryRoot: info.primaryRoot,
    projectName: info.projectName,
    isLinkedWorktree: info.isLinkedWorktree,
    pointerPath: null,
    overlayPath: null,
    schema: null,
    vault: null,
    vaultDir: null,
    vaultExists: false,
    knowledge: null,
    memory: null,
    mounts: [],
    memoryInject: { maxBytes: DEFAULT_MEMORY_MAX_BYTES },
    gitPolicy: "harnessed",
    configPath: null,
    warnings: [],
    notes: [],
  };

  // Global config is read first: it supplies defaults (memory cap, git policy)
  // even when a project pointer takes over the stores.
  const configPath = join(magikHome, "config.json");
  /** @type {any} */
  let config = null;
  const cfgRead = readJson(configPath);
  if (cfgRead.ok && isPlainObject(cfgRead.value)) {
    config = cfgRead.value;
    res.configPath = configPath;
  } else if (!cfgRead.ok && !cfgRead.missing) {
    res.warnings.push(`Global config ${configPath} is unreadable: ${cfgRead.error}`);
  }
  if (config) {
    res.memoryInject.maxBytes = normalizeMaxBytes(config.memory?.inject?.maxBytes, res.memoryInject.maxBytes);
    if (typeof config.git === "string" && ["always", "harnessed", "never"].includes(config.git)) {
      res.gitPolicy = config.git;
    }
  }

  // 1. project pointer (+ overlay)
  const found = existingAt(info.projectRoot, POINTER_PATH);
  const overlay = existingAt(info.projectRoot, OVERLAY_PATH);
  /** @type {any} */
  let pointer = null;
  if (found) {
    res.pointerPath = found.path;
    const read = readJson(found.path);
    if (!read.ok) {
      res.warnings.push(`Harness pointer ${found.path} is not valid JSON: ${read.error}`);
      res.active = true;
      res.source = "project";
    } else if (!isPlainObject(read.value)) {
      res.warnings.push(`Harness pointer ${found.path} must be a JSON object.`);
      res.active = true;
      res.source = "project";
    } else {
      pointer = read.value;
    }
  }
  if (overlay) {
    res.overlayPath = overlay.path;
    const read = readJson(overlay.path);
    if (!read.ok) {
      res.warnings.push(`Local overlay ${overlay.path} is not valid JSON: ${read.error}`);
    } else if (isPlainObject(read.value)) {
      pointer = pointer ? deepMerge(pointer, read.value) : null;
      if (!pointer && found === null) {
        res.notes.push(`Local overlay ${overlay.path} found without a tracked pointer; ignored.`);
      }
    }
  }

  if (pointer) {
    res.active = true;
    res.source = "project";
    res.schema = typeof pointer.schema === "string" ? pointer.schema : null;
    if (res.schema && res.schema !== POINTER_SCHEMA) {
      res.notes.push(`Pointer schema "${res.schema}" is not recognised; reading it as ${POINTER_SCHEMA}.`);
    }
    res.vault = typeof pointer.vault === "string" && pointer.vault ? pointer.vault : null;
    res.vaultDir = res.vault ? expandPath(res.vault, home, info.projectRoot) : null;
    res.vaultExists = res.vaultDir ? isDir(res.vaultDir) : false;
    res.memoryInject.maxBytes = normalizeMaxBytes(pointer.memory?.inject?.maxBytes, res.memoryInject.maxBytes);
    if (typeof pointer.git === "string" && ["always", "harnessed", "never"].includes(pointer.git)) {
      res.gitPolicy = pointer.git;
    }
    res.knowledge = buildStore("knowledge", "knowledge", pointer.knowledge, res.vaultDir);
    res.memory = buildStore("memory", "memory", pointer.memory, res.vaultDir);
    if (Array.isArray(pointer.mounts)) {
      for (const m of pointer.mounts) {
        if (!isPlainObject(m)) continue;
        const role = m.role === "memory" ? "memory" : "knowledge";
        const name = typeof m.name === "string" && m.name ? m.name : `${role}-${res.mounts.length + 1}`;
        res.mounts.push(buildStore(role, name, m, res.vaultDir));
      }
    }
    collectStoreWarnings(res);
    return res;
  }

  if (res.active) return res; // broken pointer: already warned

  // 2. global config convention
  if (config && typeof config.vault === "string" && config.vault) {
    const vaultDir = expandPath(config.vault, home, home);
    const alias = isPlainObject(config.projects) && typeof config.projects[info.projectName] === "string"
      ? config.projects[info.projectName]
      : info.projectName;
    const projectDir = join(vaultDir, alias);
    res.vault = config.vault;
    res.vaultDir = vaultDir;
    res.vaultExists = isDir(vaultDir);
    if (!res.vaultExists) {
      res.notes.push(`Global config vault ${vaultDir} does not exist.`);
      return res;
    }
    if (!isDir(projectDir)) {
      res.notes.push(`No folder "${alias}" in the vault ${vaultDir}; run \`magik-harness init\` to create it.`);
      return res;
    }
    res.active = true;
    res.source = "global";
    res.schema = typeof config.schema === "string" ? config.schema : CONFIG_SCHEMA;
    const autonomy = normalizeAutonomy(config.knowledge?.autonomy);
    res.knowledge = buildStore("knowledge", "knowledge", { mount: `${alias}/knowledge`, accessVia: "path", autonomy }, vaultDir);
    res.memory = buildStore("memory", "memory", { mount: `${alias}/memory`, accessVia: "path" }, vaultDir);
    collectStoreWarnings(res);
  }
  return res;
}

/** @param {Resolution} res */
function collectStoreWarnings(res) {
  if (res.vault === null && [res.knowledge, res.memory].some((s) => s && s.accessVia === "path")) {
    res.warnings.push("The pointer has no `vault`, but a store uses accessVia \"path\". Set `vault` (or use accessVia \"mcp\").");
    return;
  }
  if (res.vault && !res.vaultExists) {
    res.warnings.push(
      `Vault not found: ${res.vaultDir} (from "${res.vault}"). Knowledge and memory are unavailable until it exists. ` +
        "Clone or create it, or point this machine elsewhere in .magik/harness.local.json (key `vault`). Check with `magik-harness doctor`.",
    );
    return;
  }
  const k = res.knowledge;
  if (k && k.accessVia === "path" && !k.exists) {
    res.warnings.push(`Knowledge folder not found: ${k.dir ?? k.mount ?? "(no mount set)"}.`);
  }
  const m = res.memory;
  if (m && m.accessVia === "path" && !m.exists) {
    res.notes.push(`Memory folder ${m.dir ?? m.mount ?? "(no mount set)"} does not exist yet; it is created on the first write.`);
  }
  for (const s of res.mounts) {
    if (s.accessVia === "path" && !s.exists) {
      res.warnings.push(`Mount "${s.name}" not found: ${s.dir ?? s.mount ?? "(no mount set)"}.`);
    }
  }
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

/** @param {Resolution} r */
export function formatResolution(r) {
  const lines = [];
  lines.push(`project:   ${r.projectName}  (${r.projectRoot}${r.isLinkedWorktree ? `; linked worktree of ${r.primaryRoot}` : ""})`);
  lines.push(`harness:   ${r.active ? `active (source: ${r.source})` : "not harnessed"}`);
  if (r.pointerPath) lines.push(`pointer:   ${r.pointerPath}`);
  if (r.overlayPath) lines.push(`overlay:   ${r.overlayPath}`);
  if (r.configPath) lines.push(`config:    ${r.configPath}`);
  if (r.vaultDir) lines.push(`vault:     ${r.vaultDir}  ${r.vaultExists ? "" : "(MISSING)"}`.trimEnd());
  for (const s of [r.knowledge, r.memory, ...r.mounts]) {
    if (!s) continue;
    const where = s.accessVia === "mcp" ? `mcp:${s.mount ?? "?"}` : `${s.dir ?? "(unset)"}${s.exists ? "" : "  (missing)"}`;
    lines.push(`${s.name.padEnd(10)} ${s.role}${s.autonomy ? `/${s.autonomy}` : ""}: ${where}`);
  }
  for (const w of r.warnings) lines.push(`WARNING:   ${w}`);
  for (const n of r.notes) lines.push(`note:      ${n}`);
  return lines.join("\n");
}

function main() {
  const argv = process.argv.slice(2);
  const json = argv.includes("--json");
  const i = argv.indexOf("--project-root");
  const cwd = i >= 0 && argv[i + 1] ? resolve(argv[i + 1]) : process.env.MAGIK_PROJECT_DIR || process.cwd();
  const r = resolveHarness({ cwd });
  process.stdout.write(json ? JSON.stringify(r, null, 2) + "\n" : formatResolution(r) + "\n");
}

/** True when this file is the process entrypoint (not merely imported). */
function isEntrypoint() {
  const entry = process.argv[1];
  if (!entry) return false;
  try {
    return pathToFileURL(realpathSync(entry)).href === import.meta.url;
  } catch {
    return false;
  }
}

if (isEntrypoint()) {
  try {
    main();
  } catch (err) {
    process.stderr.write(`magik-harness resolve: ${err instanceof Error ? err.message : String(err)}\n`);
    process.exitCode = 1;
  }
}
