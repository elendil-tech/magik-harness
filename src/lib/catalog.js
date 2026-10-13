// @ts-check
/**
 * catalog.js — what the package can install: core skills, opt-in packs, profiles.
 *
 *   skills/<name>/SKILL.md                          core skills
 *   packs/<pack>/pack.json + packs/<pack>/skills/   opt-in packs
 *   content/profiles.json                           profile -> skills + primer
 *
 * External packs (a private repo's own policy bundles) use the same shape and
 * are added with `--pack-dir <dir>` (a directory of pack folders).
 */

import { readdirSync } from "node:fs";
import { join } from "node:path";

import { isDirectory, isExecutable, listFiles, onPath, readBuffer, readText } from "./fsx.js";
import { parseSkillMd } from "./skillmd.js";
import { PKG_ROOT } from "../version.js";

/**
 * @typedef {Object} SkillFile
 * @property {string} rel         forward-slash path inside the skill folder
 * @property {string} abs
 * @property {boolean} executable
 */

/**
 * @typedef {Object} Skill
 * @property {string} name
 * @property {string} dir
 * @property {string} origin      "core" or "pack:<name>"
 * @property {string|null} description
 * @property {SkillFile[]} files
 */

/**
 * @typedef {Object} Pack
 * @property {string} name
 * @property {string} description
 * @property {string} dir
 * @property {string[]} skills
 * @property {Record<string, any>} requires
 */

/**
 * @typedef {Object} Profile
 * @property {string[]} skills
 * @property {string} primer       file name under content/
 * @property {boolean} vault
 */

/** @param {string} dir @param {string} origin @returns {Skill|null} */
function readSkill(dir, origin) {
  const text = readText(join(dir, "SKILL.md"));
  if (text === null) return null;
  const meta = parseSkillMd(text);
  const name = dir.split(/[\\/]/).pop() ?? "";
  const files = listFiles(dir).map((rel) => ({ rel, abs: join(dir, rel), executable: isExecutable(join(dir, rel)) }));
  return { name, dir, origin, description: meta.description, files };
}

/** @param {string} root @param {string} origin @returns {Skill[]} */
function readSkillsIn(root, origin) {
  if (!isDirectory(root)) return [];
  return readdirSync(root, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => readSkill(join(root, e.name), origin))
    .filter((s) => s !== null)
    .sort((a, b) => a.name.localeCompare(b.name));
}

/** @param {string} packsRoot @returns {{ packs: Pack[], skills: Skill[] }} */
function readPacksIn(packsRoot) {
  /** @type {Pack[]} */
  const packs = [];
  /** @type {Skill[]} */
  const skills = [];
  if (!isDirectory(packsRoot)) return { packs, skills };
  for (const e of readdirSync(packsRoot, { withFileTypes: true })) {
    if (!e.isDirectory()) continue;
    const dir = join(packsRoot, e.name);
    const manifestText = readText(join(dir, "pack.json"));
    if (manifestText === null) continue;
    try {
      const m = JSON.parse(manifestText);
      const packSkills = readSkillsIn(join(dir, "skills"), `pack:${e.name}`);
      packs.push({
        name: e.name,
        description: typeof m.description === "string" ? m.description : "",
        dir,
        skills: packSkills.map((s) => s.name),
        requires: typeof m.requires === "object" && m.requires ? m.requires : {},
      });
      skills.push(...packSkills);
    } catch {
      /* a broken external pack is skipped; doctor reports it via `list` */
    }
  }
  return { packs, skills };
}

/**
 * What would stop a pack's scripts from running on this machine. Warnings only: a pack still
 * installs, because the skills are useful reading even where the scripts cannot run.
 * @param {Pack} pack
 * @param {{ env?: Record<string, string|undefined>, platform?: string }} [opts]
 * @returns {string[]}
 */
export function packProblems(pack, opts = {}) {
  const env = opts.env ?? process.env;
  const platform = opts.platform ?? process.platform;
  /** @type {string[]} */
  const out = [];
  const platforms = Array.isArray(pack.requires.platforms) ? pack.requires.platforms.map(String) : [];
  if (platforms.length > 0 && !platforms.includes(platform)) {
    out.push(`pack ${pack.name} is written for ${platforms.join(", ")}; this machine is ${platform}, so its scripts may not run`);
  }
  const commands = Array.isArray(pack.requires.commands) ? pack.requires.commands.map(String) : [];
  for (const c of commands) {
    if (!onPath(c, env, platform)) out.push(`pack ${pack.name} needs \`${c}\` on PATH, which was not found`);
  }
  return out;
}

/**
 * @returns {{ profiles: Record<string, Profile>, globalOnly: string[] }}
 */
export function loadProfiles() {
  const text = readText(join(PKG_ROOT, "content", "profiles.json"));
  if (text === null) throw new Error("content/profiles.json is missing from the package");
  const raw = JSON.parse(text);
  const { globalOnly = [], ...profiles } = raw;
  return { profiles, globalOnly };
}

/**
 * @param {{ packDirs?: string[] }} [opts]
 * @returns {{ core: Skill[], packs: Pack[], packSkills: Skill[], all: Map<string, Skill> }}
 */
export function loadCatalog(opts = {}) {
  const core = readSkillsIn(join(PKG_ROOT, "skills"), "core");
  const builtin = readPacksIn(join(PKG_ROOT, "packs"));
  /** @type {Pack[]} */
  const packs = [...builtin.packs];
  /** @type {Skill[]} */
  const packSkills = [...builtin.skills];
  for (const d of opts.packDirs ?? []) {
    const ext = readPacksIn(d);
    packs.push(...ext.packs);
    packSkills.push(...ext.skills);
  }
  /** @type {Map<string, Skill>} */
  const all = new Map();
  for (const s of [...core, ...packSkills]) all.set(s.name, s);
  return { core, packs, packSkills, all };
}

/**
 * Read a skill file's bytes. @param {SkillFile} f
 * @returns {Buffer}
 */
export function readSkillFile(f) {
  const b = readBuffer(f.abs);
  if (!b) throw new Error(`cannot read ${f.abs}`);
  return b;
}
