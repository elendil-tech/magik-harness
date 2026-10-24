// @ts-check
/**
 * version.js — where the installed package lives and what version it is.
 * Single source of truth is package.json; the runtime's RUNTIME_VERSION is
 * kept equal to it by tests/version-sync.test.ts.
 */

import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

/** Absolute path of the package root (the directory holding package.json). */
export const PKG_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

/** @type {{ name: string, version: string }} */
const pkg = JSON.parse(readFileSync(join(PKG_ROOT, "package.json"), "utf8"));

export const PKG_NAME = pkg.name;
export const VERSION = pkg.version;
