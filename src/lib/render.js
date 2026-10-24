// @ts-check
/**
 * render.js — turns the files under `content/` into the text written to
 * disk: the primer block, the gitignore block, the pointer and config
 * templates, the vault's first `_index.md`.
 */

import { join } from "node:path";

import { readText } from "./fsx.js";
import { PKG_ROOT } from "../version.js";

/**
 * @param {string} name file under content/
 * @returns {string}
 */
export function loadContent(name) {
  const text = readText(join(PKG_ROOT, "content", name));
  if (text === null) throw new Error(`content/${name} is missing from the package`);
  return text.replace(/\r\n/g, "\n");
}

/**
 * Replace `{{KEY}}` tokens. Unknown tokens are an error: a literal `{{X}}`
 * must never reach a user's AGENTS.md.
 * @param {string} template
 * @param {Record<string,string>} vars
 */
export function renderTemplate(template, vars) {
  const out = template.replace(/\{\{([A-Z_]+)\}\}/g, (m, key) => (key in vars ? vars[key] : m));
  const left = out.match(/\{\{[A-Z_]+\}\}/);
  if (left) throw new Error(`unreplaced template token ${left[0]}`);
  return out;
}

/**
 * @param {import("./scope.js").Scope} scope
 * @param {string} [pointerLabel]
 * @returns {Record<string,string>}
 */
export function templateVars(scope, pointerLabel) {
  return {
    POINTER: pointerLabel ?? scope.pointerDisplay,
    RUNTIME: scope.runtimeDisplay,
    SKILLS_DIR: scope.skillsDisplay,
    HARNESS_DIR: scope.kind === "project" ? ".magik" : scope.display(scope.harnessDir),
  };
}

/**
 * Primer body for a profile.
 * @param {string} primerFile  e.g. "primer.knowledge.md"
 * @param {import("./scope.js").Scope} scope
 */
export function renderPrimer(primerFile, scope) {
  const pointer =
    scope.kind === "project"
      ? "`.magik/harness.json`"
      : "`.magik/harness.json` in the project when it has one, otherwise the convention in `~/.magik/config.json`";
  return renderTemplate(loadContent(primerFile), templateVars(scope, pointer)).replace(/\s+$/g, "");
}

/**
 * Body of the managed .gitignore block.
 * @param {{ cursor: boolean }} o
 */
export function gitignoreBody(o) {
  const lines = [
    "# Per-machine vault overlay and installer backups (magik-harness).",
    ".magik/harness.local.json",
    ".magik/backups/",
  ];
  if (o.cursor) {
    lines.push(
      "# Per-developer / per-machine files under .cursor/ must never carry credentials.",
      ".cursor/mcp.local.json",
      ".cursor/**/*.local.*",
      ".cursor/**/*.private.*",
      ".cursor/**/secrets*",
    );
  }
  return lines.join("\n");
}

/**
 * Pointer file (`.magik/harness.json`).
 * @param {{ vault: string|null, knowledgeMount: string, memoryMount: string, accessVia: "path"|"mcp", autonomy: "open"|"ask"|"readonly" }} o
 * @returns {string}
 */
export function pointerJson(o) {
  const doc = {
    schema: "magik-harness/harness@2",
    _doc: "Vault pointer. Tracked, so every worktree and clone resolves the same vault. Per-machine overrides go in .magik/harness.local.json (gitignored). Secrets never go here. Spec: docs/ARCHITECTURE.md in magik-harness.",
    vault: o.vault,
    knowledge: { mount: o.knowledgeMount, accessVia: o.accessVia, autonomy: o.autonomy },
    memory: { mount: o.memoryMount, accessVia: o.accessVia },
  };
  return JSON.stringify(doc, null, 2) + "\n";
}

/**
 * Global config (`~/.magik/config.json`).
 * @param {{ vault: string|null, autonomy: "open"|"ask"|"readonly", git: "always"|"harnessed"|"never" }} o
 */
export function globalConfigJson(o) {
  const doc = {
    schema: "magik-harness/config@1",
    _doc: "Machine-level defaults. With layout per-project, a repo's stores are <vault>/<repo>/knowledge and <vault>/<repo>/memory; a project's own .magik/harness.json wins. Spec: docs/ARCHITECTURE.md in magik-harness.",
    vault: o.vault,
    layout: "per-project",
    knowledge: { autonomy: o.autonomy },
    memory: { inject: { maxBytes: 4000 } },
    git: o.git,
  };
  return JSON.stringify(doc, null, 2) + "\n";
}

/**
 * First `_index.md` for a new knowledge base.
 * @param {string} pointerLabel
 * @param {string} today  YYYY-MM-DD
 */
export function vaultIndex(pointerLabel, today) {
  return renderTemplate(loadContent("vault-index.md"), { POINTER: pointerLabel, TODAY: today });
}
