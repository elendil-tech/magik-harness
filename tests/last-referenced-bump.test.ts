/**
 * tests/last-referenced-bump.test.ts — coverage for the postToolUse hook
 * that maintains `last_referenced` on KB entries.
 *
 * The hook is seeded into a project's `.cursor/hooks/last-referenced-bump.js`,
 * so we test it by spawning `node seeds/.cursor/hooks/last-referenced-bump.js`
 * directly with a constructed JSON payload on stdin and `CURSOR_PROJECT_DIR`
 * pointing at a per-test tmp project.
 *
 * Cursor docs: https://cursor.com/docs/agent/hooks#posttooluse
 */

import { spawnSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import assert from "node:assert/strict";

const TEST_DIR = dirname(fileURLToPath(import.meta.url));
const PLUGIN_ROOT = dirname(TEST_DIR);
const HOOK = join(
  PLUGIN_ROOT,
  "seeds",
  ".cursor",
  "hooks",
  "last-referenced-bump.js",
);

function makeTmpProject(): string {
  return mkdtempSync(join(tmpdir(), "magik-repo-bump-test-"));
}

function runHook(
  projectRoot: string,
  payload: object,
): { stdout: string; stderr: string; status: number } {
  const result = spawnSync("node", [HOOK], {
    encoding: "utf-8",
    cwd: PLUGIN_ROOT,
    env: { ...process.env, CURSOR_PROJECT_DIR: projectRoot },
    input: JSON.stringify(payload),
  });
  return {
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? "",
    status: result.status ?? -1,
  };
}

function ensureBuilt(): void {
  if (!existsSync(HOOK)) {
    throw new Error(
      `seed hook missing — run \`pnpm build\` before the test suite (looked at ${HOOK}).`,
    );
  }
}

const TODAY = new Date().toISOString().slice(0, 10);

function daysAgo(n: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - n);
  return d.toISOString().slice(0, 10);
}

function writeKbEntry(
  root: string,
  domain: string,
  name: string,
  lastReferenced: string,
): string {
  const dir = join(root, "knowledge", domain);
  mkdirSync(dir, { recursive: true });
  const path = join(dir, `${name}.md`);
  const body =
    `---\n` +
    `schema: decision\n` +
    `id: ${name}\n` +
    `domain: ${domain}\n` +
    `status: active\n` +
    `created: 2026-04-01\n` +
    `updated: 2026-04-01\n` +
    `last_referenced: ${lastReferenced}\n` +
    `provenance: direct\n` +
    `trust: medium\n` +
    `quarantine: false\n` +
    `---\n\n` +
    `# ${name}\n\nBody.\n`;
  writeFileSync(path, body);
  return path;
}

