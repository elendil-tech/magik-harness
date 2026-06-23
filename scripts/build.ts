#!/usr/bin/env -S npx --yes tsx
/**
 * scripts/build.ts — populate the plugin's only build output: seeds/.
 *
 * Source layout (all plugin-authored, committed):
 *
 *   <plugin>/rules/*.mdc              — Cursor rules (alwaysApply: false)
 *   <plugin>/skills/<name>/SKILL.md   — Cursor skills (flat, one level deep)
 *   <plugin>/commands/*.md            — Cursor slash commands
 *   <plugin>/hooks/*                  — Cursor hooks
 *   <plugin>/seed-sources/            — what /magik-repo-setup lays into a project + vault
 *
 * Build output (gitignored, regenerated each run):
 *
 *   <plugin>/seeds/                   — copy of seed-sources/, used at runtime
 *
 * Why a separate seeds/ exists at all: install-local.ts copies a curated
 * subset of the plugin into ~/.cursor/plugins/local/magik-repo/, and we want
 * the runtime seed payload to live next to the rest of the runtime files
 * under a stable name (seeds/, not seed-sources/) — so the hook can resolve
 * paths the same way regardless of where it runs from.
 *
 * All framework content lives in this plugin folder and only this folder.
 * Nothing is read from outside the plugin root.
 */

import {
  cpSync,
  existsSync,
  mkdirSync,
  readdirSync,
  rmSync,
} from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const PLUGIN_ROOT = dirname(SCRIPT_DIR);

const SEEDS_OUT = join(PLUGIN_ROOT, "seeds");
const SEED_SOURCES = join(PLUGIN_ROOT, "seed-sources");

function clean(dir: string): void {
  if (existsSync(dir)) rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
}

function countFiles(dir: string): number {
  if (!existsSync(dir)) return 0;
  let n = 0;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) n += countFiles(full);
    else if (entry.isFile()) n += 1;
  }
  return n;
}

function buildSeeds(): { count: number } {
  clean(SEEDS_OUT);
  if (!existsSync(SEED_SOURCES)) {
    throw new Error(`seed sources missing: ${SEED_SOURCES}`);
  }
  cpSync(SEED_SOURCES, SEEDS_OUT, { recursive: true });
  return { count: countFiles(SEEDS_OUT) };
}

function main(): void {
  console.log("magik-repo build");
  console.log(`  plugin root : ${PLUGIN_ROOT}`);
  console.log("");

  const seeds = buildSeeds();
  console.log(`  seeds: ${seeds.count} file(s) → ${relative(PLUGIN_ROOT, SEEDS_OUT)}/`);

  console.log(
    `\nmagik-repo built — ${seeds.count} seed files. ` +
      "(rules, skills, commands, hooks are plugin-authored, not built.)",
  );
}

main();
