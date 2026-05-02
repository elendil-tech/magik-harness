#!/usr/bin/env -S npx --yes tsx
/**
 * scripts/build.ts — populate the plugin's build outputs.
 *
 * Two source kinds, two contracts:
 *
 *   1. Framework — sourced from the harness root. These files are the
 *      framework itself; improving them in the harness root improves them
 *      for every project that installs magik-repo.
 *
 *        <harness>/.cursor/rules/*.mdc        → <plugin>/rules/*.mdc   (alwaysApply: false)
 *        <harness>/.cursor/skills/_core/      → <plugin>/skills/_core/
 *        <harness>/.cursor/skills/_templates/ → <plugin>/skills/_templates/
 *        <harness>/.cursor/commands/{audit,drift-scan,kb-add}.md → <plugin>/commands/
 *
 *   2. Seed payload — sourced from <plugin>/seed-sources/. These are
 *      project-template files that get laid down into a fresh project by
 *      /init-harness. They MUST NOT be sourced from the harness root, because
 *      the harness root is THIS project's working copy and will diverge
 *      (e.g. as we populate knowledge/_meta/domains.md or glossary.md). The
 *      contract: edit <plugin>/seed-sources/ to change what fresh projects get.
 *
 *        <plugin>/seed-sources/                → <plugin>/seeds/   (recursive)
 *
 * Build-output dirs (rules/, skills/, seeds/) are wiped and rebuilt each run.
 * commands/ is preserved so the plugin-authored init-harness.md is not deleted.
 */

import {
  cpSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const PLUGIN_ROOT = dirname(SCRIPT_DIR);
const HARNESS_ROOT = dirname(dirname(PLUGIN_ROOT));

const RULES_OUT = join(PLUGIN_ROOT, "rules");
const SKILLS_OUT = join(PLUGIN_ROOT, "skills");
const SEEDS_OUT = join(PLUGIN_ROOT, "seeds");
const COMMANDS_OUT = join(PLUGIN_ROOT, "commands");
const SEED_SOURCES = join(PLUGIN_ROOT, "seed-sources");

const COMMANDS_FROM_HARNESS = ["audit.md", "drift-scan.md", "kb-add.md"];

function ensureDir(dir: string): void {
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
}

function clean(dir: string): void {
  if (existsSync(dir)) rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
}

function copyFile(src: string, dst: string): void {
  ensureDir(dirname(dst));
  cpSync(src, dst);
}

function copyDir(src: string, dst: string): number {
  if (!existsSync(src)) {
    throw new Error(`source missing: ${src}`);
  }
  ensureDir(dst);
  cpSync(src, dst, { recursive: true });
  return countFiles(dst);
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

/**
 * Demote `alwaysApply: true` to `false` in a single .mdc file's YAML
 * frontmatter. Plugin-shipped always-applied rules get demoted regardless of
 * this flag, but setting it explicitly avoids confusion.
 */
function demoteRule(src: string, dst: string): void {
  const raw = readFileSync(src, "utf-8");
  const fmMatch = raw.match(/^---\n([\s\S]*?)\n---\n?/);
  if (!fmMatch) {
    writeFileSync(dst, raw);
    return;
  }
  const fm = fmMatch[1]!;
  let updatedFm: string;
  if (/^alwaysApply:\s*(true|false)\s*$/m.test(fm)) {
    updatedFm = fm.replace(/^alwaysApply:\s*true\s*$/m, "alwaysApply: false");
  } else {
    updatedFm = `${fm}\nalwaysApply: false`;
  }
  const body = raw.slice(fmMatch[0].length);
  writeFileSync(dst, `---\n${updatedFm}\n---\n${body}`);
}

function buildRules(): { count: number } {
  clean(RULES_OUT);
  const src = join(HARNESS_ROOT, ".cursor", "rules");
  if (!existsSync(src)) {
    throw new Error(`rules source missing: ${src}`);
  }
  let count = 0;
  for (const entry of readdirSync(src, { withFileTypes: true })) {
    if (!entry.isFile() || !entry.name.endsWith(".mdc")) continue;
    demoteRule(join(src, entry.name), join(RULES_OUT, entry.name));
    count += 1;
  }
  return { count };
}

function buildSkills(): { count: number } {
  clean(SKILLS_OUT);
  const coreSrc = join(HARNESS_ROOT, ".cursor", "skills", "_core");
  const templatesSrc = join(HARNESS_ROOT, ".cursor", "skills", "_templates");
  let count = 0;
  count += copyDir(coreSrc, join(SKILLS_OUT, "_core"));
  count += copyDir(templatesSrc, join(SKILLS_OUT, "_templates"));
  return { count };
}

/**
 * Commands: plugin-authored init-harness.md is committed; the other 3 are
 * copied from <harness>/.cursor/commands/. We do NOT clean the commands/ dir
 * — that would delete init-harness.md.
 */
function buildCommands(): { count: number } {
  ensureDir(COMMANDS_OUT);
  const src = join(HARNESS_ROOT, ".cursor", "commands");
  let count = 0;
  for (const name of COMMANDS_FROM_HARNESS) {
    const from = join(src, name);
    if (!existsSync(from)) {
      console.warn(`  warn: command source missing: ${from}`);
      continue;
    }
    copyFile(from, join(COMMANDS_OUT, name));
    count += 1;
  }
  return { count };
}

/**
 * Seeds come exclusively from <plugin>/seed-sources/. Nothing here reads
 * from the harness root — that's by design (see the file header).
 */
function buildSeeds(): { count: number } {
  clean(SEEDS_OUT);
  if (!existsSync(SEED_SOURCES)) {
    throw new Error(`seed sources missing: ${SEED_SOURCES}`);
  }
  cpSync(SEED_SOURCES, SEEDS_OUT, { recursive: true });
  return { count: countFiles(SEEDS_OUT) };
}

function main(): void {
  console.log(`magik-repo build`);
  console.log(`  plugin root : ${PLUGIN_ROOT}`);
  console.log(`  harness root: ${HARNESS_ROOT}`);
  console.log("");

  const rules = buildRules();
  console.log(`  rules : ${rules.count} file(s) → ${relative(PLUGIN_ROOT, RULES_OUT)}/`);

  const skills = buildSkills();
  console.log(`  skills: ${skills.count} file(s) → ${relative(PLUGIN_ROOT, SKILLS_OUT)}/`);

  const commands = buildCommands();
  console.log(
    `  cmds  : ${commands.count} file(s) copied → ${relative(PLUGIN_ROOT, COMMANDS_OUT)}/`,
  );

  const seeds = buildSeeds();
  console.log(`  seeds : ${seeds.count} file(s) → ${relative(PLUGIN_ROOT, SEEDS_OUT)}/`);

  console.log(
    `\nmagik-repo built — ${rules.count} rules, ${skills.count} skills, ${commands.count} commands copied, ${seeds.count} seed files.`,
  );
}

main();
