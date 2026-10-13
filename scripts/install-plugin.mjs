#!/usr/bin/env node
/**
 * scripts/install-plugin.mjs: install the optional Cursor plugin packaging into
 * Cursor's user-local plugins directory, as a real (copied) directory. Cursor
 * does not follow symlinks there.
 *
 *   node scripts/install-plugin.mjs                 install to ~/.cursor/plugins/local/magik-harness
 *   node scripts/install-plugin.mjs --target <dir>  install somewhere else (tests, inspection)
 *   node scripts/install-plugin.mjs --uninstall     remove it
 *
 * The plugin is a convenience: skills and commands for Cursor users. The CLI is
 * the product; this folder never touches ~/.cursor/plugins/local/magik-repo
 * (the 1.x plugin) so both can be installed side by side while you migrate.
 */

import { cpSync, existsSync, lstatSync, mkdirSync, rmSync, unlinkSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const args = process.argv.slice(2);
/** @param {string} name */
const flag = (name) => args.includes(name);
/** @param {string} name */
const value = (name) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};

const target = resolve(value("--target") ?? join(homedir(), ".cursor", "plugins", "local", "magik-harness"));
const INCLUDE = [".cursor-plugin", "commands", "skills", "assets/magik-harness-logo.png", "README.md", "LICENSE", "CHANGELOG.md", "package.json"];

/** @param {string} p */
const isSymlink = (p) => {
  try {
    return lstatSync(p).isSymbolicLink();
  } catch {
    return false;
  }
};

if (flag("--uninstall")) {
  if (isSymlink(target)) {
    unlinkSync(target);
    console.log(`removed symlink ${target}`);
  } else if (existsSync(target)) {
    rmSync(target, { recursive: true, force: true });
    console.log(`removed ${target}`);
  } else console.log(`nothing to uninstall: ${target} does not exist`);
  process.exit(0);
}

for (const required of [".cursor-plugin/plugin.json", "skills"]) {
  if (!existsSync(join(ROOT, required))) {
    console.error(`error: ${required} is missing from ${ROOT}`);
    process.exit(1);
  }
}

if (existsSync(target) || isSymlink(target)) {
  rmSync(target, { recursive: true, force: true });
  console.log(`removed prior install at ${target}`);
}
mkdirSync(target, { recursive: true });
let copied = 0;
for (const item of INCLUDE) {
  const src = join(ROOT, item);
  if (!existsSync(src)) continue;
  const dest = join(target, item);
  mkdirSync(dirname(dest), { recursive: true });
  cpSync(src, dest, { recursive: true });
  copied += 1;
}
console.log(`installed magik-harness plugin -> ${target}\n  source: ${ROOT}\n  copied: ${copied} entries`);
console.log("\nNext: reload Cursor (Cmd+Shift+P, 'Developer: Reload Window'). The skills and the /magik-harness-* commands should appear.");
