// @ts-check
/**
 * tools/index.js — adapter registry and `--tools` parsing.
 */

import { UsageError } from "../lib/args.js";
import { claude } from "./claude.js";
import { codex } from "./codex.js";
import { cursor } from "./cursor.js";

/** `generic` is the base install (AGENTS.md + .agents/skills): always implied, no extras. */
/** @type {import("./common.js").ToolAdapter} */
export const generic = {
  id: "generic",
  label: "Any agent that reads AGENTS.md and Agent Skills",
  status: "documented",
  detect: () => false,
  artifacts(ctx) {
    /** @type {import("../lib/plan.js").Desired[]} */
    const desired = [];
    if (ctx.scope.kind === "global") {
      desired.push({
        type: "notice",
        level: "info",
        message: "generic: skills are in ~/.agents/skills. Add the primer to your tool's user-level instructions (`magik-harness primer` prints it).",
      });
    }
    return { desired };
  },
};

/** @type {Record<string, import("./common.js").ToolAdapter>} */
export const TOOLS = { cursor, claude, codex, generic };

/** Ids selectable with --tools, in display order. */
export const TOOL_IDS = ["cursor", "claude", "codex", "generic"];

/**
 * @param {import("../lib/scope.js").Scope} scope
 * @returns {string[]}
 */
export function detectTools(scope) {
  return [cursor, claude, codex].filter((t) => t.detect(scope)).map((t) => t.id);
}

/**
 * Resolve the `--tools` value.
 * @param {string[]} requested   empty = auto
 * @param {import("../lib/scope.js").Scope} scope
 * @returns {{ tools: string[], how: "explicit"|"detected"|"default" }}
 */
export function selectTools(requested, scope) {
  if (requested.length > 0) {
    if (requested.includes("none")) return { tools: [], how: "explicit" };
    const wanted = requested.includes("auto") ? detectTools(scope) : requested;
    for (const id of wanted) {
      if (!TOOL_IDS.includes(id)) throw new UsageError(`unknown tool "${id}" (choose from ${TOOL_IDS.join(", ")}, auto, none)`);
    }
    return { tools: [...new Set(wanted.filter((id) => id !== "generic"))], how: "explicit" };
  }
  const found = detectTools(scope);
  if (found.length > 0) return { tools: found, how: "detected" };
  return { tools: ["cursor"], how: "default" };
}
