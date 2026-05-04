#!/usr/bin/env node
/**
 * last-referenced-bump.js — magik-repo harness `postToolUse` hook
 * (matcher: `Read`).
 *
 * Cursor docs: https://cursor.com/docs/agent/hooks#posttooluse
 *
 * On every successful Read, if the read file is a KB entry under
 * `knowledge/<domain>/` (excluding `knowledge/_meta/`), update its
 * `last_referenced` frontmatter field to today's date — but only when the
 * existing value is at least 7 days old. The field itself is the throttle,
 * so no separate cache is required.
 *
 * No-op for:
 *   - Read calls outside `knowledge/`
 *   - Files under `knowledge/_meta/` (schemas, registry, glossary)
 *   - Files without YAML frontmatter
 *   - Files whose frontmatter has no `last_referenced` field (we do not
 *     synthesize the field — `harness-audit` will surface entries missing
 *     v0.3 fields and the user adds them on next edit)
 *   - Entries where `last_referenced` is within 7 days of today
 *   - Entries where `last_referenced` is in the future (clock-skew safe)
 *
 * Failures are silent (fail-open). The Read tool already succeeded; this is
 * a side-effect, never a blocker.
 */

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { isAbsolute, join, relative } from "node:path";

const THROTTLE_DAYS = 7;

function main() {
  let raw;
  try {
    raw = readFileSync(0, "utf-8");
  } catch {
    return;
  }
  if (!raw.trim()) return;

  let payload;
  try {
    payload = JSON.parse(raw);
  } catch {
    return;
  }

  if (payload.tool_name !== "Read") return;
  const path = payload?.tool_input?.path;
  if (typeof path !== "string" || !path.endsWith(".md")) return;

  const projectRoot =
    process.env.CURSOR_PROJECT_DIR ||
    process.env.CLAUDE_PROJECT_DIR ||
    payload.cwd ||
    process.cwd();

  const abs = isAbsolute(path) ? path : join(projectRoot, path);
  const rel = relative(projectRoot, abs).split("\\").join("/");

  if (!rel.startsWith("knowledge/")) return;
  if (rel.startsWith("knowledge/_meta/")) return;
  if (!existsSync(abs)) return;

  const today = new Date().toISOString().slice(0, 10);
  const content = readFileSync(abs, "utf-8");
  const updated = bumpFrontmatter(content, today);
  if (updated === null) return;
  writeFileSync(abs, updated);
}

/**
 * Returns the file content with `last_referenced` updated to `today`, or
 * null when no update is needed.
 */
function bumpFrontmatter(content, today) {
  if (!/^---\r?\n/.test(content)) return null;

  const fenceMatch = content.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n/);
  if (!fenceMatch) return null;
  const frontmatter = fenceMatch[1];

  const lineRe = /^(last_referenced:[ \t]*)(\S+)([ \t].*)?$/m;
  const lineMatch = frontmatter.match(lineRe);
  if (!lineMatch) return null;

  const existingDate = lineMatch[2];
  const isPlaceholder = existingDate === "YYYY-MM-DD";

  if (!isPlaceholder) {
    const days = daysBetween(existingDate, today);
    if (days === null) return null;
    if (days < THROTTLE_DAYS) return null;
  }

  const trailing = lineMatch[3] ?? "";
  const newFrontmatter = frontmatter.replace(
    lineRe,
    `${lineMatch[1]}${today}${trailing}`,
  );
  if (newFrontmatter === frontmatter) return null;

  return content.replace(fenceMatch[0], `---\n${newFrontmatter}\n---\n`);
}

function daysBetween(fromIsoDate, toIsoDate) {
  const from = parseIsoDate(fromIsoDate);
  const to = parseIsoDate(toIsoDate);
  if (from === null || to === null) return null;
  return Math.floor((to - from) / (1000 * 60 * 60 * 24));
}

function parseIsoDate(s) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  const [y, m, d] = s.split("-").map(Number);
  const t = Date.UTC(y, m - 1, d);
  if (Number.isNaN(t)) return null;
  return t;
}

try {
  main();
} catch (err) {
  process.stderr.write(
    `magik-repo last-referenced-bump hook: ${err && err.message ? err.message : err}\n`,
  );
}
