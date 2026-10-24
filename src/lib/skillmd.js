// @ts-check
/**
 * skillmd.js — parse and lint `SKILL.md` files against the Agent Skills format
 * (https://agentskills.io). Only the subset of YAML that skills use is
 * supported: top-level scalar keys, `>-`/`>`/`|` block scalars, quoted strings,
 * and an opaque nested `metadata:` map.
 */

import { basename } from "node:path";

import { readText } from "./fsx.js";

export const NAME_MAX = 64;
export const DESCRIPTION_MAX = 1024;
export const NAME_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/**
 * @typedef {Object} SkillMeta
 * @property {string|null} name
 * @property {string|null} description
 * @property {string} body          text after the frontmatter
 * @property {string[]} errors      frontmatter problems (does not include lint rules)
 */

/** @param {string} v */
function unquote(v) {
  const t = v.trim();
  if ((t.startsWith('"') && t.endsWith('"') && t.length >= 2) || (t.startsWith("'") && t.endsWith("'") && t.length >= 2)) {
    return t.slice(1, -1);
  }
  return t;
}

/**
 * @param {string} text
 * @returns {SkillMeta}
 */
export function parseSkillMd(text) {
  /** @type {string[]} */
  const errors = [];
  const src = text.replace(/^\uFEFF/, "").replace(/\r\n/g, "\n");
  if (!src.startsWith("---\n")) {
    return { name: null, description: null, body: src, errors: ["missing YAML frontmatter (file must start with ---)"] };
  }
  const end = src.indexOf("\n---", 4);
  if (end < 0) {
    return { name: null, description: null, body: src, errors: ["frontmatter is not closed with ---"] };
  }
  const fm = src.slice(4, end).split("\n");
  const body = src.slice(end + 4).replace(/^\n/, "");

  /** @type {Record<string,string>} */
  const kv = {};
  for (let i = 0; i < fm.length; i++) {
    const line = fm[i];
    if (!line.trim() || line.trimStart().startsWith("#")) continue;
    const m = /^([A-Za-z0-9_-]+):\s*(.*)$/.exec(line);
    if (!m) continue; // continuation of something we do not model (nested map etc.)
    const key = m[1];
    const rest = m[2];
    if (/^[>|][+-]?$/.test(rest.trim())) {
      const folded = rest.trim().startsWith(">");
      /** @type {string[]} */
      const block = [];
      while (i + 1 < fm.length && (fm[i + 1].startsWith(" ") || fm[i + 1].startsWith("\t") || fm[i + 1] === "")) {
        block.push(fm[++i].trim());
      }
      kv[key] = (folded ? block.join(" ") : block.join("\n")).trim();
    } else {
      kv[key] = unquote(rest);
    }
  }
  return { name: kv.name ?? null, description: kv.description ?? null, body, errors };
}

/**
 * Lint a skill directory. Returns human-readable problems (empty = clean).
 * @param {string} skillDir   directory containing SKILL.md
 * @returns {{ meta: SkillMeta|null, problems: string[] }}
 */
export function lintSkillDir(skillDir) {
  /** @type {string[]} */
  const problems = [];
  const text = readText(`${skillDir}/SKILL.md`);
  if (text === null) return { meta: null, problems: ["SKILL.md is missing"] };
  const meta = parseSkillMd(text);
  problems.push(...meta.errors);
  const folder = basename(skillDir);
  if (!meta.name) problems.push("frontmatter `name` is missing");
  else {
    if (meta.name !== folder) problems.push(`name "${meta.name}" must equal the folder name "${folder}"`);
    if (meta.name.length > NAME_MAX) problems.push(`name is ${meta.name.length} chars (max ${NAME_MAX})`);
    if (!NAME_RE.test(meta.name)) problems.push(`name "${meta.name}" must be lowercase letters, digits and single hyphens`);
  }
  if (!meta.description) problems.push("frontmatter `description` is missing");
  else if (meta.description.length > DESCRIPTION_MAX) {
    problems.push(`description is ${meta.description.length} chars (max ${DESCRIPTION_MAX})`);
  }
  return { meta, problems };
}
