// @ts-check
/**
 * lock.js — `.magik/lock.json`: what the installer manages and the content hash
 * of each managed file. It is how upgrade/uninstall tell "ours, untouched"
 * from "edited by a human" and why modified files are never overwritten
 * without --force. Deterministic output (sorted keys, no timestamps) keeps it
 * merge-friendly in git.
 */

import { readText, writeFileAtomic } from "./fsx.js";

export const LOCK_SCHEMA = "magik-harness/lock@1";

/**
 * @typedef {Object} Lock
 * @property {string} schema
 * @property {string} version                 CLI version that wrote it
 * @property {"project"|"global"} scope
 * @property {string[]} tools
 * @property {string} profile
 * @property {string[]} packs
 * @property {string[]} packDirs
 * @property {string} skillsDir               relative to the scope root (or absolute)
 * @property {Record<string,string>} files    key -> sha256 of the content we wrote
 * @property {Record<string,{ hash: string, name: string, style: "html"|"hash" }>} blocks   "<file>#<id>" -> body hash, marker name and comment style
 * @property {Record<string,{ commands: string[], created: boolean }>} json   file -> entries we own
 * @property {string[]} seeds                 user-owned files we created (removed only by --purge)
 */

/** @returns {Lock} */
export function emptyLock() {
  return {
    schema: LOCK_SCHEMA,
    version: "0.0.0",
    scope: "project",
    tools: [],
    profile: "minimal",
    packs: [],
    packDirs: [],
    skillsDir: ".agents/skills",
    files: {},
    blocks: {},
    json: {},
    seeds: [],
  };
}

/** @param {any} v @returns {any} */
function sortKeys(v) {
  if (Array.isArray(v)) return v.map(sortKeys);
  if (v && typeof v === "object") {
    /** @type {Record<string, any>} */
    const out = {};
    for (const k of Object.keys(v).sort()) out[k] = sortKeys(v[k]);
    return out;
  }
  return v;
}

/**
 * @param {string} path
 * @returns {{ ok: true, lock: Lock } | { ok: false, missing: boolean, error: string }}
 */
export function readLock(path) {
  const text = readText(path);
  if (text === null) return { ok: false, missing: true, error: "no lock file" };
  try {
    const raw = JSON.parse(text);
    if (!raw || typeof raw !== "object" || raw.schema !== LOCK_SCHEMA) {
      return { ok: false, missing: false, error: `unrecognised lock schema ${JSON.stringify(raw?.schema)}` };
    }
    return { ok: true, lock: { ...emptyLock(), ...raw } };
  } catch (e) {
    return { ok: false, missing: false, error: String(/** @type {any} */ (e)?.message ?? e) };
  }
}

/** @param {string} path @param {Lock} lock */
export function writeLock(path, lock) {
  writeFileAtomic(path, JSON.stringify(sortKeys(lock), null, 2) + "\n");
}
