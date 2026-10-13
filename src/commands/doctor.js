// @ts-check
/**
 * doctor.js — `magik-harness doctor`: is the harness installed and working here?
 *
 * Read-only. Every check returns a level (ok | info | warn | fail) and, when it
 * is not ok, the exact command that fixes it. Exit code 1 only on `fail`
 * (or on `warn` with --strict), so it is safe in scripts and CI.
 */

import { spawnSync } from "node:child_process";
import { isAbsolute, join, relative, resolve, sep } from "node:path";

import { expandPath, projectInfo, resolveHarness } from "../../runtime/resolve.mjs";
import { parseFlags, UsageError } from "../lib/args.js";
import { exists, isDirectory, readBuffer, readText, sha256 } from "../lib/fsx.js";
import { loadCatalog, packProblems } from "../lib/catalog.js";
import { readJsonFile } from "../lib/jsonx.js";
import { readLock } from "../lib/lock.js";
import { findBlock } from "../lib/markers.js";
import { keyToAbs, planDesired } from "../lib/plan.js";
import { buildScope } from "../lib/scope.js";
import { lintSkillDir } from "../lib/skillmd.js";
import { VERSION } from "../version.js";
import { buildInstall, selfTestHook } from "./install.js";

export const DOCTOR_HELP = `Usage: magik-harness doctor [options]

Check that the harness is installed and working. Read-only.

  --scope project|global|all   what to check (default all: whichever is installed)
  --project-root <dir>         project (default: the git root of the cwd)
  --strict                     treat warnings as failures (exit 1)
  --json                       machine-readable output

Exit code: 0 healthy (warnings allowed), 1 a check failed, 2 usage error.
`;

/**
 * @typedef {Object} Check
 * @property {string} area
 * @property {"ok"|"info"|"warn"|"fail"} level
 * @property {string} message
 * @property {string} [fix]
 */

/** @param {unknown} v @param {string[]} [acc] */
function collectCommands(v, acc = []) {
  if (Array.isArray(v)) for (const x of v) collectCommands(x, acc);
  else if (v && typeof v === "object") {
    for (const [k, x] of Object.entries(v)) {
      if (k === "command" && typeof x === "string") acc.push(x);
      else collectCommands(x, acc);
    }
  }
  return acc;
}

/** @param {string} cwd @param {string[]} paths @returns {string[]} the ignored subset */
function gitIgnoredSubset(cwd, paths) {
  if (paths.length === 0) return [];
  const r = spawnSync("git", ["check-ignore", "--stdin", "-z"], { cwd, input: paths.join("\0"), encoding: "utf8", windowsHide: true });
  if (r.status !== 0 && r.status !== 1) return [];
  return (r.stdout || "").split("\0").filter(Boolean);
}

/** @param {string} p an absolute path @param {string} home @returns {boolean} true when `p` is inside `home` */
function isUnder(p, home) {
  const rel = relative(resolve(home), resolve(p));
  return rel !== "" && !rel.startsWith("..") && !isAbsolute(rel);
}

/** @param {string} cwd @param {string} rel */
function isTracked(cwd, rel) {
  return spawnSync("git", ["ls-files", "--error-unmatch", "--", rel], { cwd, stdio: "ignore", windowsHide: true }).status === 0;
}

/**
 * @param {"project"|"global"} kind
 * @param {import("./install.js").IO} io
 * @param {string} cwd
 * @param {Check[]} out
 */