test("last-referenced-bump — bumps a stale KB entry to today", () => {
  ensureBuilt();
  const root = makeTmpProject();
  try {
    const path = writeKbEntry(root, "engineering", "auth", daysAgo(30));

    const { status, stderr } = runHook(root, {
      tool_name: "Read",
      tool_input: { path },
      tool_output: "{}",
      cwd: root,
    });

    assert.equal(status, 0, `exit ${status}; stderr: ${stderr}`);
    const after = readFileSync(path, "utf-8");
    assert.match(
      after,
      new RegExp(`last_referenced:\\s*${TODAY}`),
      "last_referenced must be bumped to today",
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("last-referenced-bump — no-op when bumped within the 7-day throttle window", () => {
  ensureBuilt();
  const root = makeTmpProject();
  try {
    const recentDate = daysAgo(3);
    const path = writeKbEntry(root, "engineering", "auth", recentDate);
    const before = statSync(path).mtimeMs;

    const { status } = runHook(root, {
      tool_name: "Read",
      tool_input: { path },
      tool_output: "{}",
      cwd: root,
    });

    assert.equal(status, 0);
    const after = readFileSync(path, "utf-8");
    assert.match(
      after,
      new RegExp(`last_referenced:\\s*${recentDate}`),
      "last_referenced must NOT change within the throttle window",
    );
    // mtime unchanged is the strongest signal.
    assert.equal(
      statSync(path).mtimeMs,
      before,
      "file should not be rewritten when the throttle blocks the bump",
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("last-referenced-bump — files under knowledge/_meta/ are skipped", () => {
  ensureBuilt();
  const root = makeTmpProject();
  try {
    const dir = join(root, "knowledge", "_meta", "schemas");
    mkdirSync(dir, { recursive: true });
    const path = join(dir, "concept.md");
    const body =
      `---\n` +
      `schema: concept\n` +
      `last_referenced: ${daysAgo(60)}\n` +
      `---\n\n# Schema template — should not be bumped\n`;
    writeFileSync(path, body);
    const before = statSync(path).mtimeMs;

    const { status } = runHook(root, {
      tool_name: "Read",
      tool_input: { path },
      cwd: root,
    });

    assert.equal(status, 0);
    assert.equal(
      statSync(path).mtimeMs,
      before,
      "schema templates under _meta/ must never be touched",
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("last-referenced-bump — Reads outside knowledge/ are ignored", () => {
  ensureBuilt();
  const root = makeTmpProject();
  try {
    const dir = join(root, "memory", "daily");
    mkdirSync(dir, { recursive: true });
    const path = join(dir, "2026-04-15.md");
    writeFileSync(path, `---\nlast_referenced: ${daysAgo(60)}\n---\n\nBody.\n`);
    const before = statSync(path).mtimeMs;

    const { status } = runHook(root, {
      tool_name: "Read",
      tool_input: { path },
      cwd: root,
    });

    assert.equal(status, 0);
    assert.equal(
      statSync(path).mtimeMs,
      before,
      "memory/ files must never be bumped — only knowledge/<domain>/",
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("last-referenced-bump — non-Read tools are ignored even with a KB path", () => {
  ensureBuilt();
  const root = makeTmpProject();
  try {
    const path = writeKbEntry(root, "engineering", "auth", daysAgo(30));
    const before = statSync(path).mtimeMs;

    const { status } = runHook(root, {
      tool_name: "Write",
      tool_input: { path, contents: "ignored" },
      cwd: root,
    });

    assert.equal(status, 0);
    assert.equal(
      statSync(path).mtimeMs,
      before,
      "Write tool calls must be a no-op (we only bump on Read)",
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("last-referenced-bump — entries without a last_referenced field are skipped (not synthesized)", () => {
  ensureBuilt();
  const root = makeTmpProject();
  try {
    const dir = join(root, "knowledge", "engineering");
    mkdirSync(dir, { recursive: true });
    const path = join(dir, "legacy.md");
    const body = `---\nschema: decision\nid: legacy\ndomain: engineering\nstatus: active\ncreated: 2026-04-01\nupdated: 2026-04-01\n---\n\n# Legacy\n\nBody.\n`;
    writeFileSync(path, body);
    const before = statSync(path).mtimeMs;

    const { status } = runHook(root, {
      tool_name: "Read",
      tool_input: { path },
      cwd: root,
    });

    assert.equal(status, 0);
    assert.equal(
      statSync(path).mtimeMs,
      before,
      "legacy entries (pre-v0.3, no last_referenced field) must not be silently mutated",
    );
    const after = readFileSync(path, "utf-8");
    assert.equal(after, body, "file content must be byte-identical");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("last-referenced-bump — placeholder YYYY-MM-DD is treated as never-referenced and bumped", () => {
  ensureBuilt();
  const root = makeTmpProject();
  try {
    const path = writeKbEntry(root, "engineering", "fresh", "YYYY-MM-DD");

    const { status } = runHook(root, {
      tool_name: "Read",
      tool_input: { path },
      cwd: root,
    });

    assert.equal(status, 0);
    const after = readFileSync(path, "utf-8");
    assert.match(
      after,
      new RegExp(`last_referenced:\\s*${TODAY}`),
      "schema-placeholder YYYY-MM-DD should be replaced with today on first read",
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("last-referenced-bump — file body and other frontmatter fields are preserved verbatim", () => {
  ensureBuilt();
  const root = makeTmpProject();
  try {
    const path = writeKbEntry(root, "engineering", "auth", daysAgo(30));
    const before = readFileSync(path, "utf-8");

    runHook(root, {
      tool_name: "Read",
      tool_input: { path },
      cwd: root,
    });

    const after = readFileSync(path, "utf-8");
    // Same body content (everything past the closing fence).
    const beforeBody = before.split(/\r?\n---\r?\n/).slice(2).join("\n---\n");
    const afterBody = after.split(/\r?\n---\r?\n/).slice(2).join("\n---\n");
    assert.equal(afterBody, beforeBody, "body must be preserved verbatim");

    // Other frontmatter fields untouched.
    for (const field of [
      "schema: decision",
      "id: auth",
      "domain: engineering",
      "status: active",
      "created: 2026-04-01",
      "updated: 2026-04-01",
      "provenance: direct",
      "trust: medium",
      "quarantine: false",
    ]) {
      assert.ok(
        after.includes(field),
        `frontmatter field "${field}" must be preserved`,
      );
    }
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
