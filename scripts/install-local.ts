#!/usr/bin/env -S npx --yes tsx
/**
 * scripts/install-local.ts — install this plugin into Cursor's user-local
 * plugins directory as a real (copied) directory.
 *
 * Why a copy and not a symlink: Cursor 0.x does NOT follow symlinks placed
 * in ~/.cursor/plugins/local/<name>. `loadUserLocalPlugins` reports 0
 * plugins in that case. Tracked at https://github.com/cursor/plugins/issues/35.
 * The official docs suggest symlinks for fast iteration, but in practice
 * only real directories load. So we copy.
 *
 * Source:  this plugin source root (the repo root)
 * Target:  ~/.cursor/plugins/local/magik-repo/
 *
 * Copies only what the plugin runtime needs:
 *   .cursor-plugin/, commands/, rules/, skills/, seeds/, hooks/
 *   README.md, LICENSE, CHANGELOG.md, package.json
 *
 * Excludes dev-only artifacts (node_modules/, tests/, scripts/,
 * seed-sources/, tsconfig.json, pnpm-lock.yaml, .gitignore).
 *
 * Idempotent: removes any prior install (real dir or legacy symlink)
 * before copying.
 */

import { cpSync, existsSync, lstatSync, mkdirSync, rmSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const PLUGIN_ROOT = dirname(SCRIPT_DIR);
const PLUGINS_DIR = join(homedir(), ".cursor", "plugins", "local");
const INSTALL_PATH = join(PLUGINS_DIR, "magik-repo");

const INCLUDE = [
  ".cursor-plugin",
  "commands",
  "rules",
  "skills",
  "seeds",
  "hooks",
  "assets",
  "README.md",
  "LICENSE",
  "CHANGELOG.md",
  "package.json",
];

const REQUIRED_BUILD_OUTPUTS = ["rules", "skills", "seeds"];

function main(): void {
  for (const out of REQUIRED_BUILD_OUTPUTS) {
    if (!existsSync(join(PLUGIN_ROOT, out))) {
      console.error(
        `error: ${out}/ is missing. Run \`pnpm build\` first (or use \`pnpm install-local\` which builds + installs in one step).`,
      );
      process.exit(1);
    }
  }

  if (!existsSync(PLUGINS_DIR)) {
    mkdirSync(PLUGINS_DIR, { recursive: true });
    console.log(`created ${PLUGINS_DIR}`);
  }

  if (existsSync(INSTALL_PATH) || isSymlink(INSTALL_PATH)) {
    rmSync(INSTALL_PATH, { recursive: true, force: true });
    console.log(`removed prior install at ${INSTALL_PATH}`);
  }

  mkdirSync(INSTALL_PATH, { recursive: true });

  let copied = 0;
  for (const item of INCLUDE) {
    const src = join(PLUGIN_ROOT, item);
    if (!existsSync(src)) continue;
    cpSync(src, join(INSTALL_PATH, item), { recursive: true });
    copied += 1;
  }

  console.log(
    `installed magik-repo → ${INSTALL_PATH}\n  source: ${resolve(PLUGIN_ROOT)}\n  copied: ${copied} top-level entries`,
  );
  console.log(
    "\nNext: reload Cursor (Cmd+Shift+P → 'Developer: Reload Window').\nThen verify /init-harness, /audit, /drift-scan, /kb-add appear.",
  );
}

function isSymlink(p: string): boolean {
  try {
    return lstatSync(p).isSymbolicLink();
  } catch {
    return false;
  }
}

main();
