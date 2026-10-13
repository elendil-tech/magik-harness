// @ts-check
/**
 * common.js — pieces shared by the tool adapters.
 */

import { join } from "node:path";

import { readSkillFile } from "../lib/catalog.js";

/**
 * @typedef {Object} ToolContext
 * @property {import("../lib/scope.js").Scope} scope
 * @property {string} primerBody                 rendered primer for this scope/profile
 * @property {import("../lib/catalog.js").Skill[]} skills   skills selected for this install
 * @property {boolean} dropLegacyHook            project scope: also remove the 1.x hook registration
 */

/**
 * @typedef {Object} ToolArtifacts
 * @property {import("../lib/plan.js").Desired[]} desired
 */

/**
 * @typedef {Object} ToolAdapter
 * @property {string} id
 * @property {string} label
 * @property {"verified"|"documented"|"experimental"} status
 * @property {(scope: import("../lib/scope.js").Scope) => boolean} detect
 * @property {(scope: import("../lib/scope.js").Scope) => string[]} [shared]
 *           repo-relative files a PROJECT install must be able to commit for clones and worktrees to get this
 *           tool's wiring (its hook registration). If git ignores one, `install` skips the adapter when it was
 *           only auto-detected, and warns when it was asked for by name.
 * @property {(ctx: ToolContext) => ToolArtifacts} artifacts
 */

/**
 * Desired files for a set of skills copied under `destRoot`.
 * @param {import("../lib/catalog.js").Skill[]} skills
 * @param {string} destRoot  absolute directory that will contain `<skill>/...`
 * @param {import("../lib/scope.js").Scope} scope
 * @returns {import("../lib/plan.js").DesiredFile[]}
 */
export function skillFilesAt(skills, destRoot, scope) {
  /** @type {import("../lib/plan.js").DesiredFile[]} */
  const out = [];
  for (const skill of skills) {
    for (const f of skill.files) {
      const abs = join(destRoot, skill.name, ...f.rel.split("/"));
      out.push({ type: "file", abs, key: scope.key(abs), content: readSkillFile(f), executable: f.executable, group: skill.name });
    }
  }
  return out;
}
