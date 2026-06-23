/**
 * tests/session-start-hook.test.ts — coverage for the v1.0 session-start hook.
 *
 * The hook is seeded into a project's `.cursor/hooks/session-start.js`. It
 * reads `.cursor/harness.json`, resolves the external vault + memory mount,
 * and injects today's memory daily note (if present) plus a read-first
 * reminder. We test it by spawning the seed hook with `CURSOR_PROJECT_DIR`
 * pointed at a tmp project, and a separate tmp vault.
 *
 * Cursor docs: https://cursor.com/docs/agent/hooks#sessionstart
 */

import { spawnSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import assert from "node:assert/strict";

const TEST_DIR = dirname(fileURLToPath(import.meta.url));
const PLUGIN_ROOT = dirname(TEST_DIR);
const HOOK = join(PLUGIN_ROOT, "seeds", ".cursor", "hooks", "session-start.js");

function makeTmpProject(): string {
  return mkdtempSync(join(tmpdir(), "magik-repo-session-test-"));
}
function makeTmpVault(): string {
  return mkdtempSync(join(tmpdir(), "magik-repo-session-vault-"));
}

function writeManifest(
  root: string,
  manifest: Record<string, unknown>,
): void {
  mkdirSync(join(root, ".cursor"), { recursive: true });
  writeFileSync(join(root, ".cursor", "harness.json"), JSON.stringify(manifest, null, 2));
}

function pathManifest(vault: string): Record<string, unknown> {
  return {
    schema: "magik-repo/harness@1",
    vault,
    knowledge: { mount: "knowledge", accessVia: "path" },
    memory: { mount: "memory", accessVia: "path" },
  };
}

function runHook(projectRoot: string): {
  stdout: string;
  stderr: string;
  status: number;
} {
  const result = spawnSync("node", [HOOK], {
    encoding: "utf-8",
    cwd: PLUGIN_ROOT,
    env: { ...process.env, CURSOR_PROJECT_DIR: projectRoot },
    input: JSON.stringify({
      session_id: "test-session",
      is_background_agent: false,
      composer_mode: "agent",
    }),
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

test("session-start — no manifest: fail-open, reminder only, valid JSON", () => {
  ensureBuilt();
  const root = makeTmpProject();
  try {
    const { stdout, stderr, status } = runHook(root);
    assert.equal(status, 0, `exit status: ${status}; stderr: ${stderr}`);
    const parsed = JSON.parse(stdout) as { additional_context?: string };
    assert.ok(typeof parsed.additional_context === "string", "should still emit the reminder");
    assert.match(parsed.additional_context!, /kb-search/, "reminder must point at kb-search");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("session-start — manifest + today's daily note is injected as additional_context", () => {
  ensureBuilt();
  const root = makeTmpProject();
  const vault = makeTmpVault();
  try {
    writeManifest(root, pathManifest(vault));
    mkdirSync(join(vault, "memory", "daily"), { recursive: true });
    const dailyBody =
      "- [observation] middleware rewrite breaks on `/` paths\n" +
      "- [lesson] never `drizzle push` against prod\n";
    writeFileSync(join(vault, "memory", "daily", `${TODAY}.md`), dailyBody);

    const { stdout, status } = runHook(root);
    assert.equal(status, 0);

    const parsed = JSON.parse(stdout) as { additional_context: string };
    assert.ok(typeof parsed.additional_context === "string");
    assert.match(parsed.additional_context, /running notes/);
    assert.ok(
      parsed.additional_context.includes("middleware rewrite breaks on `/` paths"),
      "today's daily-note bullet must be present in the injection",
    );
    assert.ok(parsed.additional_context.includes("`drizzle push`"), "second bullet must be present");
    assert.match(parsed.additional_context, /kb-search/, "read-first reminder must be present");
  } finally {
    rmSync(root, { recursive: true, force: true });
    rmSync(vault, { recursive: true, force: true });
  }
});

test("session-start — manifest but no daily note: reminder only", () => {
  ensureBuilt();
  const root = makeTmpProject();
  const vault = makeTmpVault();
  try {
    writeManifest(root, pathManifest(vault));
    mkdirSync(join(vault, "memory"), { recursive: true });

    const { stdout, status } = runHook(root);
    assert.equal(status, 0);
    const parsed = JSON.parse(stdout) as { additional_context: string };
    assert.match(parsed.additional_context, /kb-search/);
    assert.ok(!parsed.additional_context.includes("running notes"), "no daily note to inject");
  } finally {
    rmSync(root, { recursive: true, force: true });
    rmSync(vault, { recursive: true, force: true });
  }
});

test("session-start — accessVia=mcp: no filesystem read, reminder only", () => {
  ensureBuilt();
  const root = makeTmpProject();
  const vault = makeTmpVault();
  try {
    // Even with a daily note present on disk, an mcp manifest must not read it.
    mkdirSync(join(vault, "memory", "daily"), { recursive: true });
    writeFileSync(join(vault, "memory", "daily", `${TODAY}.md`), "- secret local note\n");
    writeManifest(root, {
      schema: "magik-repo/harness@1",
      vault,
      knowledge: { mount: "kb", accessVia: "mcp" },
      memory: { mount: "mem", accessVia: "mcp" },
    });

    const { stdout, status } = runHook(root);
    assert.equal(status, 0);
    const parsed = JSON.parse(stdout) as { additional_context: string };
    assert.match(parsed.additional_context, /kb-search/);
    assert.ok(
      !parsed.additional_context.includes("secret local note"),
      "mcp access must not read the local filesystem",
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
    rmSync(vault, { recursive: true, force: true });
  }
});

test("session-start — malformed manifest: fail-open, still valid JSON", () => {
  ensureBuilt();
  const root = makeTmpProject();
  try {
    mkdirSync(join(root, ".cursor"), { recursive: true });
    writeFileSync(join(root, ".cursor", "harness.json"), "{ this is not json");

    const { stdout, status } = runHook(root);
    assert.equal(status, 0, "a broken manifest must not crash the hook");
    assert.doesNotThrow(() => JSON.parse(stdout), "stdout must remain valid JSON");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
