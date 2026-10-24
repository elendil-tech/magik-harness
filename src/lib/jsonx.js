// @ts-check
/**
 * jsonx.js — reading, merging and writing the JSON files that tools and users
 * share (`hooks.json`, `settings.json`). The rule: we own only our entries.
 * Everything else is preserved key for key, in order, with the file's indent.
 */

import { readText } from "./fsx.js";

/**
 * @typedef {Object} JsonFile
 * @property {boolean} exists
 * @property {boolean} valid
 * @property {any} value        parsed document ({} when missing)
 * @property {string} text      raw text ("" when missing)
 * @property {string|number} indent
 * @property {boolean} finalNewline   whether the file ends with a newline (true for a file that does not exist yet)
 * @property {string|null} error
 */

/** @param {string} text @returns {string|number} */
export function detectIndent(text) {
  const m = text.match(/^([ \t]+)\S/m);
  if (!m) return 2;
  return m[1].startsWith("\t") ? "\t" : Math.min(m[1].length, 8);
}

/** @param {string} path @returns {JsonFile} */
export function readJsonFile(path) {
  const text = readText(path);
  if (text === null) return { exists: false, valid: true, value: {}, text: "", indent: 2, finalNewline: true, error: null };
  if (!text.trim()) return { exists: true, valid: true, value: {}, text, indent: 2, finalNewline: true, error: null };
  const finalNewline = text.endsWith("\n");
  try {
    return { exists: true, valid: true, value: JSON.parse(text.replace(/^\uFEFF/, "")), text, indent: detectIndent(text), finalNewline, error: null };
  } catch (e) {
    return { exists: true, valid: false, value: null, text, indent: 2, finalNewline, error: String(/** @type {any} */ (e)?.message ?? e) };
  }
}

/** @param {any} value @param {string|number} [indent] @param {boolean} [finalNewline] */
export function stringifyJson(value, indent = 2, finalNewline = true) {
  return JSON.stringify(value, null, indent) + (finalNewline ? "\n" : "");
}

/** @param {unknown} v */
const isObj = (v) => typeof v === "object" && v !== null && !Array.isArray(v);

// ---------------------------------------------------------------------------
// ownership of hook entries
// ---------------------------------------------------------------------------

/** Heuristic for hook commands we installed. @param {unknown} command */
export function looksLikeOurHook(command) {
  if (typeof command !== "string") return false;
  const c = command.replace(/\\/g, "/");
  return /session-start\.mjs/.test(c) && /(\.magik|magik-harness|magik)/i.test(c);
}

/**
 * @typedef {Object} MergeOptions
 * @property {string} command            the command to register
 * @property {string[]} [known]          extra commands recorded in the lock (ours for sure)
 */

/** @param {MergeOptions} o @returns {(cmd: unknown) => boolean} */
function ownedPredicate(o) {
  const known = new Set(o.known ?? []);
  return (cmd) => {
    if (typeof cmd !== "string") return false;
    if (known.has(cmd) || cmd === o.command) return true;
    return looksLikeOurHook(cmd);
  };
}

/**
 * Cursor `hooks.json`: `{ version, hooks: { sessionStart: [ { command } ] } }`.
 * @param {any} doc
 * @param {MergeOptions} o
 * @returns {{ doc: any, changed: boolean }}
 */
export function mergeCursorHooks(doc, o) {
  const owned = ownedPredicate(o);
  const next = isObj(doc) ? structuredClone(doc) : {};
  if (next.version === undefined) next.version = 1;
  if (!isObj(next.hooks)) next.hooks = {};
  const list = Array.isArray(next.hooks.sessionStart) ? next.hooks.sessionStart : [];
  const entry = { command: o.command };

  /** @type {any[]} */
  const out = [];
  let placed = false;
  for (const e of list) {
    if (isObj(e) && owned(e.command)) {
      if (!placed) {
        out.push(isObj(e) && e.command === o.command ? e : entry);
        placed = true;
      }
      continue;
    }
    out.push(e);
  }
  if (!placed) out.push(entry);
  next.hooks.sessionStart = out;
  return { doc: next, changed: JSON.stringify(next) !== JSON.stringify(doc ?? {}) };
}

