// @ts-check
/**
 * plan.js — the installer's engine. Every mutating command does the same three
 * things: describe the DESIRED state, diff it against disk and the lock to get
 * PLAN items, then APPLY the items. Keeping the plan as plain data is what makes
 * --dry-run, --json and the tests honest: what is printed is what is done.
 *
 * Ownership rules (docs/ARCHITECTURE.md section 10.2):
 *   file   whole file we wrote; hash in the lock; never overwritten once modified
 *   block  region between markers; body hash in the lock
 *   json   our entries inside a JSON file the user/tool also owns
 *   seed   user-owned file we create once and never touch again
 */

import { copyFileSync, existsSync } from "node:fs";
import { dirname, isAbsolute, join } from "node:path";

import { ensureDir, readBuffer, readText, removeFileAndPrune, sha256, writeFileAtomic } from "./fsx.js";
import {
  mergeClaudeHooks,
  mergeCursorHooks,
  readJsonFile,
  removeClaudeHooks,
  removeCursorHooks,
  stringifyJson,
} from "./jsonx.js";
import { emptyLock } from "./lock.js";
import { bodyHash, removeBlock, upsertBlock } from "./markers.js";

/**
 * @typedef {Object} DesiredFile
 * @property {"file"} type
 * @property {string} abs
 * @property {string} key
 * @property {Buffer|string} content
 * @property {boolean} [executable]
 * @property {string} [group]
 *
 * @typedef {Object} DesiredBlock
 * @property {"block"} type
 * @property {string} abs
 * @property {string} id
 * @property {"html"|"hash"} style
 * @property {string} name
 * @property {string} body
 * @property {"top"|"bottom"} [position]
 *
 * @typedef {Object} DesiredJson
 * @property {"json"} type
 * @property {string} abs
 * @property {"cursor"|"claude"} flavor
 * @property {string} command
 *
 * @typedef {Object} DesiredSeed
 * @property {"seed"} type
 * @property {string} abs
 * @property {string} key
 * @property {string} content
 *
 * @typedef {Object} DesiredDir
 * @property {"dir"} type
 * @property {string} abs
 *
 * @typedef {Object} DesiredNotice
 * @property {"notice"} type
 * @property {"info"|"warn"} level
 * @property {string} message
 *
 * @typedef {DesiredFile|DesiredBlock|DesiredJson|DesiredSeed|DesiredDir|DesiredNotice} Desired
 */

/**
 * @typedef {Object} PlanItem
 * @property {"file"|"block"|"json"|"seed"|"remove"|"dir"|"notice"} type
 * @property {"create"|"update"|"insert"|"merge"|"unchanged"|"keep"|"conflict"|"remove"|"skip"|"notice"} action
 * @property {string} abs
 * @property {string} key
 * @property {string} reason
 * @property {string} [group]
 * @property {"info"|"warn"} [level]
 * @property {Buffer|string} [content]
 * @property {boolean} [executable]
 * @property {string} [newText]
 * @property {boolean} [backup]
 * @property {string} [hash]
 * @property {string} [blockId]
 * @property {string} [markerName]
 * @property {"html"|"hash"} [blockStyle]
 * @property {string[]} [commands]
 * @property {boolean} [createdByUs]
 * @property {boolean} [staleManaged]       a previously managed file that is no longer wanted
 */

/**
 * @typedef {Object} PlanContext
 * @property {import("./scope.js").Scope} scope
 * @property {import("./lock.js").Lock|null} prior
 * @property {string} version
 * @property {boolean} force
 */

/** @param {PlanContext} ctx @param {string} id @param {string} abs */
const blockKey = (ctx, abs, id) => `${ctx.scope.key(abs)}#${id}`;

// ---------------------------------------------------------------------------
// planning
// ---------------------------------------------------------------------------

/**
 * @param {DesiredFile} d
 * @param {PlanContext} ctx
 * @returns {PlanItem}
 */
function planFile(d, ctx) {
  const disk = readBuffer(d.abs);
  const want = sha256(d.content);
  const locked = ctx.prior?.files[d.key];
  /** @type {PlanItem} */
  const base = { type: "file", action: "create", abs: d.abs, key: d.key, reason: "new", group: d.group, content: d.content, executable: d.executable, hash: want };
  if (!disk) return base;
  const have = sha256(disk);
  if (have === want) return { ...base, action: "unchanged", reason: locked ? "current" : "already identical" };
  if (locked && have === locked) return { ...base, action: "update", reason: "managed and unmodified; newer version" };
  if (ctx.force) {
    return { ...base, action: "update", backup: true, reason: locked ? "modified locally; overwritten (--force)" : "not managed by magik-harness; overwritten (--force)" };
  }
  if (locked) return { ...base, action: "keep", reason: "modified locally; kept (use --force to overwrite)", hash: locked };
  return { ...base, action: "conflict", reason: "already exists and is not managed by magik-harness; left alone (use --force to overwrite)" };
}

