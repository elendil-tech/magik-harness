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
      existsSync(join(root, "memory", "_index.md")),
      "memory/_index.md missing",
    );
    assert.ok(
      existsSync(join(root, "memory", "commitments.md")),
      "memory/commitments.md missing",
    );
    assert.ok(
      existsSync(join(root, "memory", "daily", ".gitkeep")),
      "memory/daily/.gitkeep missing",
    );
    assert.ok(
      existsSync(join(root, "memory", "distillations", ".gitkeep")),
      "memory/distillations/.gitkeep missing",
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
    assert.match(agents, /<!-- harness:primer:start v=0\.2\.0 -->/);
    assert.match(agents, /<!-- harness:primer:end -->/);

    const gi = readFileSync(join(root, ".gitignore"), "utf-8");
    assert.match(gi, /^# harness:gitignore:start v=0\.2\.0$/m);
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
      merged.startsWith("<!-- harness:primer:start v=0.2.0 -->"),
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
      "memory/_index.md",
      "memory/commitments.md",
      "memory/daily/.gitkeep",
      "memory/distillations/.gitkeep",
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
    assert.ok(
      !existsSync(join(root, "memory")),
      "memory/ should not be created in --dry-run",
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("stale marker upgrade — replaces primer/gitignore blocks in place, preserves surrounding content", () => {
  ensureBuilt();
  const root = makeTmpProject();
  try {
    // Simulate a project that was harnessed at v0.1.0 — write old marker blocks
    // surrounded by user content. The hook should replace the marker contents
    // in place and leave everything outside the markers verbatim.
    const userBefore = "# My Project\n\nUser intro paragraph.\n\n";
    const userAfter = "\n\n## My own section\n\nUser content below the harness block.\n";
    const oldPrimerBlock =
      "<!-- harness:primer:start v=0.1.0 -->\n\n" +
      "old primer body — should be replaced\n\n" +
      "<!-- harness:primer:end -->";
    writeFileSync(
      join(root, "AGENTS.md"),
      userBefore + oldPrimerBlock + userAfter,
    );

    const userGitignoreBefore = "node_modules/\ndist/\n\n";
    const oldGitignoreBlock =
      "# harness:gitignore:start v=0.1.0\n\n" +
      "workspace/*\n!workspace/.gitkeep\n\n" +
      "# harness:gitignore:end";
    const userGitignoreAfter = "\n\n# user trailing rule\n*.log\n";
    writeFileSync(
      join(root, ".gitignore"),
      userGitignoreBefore + oldGitignoreBlock + userGitignoreAfter,
    );

    const { status, stdout } = runHook(root, ["--yes"]);
    assert.equal(status, 0, `hook failed: ${stdout}`);

    const agents = readFileSync(join(root, "AGENTS.md"), "utf-8");
    assert.match(agents, /<!-- harness:primer:start v=0\.2\.0 -->/);
    assert.ok(
      !agents.includes("<!-- harness:primer:start v=0.1.0 -->"),
      "stale primer start marker should be gone",
    );
    assert.ok(
      !agents.includes("old primer body — should be replaced"),
      "stale primer body should be gone",
    );
    assert.ok(
      agents.startsWith(userBefore),
      "user content before the primer block should be preserved verbatim",
    );
    assert.ok(
      agents.endsWith(userAfter),
      "user content after the primer block should be preserved verbatim",
    );
    assert.ok(
      agents.includes("## My own section"),
      "user-authored section must survive upgrade",
    );

    const gi = readFileSync(join(root, ".gitignore"), "utf-8");
    assert.match(gi, /^# harness:gitignore:start v=0\.2\.0$/m);
    assert.ok(
      !gi.includes("# harness:gitignore:start v=0.1.0"),
      "stale gitignore start marker should be gone",
    );
    assert.ok(
      gi.startsWith(userGitignoreBefore),
      "user .gitignore content before the harness section should be preserved",
    );
    assert.ok(
      gi.includes("# user trailing rule"),
      "user .gitignore content after the harness section should be preserved",
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("memory/ — pre-existing content is not overwritten on init", () => {
  ensureBuilt();
  const root = makeTmpProject();
  try {
    // Simulate a user who has already been writing daily notes.
    mkdirSync(join(root, "memory", "daily"), { recursive: true });
    const userDaily = "---\ndate: 2026-05-04\n---\n\n- [observation] [engineering] precious user note\n";
    writeFileSync(join(root, "memory", "daily", "2026-05-04.md"), userDaily);

    const { status, stdout } = runHook(root, ["--yes"]);
    assert.equal(status, 0, `hook failed: ${stdout}`);

    const after = readFileSync(
      join(root, "memory", "daily", "2026-05-04.md"),
      "utf-8",
    );
    assert.equal(after, userDaily, "user daily note must be preserved verbatim");

    // The seed _index.md and commitments.md should still be created.
    assert.ok(
      existsSync(join(root, "memory", "_index.md")),
      "memory/_index.md should be created",
    );
    assert.ok(
      existsSync(join(root, "memory", "commitments.md")),
      "memory/commitments.md should be created",
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