function checkInstall(kind, io, cwd, out) {
  const info = kind === "project" ? projectInfo(cwd) : null;
  const scope = buildScope({ kind, projectRoot: info?.projectRoot, home: io.home, magikHome: io.env.MAGIK_HOME });
  const area = `${kind} install`;
  const read = readLock(scope.lockPath);
  if (!read.ok) {
    if (read.missing) out.push({ area, level: "info", message: `not installed (${scope.display(scope.lockPath)} does not exist)`, fix: kind === "project" ? "magik-harness install --vault <dir>" : "magik-harness install --scope global --vault <dir>" });
    else out.push({ area, level: "fail", message: `lock file unreadable: ${read.error}`, fix: `delete ${scope.display(scope.lockPath)} and re-run install` });
    return false;
  }
  const lock = read.lock;
  out.push({ area, level: "ok", message: `installed v${lock.version}: profile ${lock.profile}, tools ${lock.tools.join(", ") || "none"}, packs ${lock.packs.join(", ") || "none"}` });
  const upgradeCmd = `magik-harness upgrade${kind === "global" ? " --scope global" : ""}`;
  if (lock.version !== VERSION) out.push({ area, level: "warn", message: `installed v${lock.version}, this CLI is v${VERSION}`, fix: upgradeCmd });

  // integrity
  /** @type {string[]} */ const missing = [];
  /** @type {string[]} */ const modified = [];
  for (const [key, hash] of Object.entries(lock.files)) {
    const buf = readBuffer(keyToAbs(scope, key));
    if (!buf) missing.push(key);
    else if (sha256(buf) !== hash) modified.push(key);
  }
  if (missing.length) out.push({ area, level: "fail", message: `${missing.length} managed file(s) missing, e.g. ${missing[0]}`, fix: upgradeCmd });
  else out.push({ area, level: "ok", message: `${Object.keys(lock.files).length} managed files present` });
  if (modified.length) out.push({ area, level: "info", message: `${modified.length} managed file(s) edited locally (kept on upgrade), e.g. ${modified[0]}` });

  // pending changes against this CLI version
  try {
    const b = buildInstall(
      { mode: "upgrade", scope: kind, projectRoot: info?.projectRoot, tools: [], profile: undefined, packs: undefined, packDirs: [], skillsDir: undefined, vault: undefined, layout: "multi", knowledgeMount: undefined, memoryMount: undefined, accessVia: "path", autonomy: "open", dryRun: true, force: false, yes: true, json: false },
      io,
    );
    const items = planDesired(b.desired, { scope: b.scope, prior: b.prior, version: VERSION, force: false });
    const pending = items.filter((i) => ["create", "update", "insert", "merge", "remove"].includes(i.action));
    if (pending.length) out.push({ area, level: "warn", message: `${pending.length} item(s) differ from what this CLI would install (e.g. ${b.scope.display(pending[0].abs) || pending[0].reason})`, fix: upgradeCmd });
    else out.push({ area, level: "ok", message: "up to date with this CLI" });
  } catch (e) {
    out.push({ area, level: "warn", message: `could not compare with this CLI: ${/** @type {Error} */ (e).message}` });
  }

  // registrations: whatever the lock recorded, each installed tool needs its hook entry
  // (an install that could not edit an invalid hooks.json recorded nothing, and must not pass here)
  /** @type {{ abs: string, command: string }[]} */
  const expected = [];
  if (lock.tools.includes("cursor")) expected.push({ abs: join(scope.root, ".cursor", "hooks.json"), command: scope.hookCommand("cursor") });
  if (lock.tools.includes("claude")) expected.push({ abs: join(scope.root, ".claude", "settings.json"), command: scope.hookCommand("claude") });
  for (const { abs, command } of expected) {
    const shown = scope.display(abs);
    const f = readJsonFile(abs);
    if (!f.exists) out.push({ area, level: "fail", message: `${shown} is missing, so the session hook is not registered`, fix: upgradeCmd });
    else if (!f.valid) out.push({ area, level: "fail", message: `${shown} is not valid JSON (${f.error}), so the session hook cannot be registered; fix the file, then add: ${command}` });
    else if (!collectCommands(f.value).includes(command)) out.push({ area, level: "fail", message: `session hook is not registered in ${shown}`, fix: upgradeCmd });
    else out.push({ area, level: "ok", message: `hook registered in ${shown}` });
  }

  // runtime
  const t = selfTestHook(scope);
  out.push({ area, level: t.ok ? "ok" : "fail", message: `session hook ${t.ok ? "runs" : "FAILS"}: ${t.detail}`, fix: t.ok ? undefined : upgradeCmd });

  // packs: do their scripts have what they need on this machine?
  if (lock.packs.length > 0) {
    const catalog = loadCatalog({ packDirs: (lock.packDirs ?? []).map((d) => expandPath(d, io.home, scope.root)) });
    for (const name of lock.packs) {
      const pack = catalog.packs.find((p) => p.name === name);
      if (!pack) {
        out.push({ area, level: "warn", message: `pack ${name} is installed but not found in this CLI's catalog (an external pack dir that moved?)` });
        continue;
      }
      const problems = packProblems(pack, { env: io.env });
      if (problems.length === 0) out.push({ area, level: "ok", message: `pack ${name}: requirements met` });
      for (const m of problems) out.push({ area, level: "warn", message: m });
    }
  }

  // skills
  /** @type {Map<string, string>} skill directory (lock key) -> skill name */
  const skillDirs = new Map();
  for (const key of Object.keys(lock.files)) {
    const k = key.replace(/\\/g, "/");
    if (k.endsWith("/SKILL.md")) {
      const dirKey = k.slice(0, -"/SKILL.md".length);
      skillDirs.set(dirKey, dirKey.split("/").pop() ?? dirKey);
    }
  }
  let problems = 0;
  for (const [dirKey, name] of skillDirs) {
    const dir = keyToAbs(scope, dirKey);
    if (!isDirectory(dir)) continue;
    for (const p of lintSkillDir(dir).problems) {
      problems += 1;
      out.push({ area, level: "warn", message: `skill ${name} (${dirKey}): ${p}` });
    }
  }
  // the problems themselves are warnings above; this line only summarises, so it must not count twice
  out.push({ area, level: problems ? "info" : "ok", message: `${skillDirs.size} skill folder(s) checked${problems ? `, ${problems} problem(s)` : ", all valid"}` });

  if (kind === "project") {
    // primer
    const agents = join(scope.root, "AGENTS.md");
    const text = readText(agents);
    const blk = text ? findBlock(text, "html", ["magik-harness:primer", "harness:primer"]) : null;
    if (!blk) out.push({ area, level: "fail", message: "AGENTS.md has no harness primer block", fix: upgradeCmd });
    else {
      out.push({ area, level: blk.name === "magik-harness:primer" ? "ok" : "warn", message: `primer present in AGENTS.md (${Buffer.byteLength(blk.body)} bytes)`, fix: blk.name === "magik-harness:primer" ? undefined : upgradeCmd });
      if (Buffer.byteLength(blk.body) > 5000) out.push({ area, level: "warn", message: "primer block is over 5 KB; every session pays for it" });
    }
    // git-ignored managed paths
    const rels = [...Object.keys(lock.files).filter((k) => !k.includes("#")), "AGENTS.md", ".magik/harness.json"].filter((k) => exists(keyToAbs(scope, k)));
    const ignored = gitIgnoredSubset(scope.root, rels);
    if (ignored.length) out.push({ area, level: "fail", message: `${ignored.length} managed path(s) are git-ignored, so clones and worktrees will not get them (e.g. ${ignored[0]})`, fix: "un-ignore them, or install with --skills-dir <tracked dir>" });
    else out.push({ area, level: "ok", message: "no managed path is git-ignored" });
  }
  return true;
}

