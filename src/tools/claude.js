// @ts-check
/**
 * claude.js — Claude Code. EXPERIMENTAL: implemented from the documented hook
 * and memory-file formats and covered by file-level tests; not run against the
 * live tool in this repo's CI.
 *
 *   hooks:   .claude/settings.json  hooks.SessionStart[].hooks[]  (stdout JSON hookSpecificOutput.additionalContext)
 *   memory:  CLAUDE.md, which can import AGENTS.md with `@AGENTS.md`
 *   skills:  .claude/skills/<name>/  (Claude Code does not read .agents/skills)
 */

import { join } from "node:path";

import { isDirectory, isFile } from "../lib/fsx.js";
import { skillFilesAt } from "./common.js";

/** @type {import("./common.js").ToolAdapter} */
export const claude = {
  id: "claude",
  label: "Claude Code",
  status: "experimental",
  detect: (scope) => isDirectory(join(scope.root, ".claude")) || (scope.kind === "project" && isFile(join(scope.root, "CLAUDE.md"))),
  shared: () => [".claude/settings.json"],
  artifacts(ctx) {
    const { scope } = ctx;
    /** @type {import("../lib/plan.js").Desired[]} */
    const desired = [
      {
        type: "json",
        abs: join(scope.root, ".claude", "settings.json"),
        flavor: "claude",
        command: scope.hookCommand("claude"),
        dropLegacy: false,
      },
    ];

    if (scope.kind === "project") {
      desired.push({
        type: "block",
        abs: join(scope.root, "CLAUDE.md"),
        id: "claude-import",
        style: "html",
        name: "magik-harness:claude-import",
        body: "@AGENTS.md",
        position: "top",
      });
    } else {
      desired.push({
        type: "block",
        abs: join(scope.root, ".claude", "CLAUDE.md"),
        id: "primer",
        style: "html",
        name: "magik-harness:primer",
        body: ctx.primerBody,
        position: "top",
      });
    }

    desired.push(...skillFilesAt(ctx.skills, join(scope.root, ".claude", "skills"), scope));
    return { desired };
  },
};
