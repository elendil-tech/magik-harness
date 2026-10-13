// @ts-check
/**
 * legacy.js — knowledge about magik-repo 1.x installs, used to migrate them
 * safely. A legacy file is only deleted when its content is byte-identical (LF
 * normalised) to a release we shipped; anything else is a local edit and stays.
 */

import { join } from "node:path";

import { exists, readText, sha256, toLf } from "./fsx.js";

/**
 * sha256 (LF-normalised, hex without prefix) of every `session-start.js` the
 * 1.x line ever shipped, from git history of `seed-sources/.cursor/hooks/session-start.js`.
 * @type {ReadonlyMap<string, string>}
 */
export const LEGACY_HOOK_HASHES = new Map([
  ["8ea6c0c24d7debc993216e1caa4e5896ac6067742191ff38fcce13153a634e5e", "0.4.0"],
  ["f8cde27e40f7defba84c5a7339da080ad94045008ec46072a2cec93426140416", "1.0.0"],
  ["f843d9d22d9d92041d74bd8167f1d4f84e93ff1a81f98bc879aa47f034c05793", "1.8.0"],
  ["fe0eb0e0529c7b730f56b349fd5fc9d26369a6b010adeb532d64b7867bcc8d7e", "1.8.x"],
]);

export const LEGACY_PRIMER_NAME = "harness:primer";
export const LEGACY_GITIGNORE_NAME = "harness:gitignore";

/**
 * Release a legacy hook script belongs to, or null when it has local edits.
 * @param {string|null} text
 * @returns {string|null}
 */
export function legacyHookRelease(text) {
  if (text === null) return null;
  const hex = sha256(toLf(text)).slice("sha256:".length);
  return LEGACY_HOOK_HASHES.get(hex) ?? null;
}

/**
 * @typedef {Object} LegacyState
 * @property {boolean} any
 * @property {string|null} pointerPath          `.cursor/harness.json` if present
 * @property {string|null} overlayPath          `.cursor/harness.local.json` if present
 * @property {string|null} hookPath             `.cursor/hooks/session-start.js` if present
 * @property {string|null} hookRelease          release it matches, or null if modified
 * @property {boolean} hookRegistered           `.cursor/hooks.json` still names it
 */

/**
 * @param {string} projectRoot
 * @returns {LegacyState}
 */
export function detectLegacy(projectRoot) {
  const pointer = join(projectRoot, ".cursor", "harness.json");
  const overlay = join(projectRoot, ".cursor", "harness.local.json");
  const hook = join(projectRoot, ".cursor", "hooks", "session-start.js");
  const hooksJson = readText(join(projectRoot, ".cursor", "hooks.json")) ?? "";
  const hookText = exists(hook) ? readText(hook) : null;
  const state = {
    any: false,
    pointerPath: exists(pointer) ? pointer : null,
    overlayPath: exists(overlay) ? overlay : null,
    hookPath: exists(hook) ? hook : null,
    hookRelease: legacyHookRelease(hookText),
    hookRegistered: /\.cursor\/hooks\/session-start\.js/.test(hooksJson.replace(/\\\\/g, "/")),
  };
  state.any = Boolean(state.pointerPath || state.overlayPath || state.hookPath || state.hookRegistered);
  return state;
}