/**
 * @param {DesiredSeed} d
 * @returns {PlanItem}
 */
function planSeed(d) {
  if (existsSync(d.abs)) return { type: "seed", action: "skip", abs: d.abs, key: d.key, reason: "exists; yours, never overwritten" };
  return { type: "seed", action: "create", abs: d.abs, key: d.key, reason: "new (yours from now on)", content: d.content, hash: sha256(d.content) };
}

/**
 * @param {DesiredBlock} d
 * @param {PlanContext} ctx
 * @returns {PlanItem}
 */
function planBlock(d, ctx) {
  const current = readText(d.abs);
  const text = current ?? "";
  const key = blockKey(ctx, d.abs, d.id);
  const newHash = bodyHash(d.body);
  const r = upsertBlock(text, { style: d.style, name: d.name, version: ctx.version, body: d.body, position: d.position });
  /** @type {PlanItem} */
  const base = { type: "block", action: "create", abs: d.abs, key, reason: "new", blockId: d.id, markerName: d.name, blockStyle: d.style, hash: newHash, newText: r.text };

  if (r.action === "unchanged") return { ...base, action: "unchanged", reason: "current" };
  if (r.previous) {
    const prevHash = bodyHash(r.previous.body);
    const lockedHash = ctx.prior?.blocks[key]?.hash;
    if (!ctx.force && lockedHash && prevHash !== lockedHash && prevHash !== newHash) {
      return { ...base, action: "keep", reason: "block edited locally; kept (use --force to refresh)", hash: lockedHash, newText: text };
    }
    return { ...base, action: "update", backup: ctx.force && Boolean(lockedHash) && prevHash !== lockedHash, reason: "managed block refreshed" };
  }
  return { ...base, action: current === null ? "create" : "insert", reason: current === null ? "new file" : "block added to existing file", backup: current !== null };
}

/**
 * @param {DesiredJson} d
 * @param {PlanContext} ctx
 * @returns {PlanItem}
 */
function planJson(d, ctx) {
  const key = ctx.scope.key(d.abs);
  const f = readJsonFile(d.abs);
  if (!f.valid) {
    return {
      type: "json",
      action: "notice",
      level: "warn",
      abs: d.abs,
      key,
      reason: `${ctx.scope.display(d.abs)} is not valid JSON (${f.error}); not modified. Register this hook yourself: ${d.command}`,
    };
  }
  const known = ctx.prior?.json[key]?.commands ?? [];
  const opts = { command: d.command, known };
  const merged = d.flavor === "cursor" ? mergeCursorHooks(f.value, opts) : mergeClaudeHooks(f.value, opts);
  const createdByUs = !f.exists || Boolean(ctx.prior?.json[key]?.created);
  /** @type {PlanItem} */
  const base = { type: "json", action: "merge", abs: d.abs, key, reason: "", commands: [d.command], createdByUs, newText: stringifyJson(merged.doc, f.indent, f.finalNewline) };
  if (f.exists && !merged.changed) return { ...base, action: "unchanged", reason: "hook already registered" };
  return f.exists
    ? { ...base, action: "merge", reason: "hook entry added/updated; other entries untouched", backup: true }
    : { ...base, action: "create", reason: "new file" };
}

/**
 * Absolute path for a lock key.
 * @param {import("./scope.js").Scope} scope
 * @param {string} key
 */
export function keyToAbs(scope, key) {
  if (key.startsWith("~/")) return join(scope.home, ...key.slice(2).split("/"));
  return isAbsolute(key) ? key : join(scope.root, key);
}

/**
 * Turn a desired state into plan items. Managed files from the previous lock
 * that are no longer desired become `remove` items (or `keep` when edited).
 *
 * @param {Desired[]} desired
 * @param {PlanContext} ctx
 * @returns {PlanItem[]}
 */