/**
 * @param {string[]} argv
 * @param {import("./install.js").IO} io
 * @returns {Promise<number>}
 */
export async function runDoctor(argv, io) {
  const { flags, positional } = parseFlags(argv, {
    boolean: ["json", "strict", "help"],
    string: ["scope", "project-root"],
    alias: { h: "help" },
  });
  if (flags.help) {
    io.out(DOCTOR_HELP);
    return 0;
  }
  if (positional.length) throw new UsageError(`unexpected argument "${positional[0]}"`);
  const which = /** @type {string} */ (flags.scope ?? "all");
  if (!["project", "global", "all"].includes(which)) throw new UsageError(`--scope must be project, global or all (got "${which}")`);
  const cwd = resolve(io.cwd, /** @type {string|undefined} */ (flags["project-root"]) ?? ".");

  /** @type {Check[]} */
  const out = [];
  const res = resolveHarness({ cwd, home: io.home, env: io.env });

  // --- resolution ---------------------------------------------------------
  if (res.active) {
    out.push({ area: "resolution", level: "ok", message: `project ${res.projectName}${res.isLinkedWorktree ? " (linked worktree)" : ""}: harness active via ${res.source}` });
    out.push({ area: "resolution", level: res.vaultExists || !res.vault ? "ok" : "fail", message: `vault ${res.vaultDir ?? "(remote, via MCP)"}${res.vault && !res.vaultExists ? " does not exist" : ""}` });
    for (const w of res.warnings) out.push({ area: "resolution", level: "fail", message: w });
    if (res.pointerPath && res.source === "project") {
      // A tracked pointer that spells the vault as an absolute home path only works for its author; `~/...` works for everyone.
      const raw = readJsonFile(res.pointerPath);
      const named = raw.exists && raw.valid ? /** @type {any} */ (raw.value)?.vault : null;
      if (typeof named === "string" && isAbsolute(named) && isUnder(named, io.home)) {
        const rel = ".magik/harness.json";
        out.push({ area: "resolution", level: "warn", message: `${rel} names the vault by an absolute path under your home directory (${named}), so a clone on another machine or user account will not find it`, fix: `edit ${rel}: "vault": "~/${relative(resolve(io.home), resolve(named)).split(sep).join("/")}"` });
      }
    }
    if (res.isLinkedWorktree && res.pointerPath && res.source === "project") {
      const rel = ".magik/harness.json";
      if (!isTracked(res.projectRoot, rel)) out.push({ area: "resolution", level: "warn", message: `${rel} is not tracked by git, so other worktrees and clones will not find the vault`, fix: `git add ${rel}` });
    }
  } else {
    out.push({ area: "resolution", level: res.warnings.length ? "fail" : "info", message: res.warnings.length ? res.warnings.join(" ") : "no harness resolves for this project (no pointer, no global config entry)" });
  }

  // --- installs -------------------------------------------------------------
  let anyInstall = false;
  if (which === "project" || which === "all") anyInstall = checkInstall("project", io, cwd, out) || anyInstall;
  if (which === "global" || which === "all") anyInstall = checkInstall("global", io, cwd, out) || anyInstall;

  if (!anyInstall && !res.active) out.push({ area: "summary", level: "info", message: "the harness is not installed in this project or on this machine", fix: "magik-harness install --vault <dir>" });

  const fails = out.filter((c) => c.level === "fail").length;
  const warns = out.filter((c) => c.level === "warn").length;
  const failed = fails > 0 || (flags.strict === true && warns > 0);

  if (flags.json) {
    io.out(JSON.stringify({ command: "doctor", version: VERSION, ok: !failed, failures: fails, warnings: warns, checks: out }, null, 2) + "\n");
    return failed ? 1 : 0;
  }
  const sym = { ok: "ok  ", info: "..  ", warn: "!!  ", fail: "FAIL" };
  let area = "";
  for (const c of out) {
    if (c.area !== area) {
      area = c.area;
      io.out(`\n${area}\n`);
    }
    io.out(`  ${sym[c.level]} ${c.message}\n`);
    if (c.fix) io.out(`       fix: ${c.fix}\n`);
  }
  io.out(`\n${failed ? "Not healthy" : "Healthy"}: ${fails} failure(s), ${warns} warning(s).\n`);
  if (fails + warns > 0 || !anyInstall) {
    io.out("The CLI checks the files it owns. For the rest (an older or hand-made setup, scripts and docs that name old paths, duplicate instructions), ask your agent to run the `harness-fit` skill.\n");
  }
  return failed ? 1 : 0;
}

// exported for tests
export { collectCommands };