/**
 * Remove our `sessionStart` entries. Prunes keys we leave empty.
 * @param {any} doc
 * @param {MergeOptions} o
 * @returns {{ doc: any, changed: boolean, empty: boolean }}
 */
export function removeCursorHooks(doc, o) {
  if (!isObj(doc)) return { doc, changed: false, empty: false };
  const owned = ownedPredicate(o);
  const next = structuredClone(doc);
  if (isObj(next.hooks) && Array.isArray(next.hooks.sessionStart)) {
    next.hooks.sessionStart = next.hooks.sessionStart.filter((/** @type {any} */ e) => !(isObj(e) && owned(e.command)));
    if (next.hooks.sessionStart.length === 0) delete next.hooks.sessionStart;
    if (Object.keys(next.hooks).length === 0) delete next.hooks;
  }
  const keys = Object.keys(next);
  const empty = keys.length === 0 || (keys.length === 1 && keys[0] === "version");
  return { doc: next, changed: JSON.stringify(next) !== JSON.stringify(doc), empty };
}

/**
 * Claude Code `settings.json`: `{ hooks: { SessionStart: [ { matcher?, hooks: [ { type, command } ] } ] } }`.
 * @param {any} doc
 * @param {MergeOptions} o
 * @returns {{ doc: any, changed: boolean }}
 */
export function mergeClaudeHooks(doc, o) {
  const owned = ownedPredicate(o);
  const next = isObj(doc) ? structuredClone(doc) : {};
  if (!isObj(next.hooks)) next.hooks = {};
  const groups = Array.isArray(next.hooks.SessionStart) ? next.hooks.SessionStart : [];
  const entry = { hooks: [{ type: "command", command: o.command }] };
  const groupOwned = (/** @type {any} */ g) => isObj(g) && Array.isArray(g.hooks) && g.hooks.some((/** @type {any} */ h) => isObj(h) && owned(h.command));

  /** @type {any[]} */
  const out = [];
  let placed = false;
  for (const g of groups) {
    if (groupOwned(g)) {
      if (!placed) {
        out.push(
          g.hooks.length === 1 && g.hooks[0].command === o.command ? g : entry,
        );
        placed = true;
      }
      // other hooks that share the group are kept
      const others = g.hooks.filter((/** @type {any} */ h) => !(isObj(h) && owned(h.command)));
      if (others.length > 0) out.push({ ...g, hooks: others });
      continue;
    }
    out.push(g);
  }
  if (!placed) out.push(entry);
  next.hooks.SessionStart = out;
  return { doc: next, changed: JSON.stringify(next) !== JSON.stringify(doc ?? {}) };
}

/**
 * @param {any} doc
 * @param {MergeOptions} o
 * @returns {{ doc: any, changed: boolean, empty: boolean }}
 */
export function removeClaudeHooks(doc, o) {
  if (!isObj(doc)) return { doc, changed: false, empty: false };
  const owned = ownedPredicate(o);
  const next = structuredClone(doc);
  if (isObj(next.hooks) && Array.isArray(next.hooks.SessionStart)) {
    /** @type {any[]} */
    const groups = [];
    for (const g of next.hooks.SessionStart) {
      if (!(isObj(g) && Array.isArray(g.hooks))) {
        groups.push(g);
        continue;
      }
      const kept = g.hooks.filter((/** @type {any} */ h) => !(isObj(h) && owned(h.command)));
      if (kept.length > 0) groups.push(kept.length === g.hooks.length ? g : { ...g, hooks: kept });
    }
    next.hooks.SessionStart = groups;
    if (groups.length === 0) delete next.hooks.SessionStart;
    if (Object.keys(next.hooks).length === 0) delete next.hooks;
  }
  return { doc: next, changed: JSON.stringify(next) !== JSON.stringify(doc), empty: Object.keys(next).length === 0 };
}