export function planDesired(desired, ctx) {
  /** @type {PlanItem[]} */
  const items = [];
  /** @type {PlanItem[]} */
  const notices = [];
  const wantedKeys = new Set();

  for (const d of desired) {
    if (d.type === "file") {
      wantedKeys.add(d.key);
      items.push(planFile(d, ctx));
    } else if (d.type === "seed") items.push(planSeed(d));
    else if (d.type === "dir") {
      if (!existsSync(d.abs)) items.push({ type: "dir", action: "create", abs: d.abs, key: ctx.scope.key(d.abs), reason: "new folder" });
    } else if (d.type === "block") items.push(planBlock(d, ctx));
    else if (d.type === "json") items.push(planJson(d, ctx));
    else notices.push({ type: "notice", action: "notice", abs: "", key: "", level: d.level, reason: d.message });
  }

  if (ctx.prior) {
    for (const [key, hash] of Object.entries(ctx.prior.files)) {
      if (wantedKeys.has(key)) continue;
      const abs = keyToAbs(ctx.scope, key);
      const buf = readBuffer(abs);
      if (!buf) continue;
      if (sha256(buf) === hash) {
        items.push({ type: "file", action: "remove", abs, key, reason: "no longer part of the install", staleManaged: true });
      } else {
        items.push({ type: "file", action: "keep", abs, key, reason: "no longer part of the install, but modified locally; left in place", staleManaged: true, hash });
      }
    }
  }
  return [...items, ...notices];
}

// ---------------------------------------------------------------------------
// applying
// ---------------------------------------------------------------------------

/**
 * @param {PlanItem} item
 * @param {import("./scope.js").Scope} scope
 * @param {string} stamp
 * @returns {string|null} backup path
 */
function backupFile(item, scope, stamp) {
  if (!existsSync(item.abs)) return null;
  const dest = join(scope.backupRoot, stamp, item.key.split("#")[0].replace(/^[A-Za-z]:/, "").replace(/^\/+/, ""));
  ensureDir(dirname(dest));
  // Backups are local safety copies. Keep them out of git even after uninstall has removed the
  // .gitignore block that normally hides them: a `*` rule inside the folder ignores the folder.
  const guard = join(scope.backupRoot, ".gitignore");
  if (!existsSync(guard)) writeFileAtomic(guard, "# magik-harness backups: local safety copies, never commit.\n*\n");
  copyFileSync(item.abs, dest);
  return dest;
}

/**
 * Apply plan items. Returns the items with a `backupPath` annotation where relevant.
 * @param {PlanItem[]} items
 * @param {{ scope: import("./scope.js").Scope, stamp: string }} ctx
 * @returns {{ backups: string[] }}
 */
export function applyPlan(items, ctx) {
  /** @type {string[]} */
  const backups = [];
  for (const it of items) {
    if (it.backup) {
      const b = backupFile(it, ctx.scope, ctx.stamp);
      if (b) backups.push(b);
    }
    const writes = it.action === "create" || it.action === "update" || it.action === "insert" || it.action === "merge";
    if (it.type === "file" && writes && it.content !== undefined) writeFileAtomic(it.abs, it.content, { executable: it.executable });
    else if (it.type === "dir" && it.action === "create") ensureDir(it.abs);
    else if (it.type === "seed" && it.action === "create" && it.content !== undefined) writeFileAtomic(it.abs, it.content);
    else if ((it.type === "block" || it.type === "json") && writes && it.newText !== undefined) writeFileAtomic(it.abs, it.newText);
    else if (it.action === "remove") removeFileAndPrune(it.abs, ctx.scope.root);
  }
  return { backups };
}

/**
 * New lock from the previous lock plus what was done.
 * @param {import("./lock.js").Lock|null} prior
 * @param {PlanItem[]} items
 * @param {Partial<import("./lock.js").Lock>} settings
 * @returns {import("./lock.js").Lock}
 */
export function computeLock(prior, items, settings) {
  const lock = { ...emptyLock(), ...(prior ?? {}), ...settings };
  lock.files = { ...(prior?.files ?? {}) };
  lock.blocks = { ...(prior?.blocks ?? {}) };
  lock.json = { ...(prior?.json ?? {}) };
  lock.seeds = { ...(prior?.seeds ?? {}) };

  for (const it of items) {
    if (it.type === "file") {
      if (it.action === "create" || it.action === "update" || it.action === "unchanged") {
        if (it.hash) lock.files[it.key] = it.hash;
      } else if (it.action === "remove") delete lock.files[it.key];
      else if (it.action === "keep" && it.hash && it.staleManaged !== true) lock.files[it.key] = it.hash;
    } else if (it.type === "block") {
      if (["create", "insert", "update", "unchanged"].includes(it.action) && it.hash && it.markerName) {
        lock.blocks[it.key] = { hash: it.hash, name: it.markerName, style: it.blockStyle ?? "html" };
      }
    } else if (it.type === "json") {
      if (["create", "merge", "unchanged"].includes(it.action) && it.commands) {
        lock.json[it.key] = { commands: it.commands, created: Boolean(it.createdByUs) };
      }
    } else if (it.type === "seed" && it.action === "create" && it.hash) {
      lock.seeds[it.key] = it.hash;
    }
  }
  return lock;
}

