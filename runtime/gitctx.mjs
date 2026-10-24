// @ts-check
/**
 * gitctx.mjs — live git sync state for the session context (zero dependencies).
 *
 * Every probe is independent and time-boxed: a slow `git status` in a huge
 * repo degrades to "unknown" instead of dropping the whole block.
 */

import { execFileSync } from "node:child_process";

/**
 * @param {string} cwd
 * @param {string[]} args
 * @param {number} timeout
 * @returns {string|null}
 */
function git(cwd, args, timeout = 800) {
  try {
    return execFileSync("git", args, {
      cwd,
      encoding: "utf8",
      timeout,
      stdio: ["ignore", "pipe", "ignore"],
      windowsHide: true,
    }).trim();
  } catch {
    return null;
  }
}

/**
 * @typedef {Object} GitInfo
 * @property {string} branch
 * @property {number|null} dirtyCount      null when the probe timed out
 * @property {boolean} hasUpstream
 * @property {string|null} upstream
 * @property {number} ahead
 * @property {number} behind
 */

/**
 * @param {string} cwd
 * @returns {GitInfo|null}  null when `cwd` is not inside a git work tree
 */
export function gitSyncInfo(cwd) {
  if (git(cwd, ["rev-parse", "--is-inside-work-tree"], 500) !== "true") return null;

  const branch = git(cwd, ["symbolic-ref", "--short", "HEAD"], 500) ?? "(detached HEAD)";

  const status = git(cwd, ["status", "--porcelain"], 1500);
  const dirtyCount = status === null ? null : status ? status.split("\n").filter(Boolean).length : 0;

  const upstream = git(cwd, ["rev-parse", "--abbrev-ref", "@{u}"], 500);
  let ahead = 0;
  let behind = 0;
  if (upstream) {
    const ab = git(cwd, ["rev-list", "--left-right", "--count", "HEAD...@{u}"], 800);
    if (ab) {
      const [a, b] = ab.split(/\s+/).map(Number);
      ahead = Number.isFinite(a) ? a : 0;
      behind = Number.isFinite(b) ? b : 0;
    }
  }
  return { branch, dirtyCount, hasUpstream: Boolean(upstream), upstream, ahead, behind };
}

/**
 * @param {string} cwd
 * @param {{ isLinkedWorktree?: boolean, primaryRoot?: string }} [extra]
 * @returns {string|null}
 */
export function gitSyncContext(cwd, extra = {}) {
  const info = gitSyncInfo(cwd);
  if (!info) return null;

  let upstreamText = "no upstream configured";
  let pullNeeded = false;
  let pushNeeded = false;
  if (info.hasUpstream && info.upstream) {
    if (info.ahead === 0 && info.behind === 0) upstreamText = `synced with ${info.upstream}`;
    else if (info.behind === 0) {
      upstreamText = `${info.ahead} commit(s) ahead of ${info.upstream} (UNPUSHED)`;
      pushNeeded = true;
    } else if (info.ahead === 0) {
      upstreamText = `${info.behind} commit(s) behind ${info.upstream} (PULL NEEDED)`;
      pullNeeded = true;
    } else {
      upstreamText = `diverged (${info.ahead} ahead, ${info.behind} behind ${info.upstream})`;
      pullNeeded = true;
    }
  }

  const dirty = info.dirtyCount;
  const tree =
    dirty === null ? "working tree state unknown (git status timed out)" : dirty === 0 ? "clean" : `${dirty} uncommitted file(s)`;
  const detached = info.branch.startsWith("(");

  const lines = [
    "### Git sync state",
    `- Branch: \`${info.branch}\` (${tree})`,
    `- Upstream: ${upstreamText}`,
    `- Workspace: \`${cwd}\`${extra.isLinkedWorktree && extra.primaryRoot ? ` (linked worktree of \`${extra.primaryRoot}\`)` : ""}`,
    "",
    "Multi-machine protocol:",
    !info.hasUpstream && !detached
      ? `- UNPUBLISHED BRANCH: no upstream on origin. Publish it with \`git push -u origin ${info.branch}\` so other machines and worktrees can reach it.`
      : null,
    pullNeeded ? "- PULL REQUIRED: this checkout is behind origin. Run `git pull --ff-only` before modifying code." : null,
    pushNeeded ? "- PUSH REQUIRED: unpushed commits. Push to origin before pausing or switching machines." : null,
    dirty ? "- UNCOMMITTED CHANGES: checkpoint (WIP commit) before switching context." : null,
    "- Push commits to origin so other machines and worktrees stay in sync.",
    '- WIP checkpoints: `git commit -m "wip: <checkpoint> [skip ci]"` so intermediate commits do not trigger CI.',
    "- Do not use global `git stash` across worktrees (the stash stack is shared); use WIP commits instead.",
  ].filter((l) => l !== null);

  return lines.join("\n");
}
