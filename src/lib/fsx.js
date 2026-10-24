// @ts-check
/**
 * fsx.js — small filesystem helpers shared by the installer (zero dependencies).
 * Everything is synchronous: the CLI is a short-lived process and the plan/apply
 * flow is easier to reason about (and to test) without concurrency.
 */

import { createHash } from "node:crypto";
import {
  chmodSync,
  existsSync,
  lstatSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  realpathSync,
  renameSync,
  rmdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { basename, dirname, join, relative, resolve, sep } from "node:path";

/**
 * Real path of `p`, or, when it does not exist yet, the real path of its deepest existing
 * ancestor plus the rest. Lets a not-yet-created vault be compared with the home directory
 * even when one of them sits behind a symlink (macOS `/tmp`, NFS homes).
 * @param {string} p
 * @returns {string}
 */
export function realish(p) {
  let cur = resolve(p);
  /** @type {string[]} */
  const tail = [];
  for (;;) {
    try {
      return join(realpathSync(cur), ...tail.slice().reverse());
    } catch {
      const parent = dirname(cur);
      if (parent === cur) return resolve(p);
      tail.push(basename(cur));
      cur = parent;
    }
  }
}

/**
 * Is `cmd` an executable file on PATH? (No shell, no subprocess.)
 * @param {string} cmd
 * @param {Record<string, string|undefined>} [env]
 * @param {string} [platform]
 * @returns {boolean}
 */
export function onPath(cmd, env = process.env, platform = process.platform) {
  const win = platform === "win32";
  const dirs = String(env.PATH ?? env.Path ?? "").split(win ? ";" : ":").filter(Boolean);
  const exts = win ? ["", ...String(env.PATHEXT ?? ".EXE;.CMD;.BAT").split(";").filter(Boolean)] : [""];
  for (const d of dirs) {
    for (const e of exts) {
      try {
        if (statSync(join(d, cmd + e)).isFile()) return true;
      } catch {
        /* not here */
      }
    }
  }
  return false;
}

/** @param {string|Buffer} data */
export function sha256(data) {
  return "sha256:" + createHash("sha256").update(data).digest("hex");
}

/** Forward-slash form of a path (lock keys and display). @param {string} p */
export function toPosix(p) {
  return p.split(sep).join("/").replace(/\\/g, "/");
}

/** @param {string} p */
export function exists(p) {
  return existsSync(p);
}

/** @param {string} p */
export function isFile(p) {
  try {
    return statSync(p).isFile();
  } catch {
    return false;
  }
}

/** @param {string} p */
export function isDirectory(p) {
  try {
    return statSync(p).isDirectory();
  } catch {
    return false;
  }
}

/** @param {string} p */
export function isSymlink(p) {
  try {
    return lstatSync(p).isSymbolicLink();
  } catch {
    return false;
  }
}

/** @param {string} p @returns {string|null} */
export function readText(p) {
  try {
    return readFileSync(p, "utf8");
  } catch {
    return null;
  }
}

/** @param {string} p @returns {Buffer|null} */
export function readBuffer(p) {
  try {
    return readFileSync(p);
  } catch {
    return null;
  }
}

/** @param {string} p */
export function ensureDir(p) {
  mkdirSync(p, { recursive: true });
}

/**
 * Write a file atomically (temp file + rename) and create parent directories.
 * @param {string} p
 * @param {string|Buffer} content
 * @param {{ executable?: boolean }} [opts]
 */
export function writeFileAtomic(p, content, opts = {}) {
  ensureDir(dirname(p));
  const tmp = `${p}.magik-tmp-${process.pid}`;
  writeFileSync(tmp, content);
  if (opts.executable) {
    try {
      chmodSync(tmp, 0o755);
    } catch {
      /* not supported on this platform */
    }
  }
  renameSync(tmp, p);
}

/**
 * Remove a file, then remove now-empty parent directories up to (excluding) `stopAt`.
 * @param {string} p
 * @param {string} stopAt
 */
export function removeFileAndPrune(p, stopAt) {
  rmSync(p, { force: true });
  let dir = dirname(p);
  const stop = resolve(stopAt);
  while (resolve(dir) !== stop && resolve(dir).startsWith(stop + sep)) {
    try {
      if (readdirSync(dir).length > 0) return;
      rmdirSync(dir);
    } catch {
      return;
    }
    dir = dirname(dir);
  }
}

const SKIP_NAMES = new Set([".DS_Store", "__pycache__", "node_modules", ".git", "Thumbs.db"]);

/**
 * All files under `dir`, as sorted forward-slash relative paths. Skips OS noise,
 * bytecode and caches.
 * @param {string} dir
 * @returns {string[]}
 */
export function listFiles(dir) {
  /** @type {string[]} */
  const out = [];
  /** @param {string} d */
  const walk = (d) => {
    for (const ent of readdirSync(d, { withFileTypes: true })) {
      if (SKIP_NAMES.has(ent.name) || ent.name.endsWith(".pyc")) continue;
      const abs = join(d, ent.name);
      if (ent.isDirectory()) walk(abs);
      else if (ent.isFile()) out.push(toPosix(relative(dir, abs)));
    }
  };
  if (isDirectory(dir)) walk(dir);
  return out.sort();
}

/** True if the file has any execute bit (POSIX). @param {string} p */
export function isExecutable(p) {
  try {
    return (statSync(p).mode & 0o111) !== 0;
  } catch {
    return false;
  }
}

/** Dominant line ending of a text. @param {string} text */
export function detectEol(text) {
  const crlf = (text.match(/\r\n/g) ?? []).length;
  const lf = (text.match(/(?<!\r)\n/g) ?? []).length;
  return crlf > lf ? "\r\n" : "\n";
}

/** Normalize to LF for hashing and comparisons. @param {string} text */
export function toLf(text) {
  return text.replace(/\r\n/g, "\n");
}