// ---------------------------------------------------------------------------
// uninstall planning (driven by the lock)
// ---------------------------------------------------------------------------

/**
 * @param {import("./lock.js").Lock} lock
 * @param {{ scope: import("./scope.js").Scope, force: boolean, purge: boolean }} o
 * @returns {PlanItem[]}
 */
export function planUninstall(lock, o) {
  /** @type {PlanItem[]} */
  const items = [];
  const { scope } = o;

  for (const [key, hash] of Object.entries(lock.files)) {
    const abs = keyToAbs(scope, key);
    const buf = readBuffer(abs);
    if (!buf) continue;
    if (sha256(buf) === hash || o.force) items.push({ type: "file", action: "remove", abs, key, reason: sha256(buf) === hash ? "managed file" : "modified locally; removed (--force)", backup: sha256(buf) !== hash });
    else items.push({ type: "file", action: "keep", abs, key, reason: "modified locally; kept (use --force to remove)" });
  }

  for (const [key, info] of Object.entries(lock.blocks)) {
    const cut = key.lastIndexOf("#");
    const rel = key.slice(0, cut);
    const id = key.slice(cut + 1);
    const abs = keyToAbs(scope, rel);
    const text = readText(abs);
    if (text === null) continue;
    const r = removeBlock(text, info.style ?? "html", [info.name]);
    if (!r.removed) continue;
    items.push({ type: "block", action: "remove", abs, key, blockId: id, reason: "managed block", newText: r.text, backup: true });
  }

  for (const [key, info] of Object.entries(lock.json)) {
    const abs = keyToAbs(scope, key);
    const f = readJsonFile(abs);
    if (!f.exists || !f.valid) continue;
    const flavor = key.includes("settings.json") ? "claude" : "cursor";
    const opts = { command: info.commands[0] ?? "", known: info.commands };
    const r = flavor === "claude" ? removeClaudeHooks(f.value, opts) : removeCursorHooks(f.value, opts);
    if (!r.changed) continue;
    if (r.empty && info.created) items.push({ type: "json", action: "remove", abs, key, reason: "file created by magik-harness and now empty" });
    else items.push({ type: "json", action: "merge", abs, key, reason: "hook entry removed; other entries untouched", newText: stringifyJson(r.doc, f.indent, f.finalNewline), backup: true });
  }

  if (o.purge) {
    // Seeds are yours (the pointer, the vault's starter index). Purge removes one only while it is
    // exactly what install wrote; an edited one is real work and stays unless --force.
    for (const [key, hash] of Object.entries(lock.seeds)) {
      const abs = keyToAbs(scope, key);
      const buf = readBuffer(abs);
      if (!buf) continue;
      const untouched = hash !== "" && sha256(buf) === hash;
      if (untouched || o.force) {
        items.push({ type: "remove", action: "remove", abs, key, reason: untouched ? "user-owned file created by install (--purge)" : "edited since it was created; removed (--purge --force)", backup: true });
      } else {
        items.push({ type: "remove", action: "keep", abs, key, reason: "edited since it was created; kept (use --force to remove)" });
      }
    }
  }
  return items;
}

/**
 * Apply uninstall items (blocks/json carry `newText`).
 * @param {PlanItem[]} items
 * @param {{ scope: import("./scope.js").Scope, stamp: string }} ctx
 */
export function applyUninstall(items, ctx) {
  /** @type {string[]} */
  const backups = [];
  for (const it of items) {
    if (it.backup) {
      const b = backupFile(it, ctx.scope, ctx.stamp);
      if (b) backups.push(b);
    }
    if (it.action === "keep") continue;
    if (it.type === "block" && it.action === "remove" && it.newText !== undefined) {
      if (it.newText === "") removeFileAndPrune(it.abs, ctx.scope.root);
      else writeFileAtomic(it.abs, it.newText);
    } else if (it.type === "json" && it.action === "merge" && it.newText !== undefined) writeFileAtomic(it.abs, it.newText);
    else if (it.action === "remove") removeFileAndPrune(it.abs, ctx.scope.root);
  }
  return { backups };
}

