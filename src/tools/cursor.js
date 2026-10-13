// @ts-check
/**
 * cursor.js — Cursor IDE and `cursor-agent`.
 *
 * Verified against cursor-agent (2026-10-13):
 *   - AGENTS.md reaches the model
 *   - project `.agents/skills`, `.cursor/skills`, `.claude/skills`, `.codex/skills` all load
 *   - `.cursor/hooks.json` `sessionStart` -> `additional_context` (project scope, trusted workspace)
 * Observed, undocumented: `~/.cursor/rules/*.mdc` (global primer).
 */

import { join } from "node:path";

import { isDirectory } from "../lib/fsx.js";

/** @param {string} primerBody */
function userRule(primerBody) {
  return [
    "---",
    "description: magik-harness primer (managed by `magik-harness`; change it with `magik-harness upgrade`, not by hand)",
    "alwaysApply: true",
    "---",
    "",
    primerBody,
    "",
  ].join("\n");
}

/** @type {import("./common.js").ToolAdapter} */
export const cursor = {
  id: "cursor",
  label: "Cursor (IDE and cursor-agent)",
  status: "verified",
  detect: (scope) => isDirectory(join(scope.root, ".cursor")),
  artifacts(ctx) {
    const { scope } = ctx;
    /** @type {import("../lib/plan.js").Desired[]} */
    const desired = [
      {
        type: "json",
        abs: join(scope.root, ".cursor", "hooks.json"),
        flavor: "cursor",
        command: scope.hookCommand("cursor"),
        dropLegacy: scope.kind === "project" && ctx.dropLegacyHook,
      },
    ];
    if (scope.kind === "global") {
      const abs = join(scope.root, ".cursor", "rules", "magik-harness.mdc");
      desired.push({ type: "file", abs, key: scope.key(abs), content: userRule(ctx.primerBody), group: "cursor-user-rule" });
    }
    return { desired };
  },
};
