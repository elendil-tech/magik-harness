#!/usr/bin/env -S npx --yes tsx
/**
 * scripts/build.ts — populate the plugin's build outputs.
 *
 * Two source kinds, two contracts:
 *
 *   1. Framework rules + skills — sourced from the harness root. These
 *      files are the framework itself; improving them in the harness root
 *      improves them for every project that installs magik-repo.
 *
 *        <harness>/.cursor/rules/*.mdc           → <plugin>/rules/*.mdc   (alwaysApply: false)
 *        <harness>/.cursor/skills/_core/<name>/  → <plugin>/skills/<name>/   (FLATTENED — see buildSkills)
 *
 *   2. Seed payload — sourced from <plugin>/seed-sources/ (project templates)
 *      and <harness>/.cursor/skills/_templates/ (skill templates). These are
 *      project-side files that /init-harness lays down into a fresh project.
 *      seed-sources/ MUST stay decoupled from the harness root so domain-spine
 *      content (knowledge/_meta/) doesn't leak into installs; _templates/
 *      DOES come from the harness root because templates are framework
 *      content shared by the harness's own scaffolding-author skill.
 *
 *        <plugin>/seed-sources/                  → <plugin>/seeds/                       (recursive)
 *        <harness>/.cursor/skills/_templates/    → <plugin>/seeds/.cursor/skills/_templates/
 *
 * Slash commands live at <plugin>/commands/ as plugin-authored, committed
 * files. They are NOT build outputs and NOT copied from the harness root —
 * having project-level copies caused Cursor to surface duplicates.
 *
 * Build-output dirs (rules/, skills/, seeds/) are wiped and rebuilt each run.
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
const SEED_SOURCES = join(PLUGIN_ROOT, "seed-sources");

function ensureDir(dir: string): void {
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
}

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

/**
 * Skills are flattened into <plugin>/skills/<name>/SKILL.md so Cursor's
 * default discovery (skills/<name>/SKILL.md) finds them. The harness-side
 * `_core/` namespace exists in `<harness>/.cursor/skills/_core/` to keep
 * domain-skill folders separate from framework skills, but at distribution
 * time we drop the wrapper because Cursor's discovery is one-level-deep.
 *
 * Templates do NOT live under `skills/` in the plugin — they aren't Cursor
 * skills. They are seeded into the user's project at
 * `.cursor/skills/_templates/<file>` (see buildSeeds below) so the
 * scaffolding-author skill can reference them by the project-relative
 * path it was authored to use.
 */
function buildSkills(): { count: number } {
  clean(SKILLS_OUT);
  const coreSrc = join(HARNESS_ROOT, ".cursor", "skills", "_core");
  if (!existsSync(coreSrc)) {
    throw new Error(`skills source missing: ${coreSrc}`);
  }
  let count = 0;
  for (const entry of readdirSync(coreSrc, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const skillName = entry.name;
    const skillFile = join(coreSrc, skillName, "SKILL.md");
    if (!existsSync(skillFile)) continue;
    cpSync(join(coreSrc, skillName), join(SKILLS_OUT, skillName), {
      recursive: true,
    });
    count += countFiles(join(SKILLS_OUT, skillName));
  }
  return { count };
}

/**
 * Seeds come from two sources:
 *   1. <plugin>/seed-sources/ — project-template files (AGENTS.primer.md,
 *      gitignore.harness, knowledge/, workspace/, codebase/).
 *   2. <harness>/.cursor/skills/_templates/ — skill templates that the
 *      scaffolding-author skill expects at .cursor/skills/_templates/ in
 *      the user's project.
 *
 * Both are merged into <plugin>/seeds/. The harness root is the source for
 * (2) deliberately — those templates evolve with the framework, and we
 * want every plugin build to ship the latest version.
 */
function buildSeeds(): { count: number } {
  clean(SEEDS_OUT);
  if (!existsSync(SEED_SOURCES)) {
    throw new Error(`seed sources missing: ${SEED_SOURCES}`);
  }
  cpSync(SEED_SOURCES, SEEDS_OUT, { recursive: true });

  const templatesSrc = join(HARNESS_ROOT, ".cursor", "skills", "_templates");
  if (existsSync(templatesSrc)) {
    const templatesDst = join(SEEDS_OUT, ".cursor", "skills", "_templates");
    cpSync(templatesSrc, templatesDst, { recursive: true });
  }

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

  const seeds = buildSeeds();
  console.log(`  seeds : ${seeds.count} file(s) → ${relative(PLUGIN_ROOT, SEEDS_OUT)}/`);

  console.log(
    `\nmagik-repo built — ${rules.count} rules, ${skills.count} skills, ${seeds.count} seed files. (commands are plugin-authored, not built.)`,
  );
}

main();
