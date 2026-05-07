/**
 * evals/runner/contamination-guard.ts — prevent and detect content-only
 * agent CWD escapes that would land commits or files on the parent
 * `magik-repo-plugin` repo.
 *
 * Why this exists
 * ---------------
 *
 * During the v0.7.0 baseline run, the `04-memory-doesnt-leak` content-
 * only sample (running with NO harness rules to bound it to the temp
 * fixture) wrote `lessons-captured.md` via an absolute path into
 * `/Users/<u>/Projects/magik-repo-plugin/`, then ran `git commit` whose
 * shell context picked up the parent repo's `.git`. A real commit
 * (42944ce) landed on `main` and was reverted manually.
 *
 * The earlier v0.6.0 fix that moved fixtures under `os.tmpdir()` closed
 * the *read-side* CWD escape (agents reading from the harnessed twin in
 * the plugin source tree). It did NOT close the *write-side* escape —
 * absolute-path writes go anywhere the agent process has filesystem
 * permission, and `git commit`'s ancestor walk for `.git` is unaffected
 * by the fixture's location.
 *
 * Two-layer fix in this module:
 *
 *   1. Prevention via env: set `GIT_CEILING_DIRECTORIES` to a path that
 *      contains the temp fixture but NOT the parent repo. Git's tree
 *      walk for `.git` stops at this boundary, so an agent that
 *      accidentally `cd`s above its temp fixture doesn't silently
 *      attach to the parent's `.git`. Does NOT block an agent that
 *      explicitly invokes `git -C /abs/path/to/parent ...` or
 *      `cd /abs/path/to/parent && git ...` — but raises the bar.
 *
 *   2. Detection via HEAD snapshot: take `git rev-parse HEAD` of the
 *      parent repo before each sample; verify post-sample. If HEAD
 *      changed, the agent committed to the parent — auto-revert with
 *      `git reset --hard <pre-snapshot>` and mark the sample as failed
 *      with a clear `agent-escape:` error.
 *
 * Cheap (~80 LOC) and catches the worst case (parent-repo commits)
 * deterministically. Does NOT catch all forms of escape — e.g., file
 * writes outside the temp dir that don't touch git remain possible. A
 * full fix requires sandbox-exec / bwrap / chroot-style isolation,
 * which is deferred to v0.8.x as a heavier hardening pass.
 *
 * Public surface:
 *   - snapshotParentRepo(parentRoot): take a pre-sample state snapshot
 *   - verifyAndRevert(snapshot): post-sample verification + auto-revert
 *   - withGitCeiling(boundary, fn): run `fn` with GIT_CEILING_DIRECTORIES
 */

import { execFileSync } from "node:child_process";
import { existsSync, statSync } from "node:fs";
import { join } from "node:path";

/**
 * Snapshot of the parent repo's state taken before a sample runs. The
 * post-sample `verifyAndRevert` compares against this to detect
 * contamination.
 *
 * `head` is the commit SHA (40 hex chars) at snapshot time. `null` means
 * the parent isn't a git repo (e.g., release zipball checkout) and the
 * guard is a no-op for this run.
 */
export interface ParentRepoSnapshot {
  /** Absolute path to the parent repo root. */
  root: string;
  /** True if `<root>/.git` exists at snapshot time. */
  isGitRepo: boolean;
  /** Commit SHA at snapshot time, or null when not a git repo. */
  head: string | null;
}

/**
 * Verdict produced by `verifyAndRevert`. `contaminated: true` means the
 * agent escaped CWD and committed to the parent repo; the runner should
 * mark this sample as failed and refuse to credit its result.
 */
export interface ContaminationVerdict {
  contaminated: boolean;
  preHead: string | null;
  postHead: string | null;
  reverted: boolean;
  /** Error message if revert failed; the operator must fix manually. */
  error?: string;
}

/** Take a pre-sample snapshot of the parent repo's state. */
export function snapshotParentRepo(parentRoot: string): ParentRepoSnapshot {
  const dotGit = join(parentRoot, ".git");
  const isGitRepo = existsSync(dotGit) && statSync(dotGit).isDirectory();
  if (!isGitRepo) {
    return { root: parentRoot, isGitRepo: false, head: null };
  }
  try {
    const head = execFileSync("git", ["rev-parse", "HEAD"], {
      cwd: parentRoot,
      encoding: "utf-8",
    }).trim();
    return { root: parentRoot, isGitRepo: true, head };
  } catch {
    return { root: parentRoot, isGitRepo: true, head: null };
  }
}

/**
 * Post-sample: read the parent's HEAD again and compare. If it changed,
 * the agent landed a commit; auto-revert with `git reset --hard`.
 *
 * The parent's working tree may also have new untracked files the agent
 * wrote at root level. Auto-revert covers tracked changes; the runner
 * caller is responsible for follow-up housekeeping if desired.
 */
export function verifyAndRevert(
  pre: ParentRepoSnapshot,
): ContaminationVerdict {
  if (!pre.isGitRepo || !pre.head) {
    return {
      contaminated: false,
      preHead: pre.head,
      postHead: null,
      reverted: false,
    };
  }
  let postHead: string | null = null;
  try {
    postHead = execFileSync("git", ["rev-parse", "HEAD"], {
      cwd: pre.root,
      encoding: "utf-8",
    }).trim();
  } catch (e) {
    return {
      contaminated: true,
      preHead: pre.head,
      postHead: null,
      reverted: false,
      error: `failed to read post-sample HEAD: ${(e as Error).message}`,
    };
  }
  if (postHead === pre.head) {
    return {
      contaminated: false,
      preHead: pre.head,
      postHead,
      reverted: false,
    };
  }
  // Contamination detected. Try to auto-revert.
  let reverted = false;
  let error: string | undefined;
  try {
    execFileSync("git", ["reset", "--hard", pre.head], {
      cwd: pre.root,
      encoding: "utf-8",
    });
    reverted = true;
  } catch (e) {
    error = `auto-revert failed: ${(e as Error).message}`;
  }
  return {
    contaminated: true,
    preHead: pre.head,
    postHead,
    reverted,
    error,
  };
}

/**
 * Run `fn` with `GIT_CEILING_DIRECTORIES=<boundary>` set on the current
 * process, restoring the prior value (or unset state) on exit. The
 * agent process inherits this env var via the SDK, which keeps git's
 * `.git` ancestor walk inside the temp boundary.
 *
 * Guards against accidental escape — does NOT prevent an agent that
 * explicitly invokes `git -C /abs/path/parent ...`.
 */
export async function withGitCeiling<T>(
  boundary: string,
  fn: () => Promise<T>,
): Promise<T> {
  const prev = process.env.GIT_CEILING_DIRECTORIES;
  process.env.GIT_CEILING_DIRECTORIES = boundary;
  try {
    return await fn();
  } finally {
    if (prev === undefined) delete process.env.GIT_CEILING_DIRECTORIES;
    else process.env.GIT_CEILING_DIRECTORIES = prev;
  }
}
