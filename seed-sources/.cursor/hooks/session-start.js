#!/usr/bin/env node
/**
 * session-start.js — magik-repo harness `sessionStart` hook.
 *
 * Cursor docs: https://cursor.com/docs/agent/hooks#sessionstart
 *
 * Reads JSON input from stdin (we do not need its contents), and writes JSON
 * to stdout with `additional_context` containing:
 *   1. today's `memory/daily/<YYYY-MM-DD>.md` (full body, if present).
 *   2. the Active section of `memory/commitments.md` (if present and non-empty).
 *   3. a one-line read-first reminder pointing at `kb-search`.
 *
 * Per Cursor's hook contract:
 *   - Project hooks run from the project root; `CURSOR_PROJECT_DIR` (and the
 *     Claude-compat alias `CLAUDE_PROJECT_DIR`) is always set.
 *   - sessionStart runs as fire-and-forget — the agent loop does not block on
 *     it, so a slow run will simply miss this session's injection rather than
 *     stall startup.
 *   - On any unexpected error we emit `{}` and exit 0 (fail-open) so a
 *     malformed memory file never blocks a session.
 */

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

function main() {
  // Drain stdin so Cursor's writer does not block. We do not use the input
  // (sessionStart payload is just session_id / is_background_agent /
  // composer_mode and none of it is relevant to memory injection).
  try {
    readFileSync(0);
  } catch {
    // stdin closed or unavailable — proceed anyway.
  }

  const projectRoot =
    process.env.CURSOR_PROJECT_DIR ||
    process.env.CLAUDE_PROJECT_DIR ||
    process.cwd();
  const today = new Date().toISOString().slice(0, 10);

  const sections = [];

  const dailyPath = join(projectRoot, "memory", "daily", `${today}.md`);
  if (existsSync(dailyPath)) {
    const body = readFileSync(dailyPath, "utf-8").trim();
    if (body.length > 0) {
      sections.push(
        `## memory/daily/${today}.md (today's running notes)\n\n${body}`,
      );
    }
  }

  const commitmentsPath = join(projectRoot, "memory", "commitments.md");
  if (existsSync(commitmentsPath)) {
    const active = extractActiveCommitments(
      readFileSync(commitmentsPath, "utf-8"),
    );
    if (active.length > 0) {
      sections.push(
        `## memory/commitments.md (active follow-ups)\n\n${active}`,
      );
    }
  }

  if (sections.length === 0) {
    process.stdout.write("{}");
    return;
  }

  sections.push(
    'Before substantive work, run `kb-search` over the task description (rules/harness.mdc "Read first" — non-negotiable).',
  );

  const additionalContext = sections.join("\n\n---\n\n");
  process.stdout.write(JSON.stringify({ additional_context: additionalContext }));
}

/**
 * Pull the body of the `## Active` section from commitments.md, stopping at
 * the next `## ` header. Drops blank lines and HTML-comment placeholders so
 * an empty section returns "" cleanly.
 */
function extractActiveCommitments(text) {
  const lines = text.split("\n");
  const out = [];
  let inActive = false;
  for (const line of lines) {
    if (line.trim() === "## Active") {
      inActive = true;
      continue;
    }
    if (inActive && /^## /.test(line)) break;
    if (inActive) out.push(line);
  }
  return out
    .filter((l) => !/^\s*<!--/.test(l))
    .join("\n")
    .trim();
}

try {
  main();
} catch (err) {
  // Fail-open. A bad daily note must never block session start.
  process.stderr.write(
    `magik-repo session-start hook: ${err && err.message ? err.message : err}\n`,
  );
  process.stdout.write("{}");
}
