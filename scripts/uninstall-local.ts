#!/usr/bin/env -S npx --yes tsx
/**
 * scripts/uninstall-local.ts — remove the plugin install at
 * ~/.cursor/plugins/local/magik-repo. Handles both real directories
 * (current install method) and legacy symlinks (from old link-local script).
 */

import { existsSync, lstatSync, rmSync, unlinkSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const INSTALL_PATH = join(homedir(), ".cursor", "plugins", "local", "magik-repo");

function main(): void {
  const symlink = isSymlink(INSTALL_PATH);
  const real = existsSync(INSTALL_PATH) && !symlink;

  if (!symlink && !real) {
    console.log(`nothing to uninstall: ${INSTALL_PATH} does not exist.`);
    return;
  }

  if (symlink) {
    unlinkSync(INSTALL_PATH);
    console.log(`removed legacy symlink: ${INSTALL_PATH}`);
    return;
  }

  rmSync(INSTALL_PATH, { recursive: true, force: true });
  console.log(`uninstalled: ${INSTALL_PATH}`);
}

function isSymlink(p: string): boolean {
  try {
    return lstatSync(p).isSymbolicLink();
  } catch {
    return false;
  }
}

main();
