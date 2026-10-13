// @ts-check
/**
 * scope.js — where things live for a project install versus a global install.
 * Everything else in the installer asks the scope for paths instead of
 * hard-coding them, which is what keeps the two scopes in step.
 */

import { homedir } from "node:os";
import { isAbsolute, join, relative, resolve } from "node:path";

import { toPosix } from "./fsx.js";

export const DEFAULT_SKILLS_DIR = ".agents/skills";

/**
 * @typedef {Object} Scope
 * @property {"project"|"global"} kind
 * @property {string} root            project root, or the home directory
 * @property {string} home
 * @property {string} harnessDir      absolute `.magik` directory
 * @property {string} runtimeDir
 * @property {string} lockPath
 * @property {string} pointerPath     project: .magik/harness.json; global: config.json
 * @property {string} backupRoot
 * @property {string} skillsDir       absolute
 * @property {(format: string) => string} hookCommand
 * @property {(abs: string) => string} key        lock key for an absolute path
 * @property {(abs: string) => string} display    short human path
 * @property {string} runtimeDisplay  how docs/primer refer to the hook script
 * @property {string} pointerDisplay
 * @property {string} skillsDisplay
 */

/** @param {string} p */
function quote(p) {
  return `"${p.replace(/"/g, '\\"')}"`;
}

/**
 * @param {Object} o
 * @param {"project"|"global"} o.kind
 * @param {string} [o.projectRoot]
 * @param {string} [o.home]
 * @param {string} [o.magikHome]
 * @param {string} [o.skillsDir]      relative to the scope root, or absolute
 * @returns {Scope}
 */
export function buildScope(o) {
  const home = resolve(o.home ?? homedir());
  const isProject = o.kind === "project";
  const root = isProject ? resolve(o.projectRoot ?? process.cwd()) : home;
  const harnessDir = isProject ? join(root, ".magik") : resolve(o.magikHome ?? join(home, ".magik"));
  const skillsRel = o.skillsDir ?? DEFAULT_SKILLS_DIR;
  const skillsDir = isAbsolute(skillsRel) ? skillsRel : join(root, skillsRel);

  /**
   * Lock key: relative to the scope root; else `~/…` when under the home directory; else absolute.
   * The project lock is committed, so it must not carry this machine's home path.
   * @param {string} abs
   */
  const key = (abs) => {
    const rel = relative(root, abs);
    if (rel && !rel.startsWith("..") && !isAbsolute(rel)) return toPosix(rel);
    const underHome = relative(home, abs);
    if (underHome && !underHome.startsWith("..") && !isAbsolute(underHome)) return "~/" + toPosix(underHome);
    return toPosix(abs);
  };
  /** @param {string} abs */
  const display = (abs) => {
    const k = key(abs);
    if (isProject) return k;
    return abs.startsWith(home) ? "~" + toPosix(abs.slice(home.length)) : k;
  };

  const runtimeFile = join(harnessDir, "runtime", "session-start.mjs");
  return {
    kind: o.kind,
    root,
    home,
    harnessDir,
    runtimeDir: join(harnessDir, "runtime"),
    lockPath: join(harnessDir, "lock.json"),
    pointerPath: isProject ? join(harnessDir, "harness.json") : join(harnessDir, "config.json"),
    backupRoot: join(harnessDir, "backups"),
    skillsDir,
    hookCommand: (format) =>
      isProject ? `node .magik/runtime/session-start.mjs --format ${format}` : `node ${quote(runtimeFile)} --format ${format}`,
    key,
    display,
    runtimeDisplay: isProject ? ".magik/runtime/session-start.mjs" : display(runtimeFile),
    pointerDisplay: isProject ? ".magik/harness.json" : display(join(harnessDir, "config.json")),
    skillsDisplay: isProject ? toPosix(relative(root, skillsDir)) || skillsRel : display(skillsDir),
  };
}
