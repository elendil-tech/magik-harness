// @ts-check
/**
 * codex.js — OpenAI Codex CLI. EXPERIMENTAL (documented behaviour, not run here).
 *
 * Codex reads AGENTS.md (project) and ~/.codex/AGENTS.md (user), and the open
 * `.agents/skills` convention, natively. It has no session-start hook, so the
 * primer carries the manual fallback (`node <runtime>/session-start.mjs`).
 */

import { join } from "node:path";

import { isDirectory } from "../lib/fsx.js";

/** @type {import("./common.js").ToolAdapter} */
export const codex = {
  id: "codex",
  label: "Codex CLI",
  status: "experimental",
  detect: (scope) => isDirectory(join(scope.root, ".codex")),
  artifacts(ctx) {
    const { scope } = ctx;
    /** @type {import("../lib/plan.js").Desired[]} */
    const desired = [];
    if (scope.kind === "global") {
      desired.push({
        type: "block",
        abs: join(scope.root, ".codex", "AGENTS.md"),
        id: "primer",
        style: "html",
        name: "magik-harness:primer",
        body: ctx.primerBody,
        position: "top",
      });
    } else {
      desired.push({
        type: "notice",
        level: "info",
        message: "codex: reads AGENTS.md and .agents/skills natively. It has no session hook; the primer tells the agent to run the session script by hand.",
      });
    }
    return { desired };
  },
};
