/**
 * tests/init-harness.test.ts — basic coverage for the /init-harness hook.
 *
 *  1. Empty project   — full seed lays down expected files.
 *  2. Existing AGENTS — primer is prepended; pre-existing content survives verbatim below.
 *  3. Idempotency     — second run produces no changes for already-seeded files.
 *
 * Tests use only `node:test` and create tmp dirs in `os.tmpdir()`. They invoke
 * the hook by spawning `tsx hooks/init-harness.ts` so we exercise the real CLI
 * surface end-to-end.
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
const HOOK = join(PLUGIN_ROOT, "hooks", "init-harness.ts");
const TSX = join(PLUGIN_ROOT, "node_modules", ".bin", "tsx");
const SEEDS_DIR = join(PLUGIN_ROOT, "seeds");

function makeTmpProject(): string {
  return mkdtempSync(join(tmpdir(), "magik-repo-test-"));
}

function runHook(
  projectRoot: string,
  extraArgs: string[] = [],
): { stdout: string; stderr: string; status: number } {
  const args = [HOOK, "--project-root", projectRoot, ...extraArgs];
  const result = spawnSync(TSX, args, {
    encoding: "utf-8",
    cwd: PLUGIN_ROOT,
  });
  return {
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? "",
    status: result.status ?? -1,
  };
}

function ensureBuilt(): void {
  if (!existsSync(SEEDS_DIR)) {
    throw new Error(
      `seeds/ missing — run \`pnpm build\` before the test suite (looked at ${SEEDS_DIR}).`,
    );
  }
}

// --- Tests -------------------------------------------------------------------

test("empty project — full seed creates expected files", () => {
  ensureBuilt();
  const root = makeTmpProject();
  try {
    const { stdout, status } = runHook(root, ["--yes"]);
    assert.equal(status, 0, `hook failed: ${stdout}`);

    assert.ok(existsSync(join(root, "AGENTS.md")), "AGENTS.md missing");
    assert.ok(existsSync(join(root, ".gitignore")), ".gitignore missing");
    assert.ok(
      existsSync(join(root, "knowledge", "_index.md")),
      "knowledge/_index.md missing",
    );
    assert.ok(
      existsSync(join(root, "knowledge", "_meta", "domains.md")),
      "domains.md missing",
    );
    assert.ok(
      existsSync(join(root, "knowledge", "_meta", "schemas", "concept.md")),
      "schemas/concept.md missing",
    );
    assert.ok(
      existsSync(join(root, "workspace", ".gitkeep")),
      "workspace/.gitkeep missing",
    );
    assert.ok(
      existsSync(join(root, "codebase", "README.md")),
      "codebase/README.md missing",
    );

    const agents = readFileSync(join(root, "AGENTS.md"), "utf-8");
    assert.match(agents, /<!-- harness:primer:start v=0\.1\.0 -->/);
    assert.match(agents, /<!-- harness:primer:end -->/);

    const gi = readFileSync(join(root, ".gitignore"), "utf-8");
    assert.match(gi, /^# harness:gitignore:start v=0\.1\.0$/m);
    assert.match(gi, /^# harness:gitignore:end$/m);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("existing AGENTS.md — primer is prepended; user content preserved verbatim", () => {
  ensureBuilt();
  const root = makeTmpProject();
  try {
    const userBody =
      "# My Project\n\nLorem ipsum, do not touch this content.\n\n- bullet one\n- bullet two\n";
    writeFileSync(join(root, "AGENTS.md"), userBody);

    const { status, stdout } = runHook(root, ["--yes"]);
    assert.equal(status, 0, `hook failed: ${stdout}`);

    const merged = readFileSync(join(root, "AGENTS.md"), "utf-8");
    assert.ok(
      merged.startsWith("<!-- harness:primer:start v=0.1.0 -->"),
      "primer block should be at the top of AGENTS.md",
    );
    assert.ok(
      merged.includes("<!-- harness:primer:end -->"),
      "primer end marker missing",
    );
    assert.ok(
      merged.includes(userBody.trim()),
      "user-authored AGENTS.md content should be preserved verbatim",
    );
    const startIdx = merged.indexOf("<!-- harness:primer:end -->");
    const userIdx = merged.indexOf("# My Project");
    assert.ok(
      userIdx > startIdx,
      "user content must appear after the primer block",
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("idempotency — second run produces no changes to already-seeded files", () => {
  ensureBuilt();
  const root = makeTmpProject();
  try {
    let result = runHook(root, ["--yes"]);
    assert.equal(result.status, 0, `first run failed: ${result.stdout}`);

    const stamps: Record<string, number> = {};
    const probes = [
      "AGENTS.md",
      ".gitignore",
      "knowledge/_index.md",
      "knowledge/_meta/domains.md",
      "knowledge/_meta/schemas/concept.md",
      "workspace/README.md",
      "codebase/README.md",
    ];
    for (const p of probes) {
      stamps[p] = statSync(join(root, p)).mtimeMs;
    }

    // Second run.
    result = runHook(root, ["--yes"]);
    assert.equal(result.status, 0, `second run failed: ${result.stdout}`);

    for (const p of probes) {
      const after = statSync(join(root, p)).mtimeMs;
      assert.equal(
        after,
        stamps[p],
        `${p} should not be modified on a second run (idempotency)`,
      );
    }
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("dry run — does not write any files", () => {
  ensureBuilt();
  const root = makeTmpProject();
  try {
    const result = runHook(root, ["--dry-run", "--yes"]);
    assert.equal(result.status, 0, `dry-run failed: ${result.stdout}`);
    assert.ok(
      !existsSync(join(root, "AGENTS.md")),
      "AGENTS.md should not be created in --dry-run",
    );
    assert.ok(
      !existsSync(join(root, "knowledge")),
      "knowledge/ should not be created in --dry-run",
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
