/**
 * tests/session-start-hook.test.ts — coverage for the session-start hook.
 *
 * The hook is seeded into a project's `.cursor/hooks/session-start.js`, so we
 * test it by spawning `node seeds/.cursor/hooks/session-start.js` directly,
 * with `CURSOR_PROJECT_DIR` set to a tmp project we construct per-test.
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

test("session-start — empty memory/ emits {} (no context to inject)", () => {
  ensureBuilt();
  const root = makeTmpProject();
  try {
    const { stdout, stderr, status } = runHook(root);
    assert.equal(status, 0, `exit status: ${status}; stderr: ${stderr}`);
    assert.equal(stderr, "", "stderr should be empty");
    assert.equal(
      stdout.trim(),
      "{}",
      `expected empty object, got: ${stdout}`,
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("session-start — today's daily note is injected as additional_context", () => {
  ensureBuilt();
  const root = makeTmpProject();
  try {
    mkdirSync(join(root, "memory", "daily"), { recursive: true });
    const dailyBody =
      "- [observation] [engineering] middleware rewrite breaks on `/` paths\n" +
      "- [lesson-candidate] [engineering] never `drizzle push` against prod\n";
    writeFileSync(join(root, "memory", "daily", `${TODAY}.md`), dailyBody);

    const { stdout, status } = runHook(root);
    assert.equal(status, 0);

    const parsed = JSON.parse(stdout) as { additional_context: string };
    assert.ok(
      typeof parsed.additional_context === "string",
      "additional_context must be a string",
    );
    assert.match(parsed.additional_context, /running notes/);
    assert.ok(
      parsed.additional_context.includes(
        "middleware rewrite breaks on `/` paths",
      ),
      "today's daily-note bullet must be present in the injection",
    );
    assert.ok(
      parsed.additional_context.includes("`drizzle push`"),
      "second bullet must be present",
    );
    assert.match(
      parsed.additional_context,
      /kb-search/,
      "read-first reminder must point at kb-search",
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("session-start — only the Active commitments section is extracted; Resolved is dropped", () => {
  ensureBuilt();
  const root = makeTmpProject();
  try {
    mkdirSync(join(root, "memory"), { recursive: true });
    const commitmentsBody =
      "# Commitments\n\n" +
      "## Active\n\n" +
      "- [ ] 2026-05-15 · engineering · review auth refactor PR · scope: src/auth\n\n" +
      "## Resolved (last 14 days)\n\n" +
      "- [x] 2026-04-30 · marketing · launch copy (resolved — should NOT appear)\n";
    writeFileSync(join(root, "memory", "commitments.md"), commitmentsBody);

    const { stdout, status } = runHook(root);
    assert.equal(status, 0);

    const parsed = JSON.parse(stdout) as { additional_context: string };
    assert.ok(
      parsed.additional_context.includes(
        "review auth refactor PR",
      ),
      "active commitment must be present",
    );
    assert.ok(
      !parsed.additional_context.includes("should NOT appear"),
      "resolved commitments must NOT be injected",
    );
    assert.ok(
      !parsed.additional_context.includes("## Resolved"),
      "Resolved header must NOT be injected",
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("session-start — daily + commitments combined; output is valid JSON", () => {
  ensureBuilt();
  const root = makeTmpProject();
  try {
    mkdirSync(join(root, "memory", "daily"), { recursive: true });
    writeFileSync(
      join(root, "memory", "daily", `${TODAY}.md`),
      "- [observation] [engineering] precious signal\n",
    );
    writeFileSync(
      join(root, "memory", "commitments.md"),
      "# Commitments\n\n## Active\n\n- [ ] 2026-05-15 · engineering · ship the thing\n",
    );

    const { stdout, status } = runHook(root);
    assert.equal(status, 0);

    let parsed: { additional_context?: string };
    assert.doesNotThrow(() => {
      parsed = JSON.parse(stdout) as { additional_context: string };
    }, "stdout must be valid JSON");
    parsed = JSON.parse(stdout) as { additional_context: string };
    assert.ok(parsed.additional_context!.includes("precious signal"));
    assert.ok(parsed.additional_context!.includes("ship the thing"));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("session-start — empty Active section + no daily note still emits {}", () => {
  ensureBuilt();
  const root = makeTmpProject();
  try {
    mkdirSync(join(root, "memory"), { recursive: true });
    writeFileSync(
      join(root, "memory", "commitments.md"),
      "# Commitments\n\n## Active\n\n<!-- one bullet per active commitment -->\n\n## Resolved (last 14 days)\n\n",
    );

    const { stdout, status } = runHook(root);
    assert.equal(status, 0);
    assert.equal(stdout.trim(), "{}");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
