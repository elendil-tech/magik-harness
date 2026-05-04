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
import { join } from "node:path";
import test from "node:test";
import assert from "node:assert/strict";

import { escapeRegex, PLUGIN_ROOT_DIR, PLUGIN_VERSION } from "./_version.ts";

const PLUGIN_ROOT = PLUGIN_ROOT_DIR;
const HOOK = join(PLUGIN_ROOT, "hooks", "init-harness.ts");
const SEEDS_DIR = join(PLUGIN_ROOT, "seeds");
const V = escapeRegex(PLUGIN_VERSION);

function makeTmpProject(): string {
  return mkdtempSync(join(tmpdir(), "magik-repo-test-"));
}

function runHook(
  projectRoot: string,
  extraArgs: string[] = [],
): { stdout: string; stderr: string; status: number } {
  // Spawn `node --import tsx <hook> ...` rather than the `tsx` bin shim so
  // the test works on Windows (where the .bin file is `tsx.cmd`, not `tsx`)
  // without platform-specific branching.
  const args = [
    "--import",
    "tsx",
    HOOK,
    "--project-root",
    projectRoot,
    ...extraArgs,
  ];
  const result = spawnSync(process.execPath, args, {
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

    assert.ok(
      existsSync(join(root, ".cursor", "hooks.json")),
      ".cursor/hooks.json missing",
    );
    assert.ok(
      existsSync(join(root, ".cursor", "hooks", "session-start.js")),
      ".cursor/hooks/session-start.js missing",
    );
    assert.ok(
      existsSync(join(root, ".cursor", "hooks", "last-referenced-bump.js")),
      ".cursor/hooks/last-referenced-bump.js missing",
    );

    const hooksJson = readFileSync(
      join(root, ".cursor", "hooks.json"),
      "utf-8",
    );
    const parsedHooks = JSON.parse(hooksJson) as {
      version: number;
      hooks: { sessionStart?: unknown[]; postToolUse?: unknown[] };
    };
    assert.equal(parsedHooks.version, 1);
    assert.ok(
      Array.isArray(parsedHooks.hooks.sessionStart) &&
        parsedHooks.hooks.sessionStart.length > 0,
      "hooks.json must wire sessionStart",
    );
    assert.ok(
      Array.isArray(parsedHooks.hooks.postToolUse) &&
        parsedHooks.hooks.postToolUse.length > 0,
      "hooks.json must wire postToolUse",
    );

    const agents = readFileSync(join(root, "AGENTS.md"), "utf-8");
    assert.match(agents, new RegExp(`<!-- harness:primer:start v=${V} -->`));
    assert.match(agents, /<!-- harness:primer:end -->/);

    const gi = readFileSync(join(root, ".gitignore"), "utf-8");
    assert.match(gi, new RegExp(`^# harness:gitignore:start v=${V}$`, "m"));
    assert.match(gi, /^# harness:gitignore:end$/m);

    // v0.3 schema frontmatter additions — make sure trust / provenance /
    // quarantine / last_referenced are present in every schema template.
    for (const schema of [
      "concept",
      "decision",
      "policy",
      "specification",
      "fieldnote",
    ]) {
      const body = readFileSync(
        join(root, "knowledge", "_meta", "schemas", `${schema}.md`),
        "utf-8",
      );
      for (const field of [
        "last_referenced:",
        "provenance:",
        "trust:",
        "quarantine:",
      ]) {
        assert.ok(
          body.includes(field),
          `schemas/${schema}.md should include frontmatter field "${field}"`,
        );
      }
    }
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
      merged.startsWith(`<!-- harness:primer:start v=${PLUGIN_VERSION} -->`),
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
    assert.match(agents, new RegExp(`<!-- harness:primer:start v=${V} -->`));
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
    assert.match(gi, new RegExp(`^# harness:gitignore:start v=${V}$`, "m"));
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

test("user .cursor/hooks.json present — preserved verbatim, plan emits a notice (no silent merge)", () => {
  ensureBuilt();
  const root = makeTmpProject();
  try {
    const userHooks = {
      version: 1,
      hooks: {
        afterFileEdit: [{ command: "./hooks/format.sh" }],
      },
    };
    mkdirSync(join(root, ".cursor"), { recursive: true });
    writeFileSync(
      join(root, ".cursor", "hooks.json"),
      JSON.stringify(userHooks, null, 2),
    );

    const { status, stdout } = runHook(root, ["--yes"]);
    assert.equal(status, 0, `hook failed: ${stdout}`);

    const after = JSON.parse(
      readFileSync(join(root, ".cursor", "hooks.json"), "utf-8"),
    );
    assert.deepEqual(
      after,
      userHooks,
      "user-authored hooks.json must be preserved byte-equivalent",
    );

    assert.match(
      stdout,
      /\.cursor\/hooks\.json/,
      "plan output should mention the user's hooks.json",
    );
    assert.match(
      stdout,
      /not auto-merged|merge.*hooks\.json/i,
      "plan output should explicitly explain that the harness hooks were not merged",
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

test("corrupt markers — duplicated harness:primer:start blocks → skip + byte-identical AGENTS.md", () => {
  ensureBuilt();
  const root = makeTmpProject();
  try {
    // Two `harness:primer:start` markers. detectMarkerState returns "corrupt"
    // for any startCount/endCount combination that isn't (1, 1) or (0, 0).
    // The hook must refuse to touch the file, surface the situation in the
    // plan, and exit cleanly so re-runs don't make it worse.
    const corrupt =
      "<!-- harness:primer:start v=0.1.0 -->\n" +
      "first stale block\n" +
      "<!-- harness:primer:end -->\n\n" +
      "user content sandwiched between two start markers\n\n" +
      "<!-- harness:primer:start v=0.2.0 -->\n" +
      "second stale block\n" +
      "<!-- harness:primer:end -->\n" +
      "user trailing content\n";
    writeFileSync(join(root, "AGENTS.md"), corrupt);

    const { status, stdout } = runHook(root, ["--yes"]);
    assert.equal(status, 0, `hook failed: ${stdout}`);

    const after = readFileSync(join(root, "AGENTS.md"), "utf-8");
    assert.equal(
      after,
      corrupt,
      "AGENTS.md with corrupt markers must be left byte-identical",
    );

    assert.match(
      stdout,
      /AGENTS\.md/,
      "plan output should reference AGENTS.md",
    );
    assert.match(
      stdout,
      /unmatched|multiple|fix manually/i,
      "plan output should explain why AGENTS.md was skipped",
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("code-at-root detection — surfaces a notice for ecosystem files at the repo root", () => {
  ensureBuilt();
  const root = makeTmpProject();
  try {
    // A handful of files from CODE_AT_ROOT_FILES across ecosystems, plus a
    // populated src/ to exercise the directory branch of the detector.
    writeFileSync(
      join(root, "package.json"),
      JSON.stringify({ name: "user-project", version: "0.0.0" }, null, 2),
    );
    writeFileSync(join(root, "Cargo.toml"), "[package]\nname = \"x\"\n");
    mkdirSync(join(root, "src"), { recursive: true });
    writeFileSync(join(root, "src", "index.ts"), "export {};\n");

    const { status, stdout } = runHook(root, ["--yes"]);
    assert.equal(status, 0, `hook failed: ${stdout}`);

    assert.match(
      stdout,
      /Notices:/,
      "plan should include a Notices block when code is detected at root",
    );
    assert.match(
      stdout,
      /package\.json/,
      "notice should mention package.json",
    );
    assert.match(stdout, /Cargo\.toml/, "notice should mention Cargo.toml");
    assert.match(stdout, /src\//, "notice should mention populated src/");
    assert.match(
      stdout,
      /codebase\//i,
      "notice should point at codebase/ as the harness convention",
    );

    // The hook is informational only in v0.4.x — files at root must NOT move.
    assert.ok(
      existsSync(join(root, "package.json")),
      "package.json must not be moved",
    );
    assert.ok(
      existsSync(join(root, "Cargo.toml")),
      "Cargo.toml must not be moved",
    );
    assert.ok(
      existsSync(join(root, "src", "index.ts")),
      "src/index.ts must not be moved",
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
