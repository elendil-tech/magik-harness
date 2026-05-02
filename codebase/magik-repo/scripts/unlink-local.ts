#!/usr/bin/env -S npx --yes tsx
/**
 * scripts/unlink-local.ts — remove the local symlink at
 * `~/.cursor/plugins/local/magik-repo` if it points to this plugin source.
 * Refuses to remove a link pointing elsewhere.
 */

import { existsSync, lstatSync, readlinkSync, unlinkSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const PLUGIN_ROOT = dirname(SCRIPT_DIR);
const LINK_PATH = join(homedir(), ".cursor", "plugins", "local", "magik-repo");

function main(): void {
  if (!existsSync(LINK_PATH) && !lstatSafely(LINK_PATH)) {
    console.log(`nothing to unlink: ${LINK_PATH} does not exist.`);
    return;
  }

  const stat = lstatSync(LINK_PATH);
  if (!stat.isSymbolicLink()) {
    console.error(
      `refusing: ${LINK_PATH} is not a symlink. Will not delete a real file.`,
    );
    process.exit(1);
  }

  const current = readlinkSync(LINK_PATH);
  const target = resolve(PLUGIN_ROOT);
  const resolvedCurrent = resolve(dirname(LINK_PATH), current);

  if (resolvedCurrent !== target) {
    console.error(
      `refusing: ${LINK_PATH} points elsewhere:\n  current: ${current}\n  expected: ${target}`,
    );
    process.exit(1);
  }

  unlinkSync(LINK_PATH);
  console.log(`unlinked: ${LINK_PATH}`);
}

function lstatSafely(p: string): boolean {
  try {
    lstatSync(p);
    return true;
  } catch {
    return false;
  }
}

main();
