#!/usr/bin/env node
/**
 * session-start.js — magik-repo harness `sessionStart` hook (v1.0).
 *
 * Cursor docs: https://cursor.com/docs/agent/hooks#sessionstart
 *
 * Knowledge and memory live in an EXTERNAL vault, resolved through this repo's
 * `.cursor/harness.json` pointer. This hook reads that manifest, resolves the
 * memory mount under the vault, and injects:
 *   1. today's `<memory-mount>/daily/<YYYY-MM-DD>.md` (full body, if present).
 *   2. live git sync state (branch, clean/dirty, ahead/behind upstream) when in a git repo.
 *   3. a one-line read-first reminder pointing at the KB / `kb-search`.
 *
 * Contract:
 *   - Project hooks run from the project root; `CURSOR_PROJECT_DIR` (and the
 *     Claude-compat alias `CLAUDE_PROJECT_DIR`) is set.
 *   - sessionStart is fire-and-forget; a slow/failed run just misses this
 *     session's injection rather than blocking startup.
 *   - On any error, or when the manifest is absent / uses `accessVia: mcp`,
 *     we emit just the reminder (or `{}`) and exit 0 (fail-open).
 */

import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { isAbsolute, join } from "node:path";

function expandTilde(p) {
  if (p === "~") return homedir();
  if (p.startsWith("~/")) return join(homedir(), p.slice(2));
  return p;
}

function resolveMemoryDir(projectRoot) {
  const manifestPath = join(projectRoot, ".cursor", "harness.json");
  if (!existsSync(manifestPath)) return null;
  let manifest;
  try {
    manifest = JSON.parse(readFileSync(manifestPath, "utf-8"));
  } catch {
    return null;
  }
  const mem = manifest.memory;
  if (!mem || mem.accessVia !== "path") return null; // mcp / unknown → no fs read
  const vault = manifest.vault;
  if (!vault || typeof vault !== "string") return null;
  const root = expandTilde(vault);
  const base = isAbsolute(root) ? root : join(projectRoot, root);
  if (!mem.mount || typeof mem.mount !== "string") return null;
  return join(base, mem.mount);
}

function getGitSyncContext(cwd) {
  try {
    const isGit = execFileSync("git", ["rev-parse", "--is-inside-work-tree"], {
      cwd,
      encoding: "utf-8",
      timeout: 500,
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
    if (isGit !== "true") return null;
  } catch {
    return null;
  }

  try {
    let branch = "HEAD";
    try {
      branch = execFileSync("git", ["symbolic-ref", "--short", "HEAD"], {
        cwd,
        encoding: "utf-8",
        timeout: 500,
        stdio: ["ignore", "pipe", "ignore"],
      }).trim();
    } catch {
      try {
        branch = execFileSync("git", ["rev-parse", "--abbrev-ref", "HEAD"], {
          cwd,
          encoding: "utf-8",
          timeout: 500,
          stdio: ["ignore", "pipe", "ignore"],
        }).trim();
      } catch {
        branch = "detached";
      }
    }

    const statusOut = execFileSync("git", ["status", "--porcelain"], {
      cwd,
      encoding: "utf-8",
      timeout: 800,
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
    const dirtyCount = statusOut ? statusOut.split("\n").filter(Boolean).length : 0;

    let upstreamInfo = "no upstream configured";
    let pullNeeded = false;
    let pushNeeded = false;
    let hasUpstream = false;

    try {
      const upstream = execFileSync(
        "git",
        ["rev-parse", "--abbrev-ref", "@{u}"],
        {
          cwd,
          encoding: "utf-8",
          timeout: 500,
          stdio: ["ignore", "pipe", "ignore"],
        },
      ).trim();
      hasUpstream = true;

      const ab = execFileSync(
        "git",
        ["rev-list", "--left-right", "--count", "HEAD...@{u}"],
        {
          cwd,
          encoding: "utf-8",
          timeout: 800,
          stdio: ["ignore", "pipe", "ignore"],
        },
      ).trim();
      const [ahead, behind] = ab.split(/\s+/).map(Number);
      if (ahead === 0 && behind === 0) {
        upstreamInfo = "synced with " + upstream;
      } else if (ahead > 0 && behind === 0) {
        upstreamInfo = `${ahead} commit(s) ahead of ${upstream} (UNPUSHED)`;
        pushNeeded = true;
      } else if (ahead === 0 && behind > 0) {
        upstreamInfo = `${behind} commit(s) behind ${upstream} (PULL NEEDED)`;
        pullNeeded = true;
      } else {
        upstreamInfo = `diverged (${ahead} ahead, ${behind} behind ${upstream})`;
        pullNeeded = true;
      }
    } catch {
      /* no upstream or detached */
    }

    const lines = [
      "### 🌐 Git Multi-Machine Sync State",
      `- **Branch**: \`${branch}\` (${dirtyCount === 0 ? "clean" : dirtyCount + " uncommitted file(s)"})`,
      `- **Upstream**: ${upstreamInfo}`,
      `- **Workspace**: \`${cwd}\``,
      "",
      "**Multi-Machine Protocol Guidance**:",
      !hasUpstream && branch !== "HEAD"
        ? `⚠️ **UNPUBLISHED BRANCH**: This branch has no upstream on origin. Push it (\`git push -u origin ${branch}\`) to publish it so other machines and worktrees can access it.`
        : null,
      pullNeeded
        ? "⚠️ **PULL REQUIRED**: This worktree is behind origin. Run `git pull --ff-only` before modifying code."
        : null,
      pushNeeded
        ? "🚀 **PUSH REQUIRED**: Unpushed commits detected. Remember to push to origin before pausing or switching machines."
        : null,
      dirtyCount > 0
        ? "⚠️ **UNCOMMITTED CHANGES**: Remember to checkpoint/commit your work before context-switching."
        : null,
      "- Always push commits to origin so other machines/worktrees stay in sync.",
      '- Do not use global `git stash` across worktrees; use WIP commits (`git commit -m "wip: ..."`) instead.',
    ].filter(Boolean);

    return lines.join("\n");
  } catch {
    return null;
  }
}

function main() {
  // Drain stdin so Cursor's writer does not block; we don't use the payload.
  try {
    readFileSync(0);
  } catch {
    /* stdin closed/unavailable — proceed */
  }

  const projectRoot =
    process.env.CURSOR_PROJECT_DIR ||
    process.env.CLAUDE_PROJECT_DIR ||
    process.cwd();
  const today = new Date().toISOString().slice(0, 10);

  const sections = [];

  const memoryDir = resolveMemoryDir(projectRoot);
  if (memoryDir) {
    const dailyPath = join(memoryDir, "daily", `${today}.md`);
    if (existsSync(dailyPath)) {
      const body = readFileSync(dailyPath, "utf-8").trim();
      if (body.length > 0) {
        sections.push(
          `## memory/daily/${today}.md (today's running notes)\n\n${body}`,
        );
      }
    }
  }

  const gitContext = getGitSyncContext(projectRoot);
  if (gitContext) {
    sections.push(gitContext);
  }

  sections.push(
    "Before substantive work, search the knowledge base (rules/harness.mdc " +
      '"Read the KB before substantive work" — the kb-search skill). The KB ' +
      "is the project's ground truth, resolved via .cursor/harness.json.",
  );

  process.stdout.write(
    JSON.stringify({ additional_context: sections.join("\n\n---\n\n") }),
  );
}

try {
  main();
} catch (err) {
  process.stderr.write(
    `magik-repo session-start hook: ${err && err.message ? err.message : err}\n`,
  );
  process.stdout.write("{}");
}
