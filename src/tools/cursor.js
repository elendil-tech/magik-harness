// @ts-check
/**
 * cursor.js — Cursor IDE and `cursor-agent`.
 *
 * Verified against cursor-agent 2026.10.01 (2026-10-13), each with a canary the model could only know
 * from the channel under test:
 *   - AGENTS.md reaches the model
 *   - project `.agents/skills`, `.cursor/skills`, `.claude/skills`, `.codex/skills` all load
 *   - `~/.agents/skills` loads in every workspace
 *   - `.cursor/hooks.json` `sessionStart` -> `additional_context` (project scope, trusted workspace)
 *   - `~/.cursor/hooks.json` `sessionStart` -> `additional_context` (global scope)
 *
 * NOT honored: rule files in `~/.cursor/rules/`. A rule file with `alwaysApply: true` there, and the
 * one that already existed on the test machine, never reached the model. Cursor keeps user rules in
 * Settings, so a global install has no always-on primer file for Cursor. What reaches the agent
 * instead is the session hook (it names the loop skill and carries the vault, memory and git state)
 * and the skills; `magik-harness primer` prints the text to paste into Settings -> Rules.
 */

import { join } from "node:path";

import { isDirectory } from "../lib/fsx.js";

/** @type {import("./common.js").ToolAdapter} */
export const cursor = {
  id: "cursor",
  label: "Cursor (IDE and cursor-agent)",
  status: "verified",
  detect: (scope) => isDirectory(join(scope.root, ".cursor")),
  shared: () => [".cursor/hooks.json"],
  artifacts(ctx) {
    const { scope } = ctx;
    /** @type {import("../lib/plan.js").Desired[]} */
    const desired = [
      {
        type: "json",
        abs: join(scope.root, ".cursor", "hooks.json"),
        flavor: "cursor",
        command: scope.hookCommand("cursor"),
      },
    ];
    if (scope.kind === "global") {
      desired.push({
        type: "notice",
        level: "info",
        message:
          "cursor: Cursor reads user-level rules from Settings -> Rules, not from a file in your home directory, so there is no always-on primer file to install. The session hook and the skills work without one; to also have the primer always on, paste the output of `magik-harness primer --scope global` into Settings -> Rules.",
      });
    }
    return { desired };
  },
};
