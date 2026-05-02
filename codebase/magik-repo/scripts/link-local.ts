#!/usr/bin/env -S npx --yes tsx
/**
 * scripts/link-local.ts — symlink the plugin source into Cursor's local plugins
 * directory so it is immediately discoverable.
 *
 *   ~/.cursor/plugins/local/magik-repo  ->  <plugin-source>
 *
 * If the link already exists pointing to this plugin: no-op.
 * If it exists pointing elsewhere: refuse and print the current target.
 */

import {
  existsSync,
  lstatSync,
  mkdirSync,
  readlinkSync,
  symlinkSync,
} from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const PLUGIN_ROOT = dirname(SCRIPT_DIR);
const PLUGINS_DIR = join(homedir(), ".cursor", "plugins", "local");
const LINK_PATH = join(PLUGINS_DIR, "magik-repo");

function main(): void {
  if (!existsSync(PLUGINS_DIR)) {
    mkdirSync(PLUGINS_DIR, { recursive: true });
    console.log(`created ${PLUGINS_DIR}`);
  }

  const target = resolve(PLUGIN_ROOT);

  if (existsSync(LINK_PATH) || isBrokenSymlink(LINK_PATH)) {
    const stat = lstatSync(LINK_PATH);
    if (!stat.isSymbolicLink()) {
      console.error(
        `refusing: ${LINK_PATH} exists and is not a symlink. Move or remove it first.`,
      );
      process.exit(1);
    }
    const current = readlinkSync(LINK_PATH);
    if (resolve(dirname(LINK_PATH), current) === target) {
      console.log(`already linked: ${LINK_PATH} -> ${current}`);
      return;
    }
    console.error(
      `refusing: ${LINK_PATH} already points elsewhere:\n  current: ${current}\n  wanted : ${target}`,
    );
    process.exit(1);
  }

  symlinkSync(target, LINK_PATH);
  console.log(`linked: ${LINK_PATH} -> ${target}`);
}

function isBrokenSymlink(p: string): boolean {
  try {
    const stat = lstatSync(p);
    return stat.isSymbolicLink();
  } catch {
    return false;
  }
}

main();
