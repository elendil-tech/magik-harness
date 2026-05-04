/**
 * tests/evals-runner.test.ts — unit coverage for the eval-runner pieces
 * we *can* test without spending API tokens: scenario YAML loading +
 * schema validation, fixture overlay assembly, and discovery.
 *
 * The eval runner's API-touching surface (Cursor SDK + Anthropic) is
 * covered by `pnpm eval --dry-run` and live runs. Here we lock down
 * everything below that boundary.
 */

import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import assert from "node:assert/strict";

import { loadScenario } from "../evals/runner/scenario.ts";
import { buildFixture } from "../evals/runner/fixture.ts";

const TEST_DIR = dirname(fileURLToPath(import.meta.url));
const PLUGIN_ROOT = dirname(TEST_DIR);
const SCENARIOS_DIR = join(PLUGIN_ROOT, "evals", "scenarios");
const FIXTURES_DIR = join(PLUGIN_ROOT, "evals", "fixtures");

function makeTmpYaml(body: string, filename = "01-test-scenario.yaml"): {
  dir: string;
  path: string;
  cleanup: () => void;
} {
  const dir = mkdtempSync(join(tmpdir(), "magik-evals-test-"));
  const path = join(dir, filename);
  writeFileSync(path, body);
  return { dir, path, cleanup: () => rmSync(dir, { recursive: true, force: true }) };
}

// --- Scenario loader -------------------------------------------------------

test("scenario loader — accepts a minimal valid YAML and applies defaults", () => {
  const { path, cleanup } = makeTmpYaml(
    [
      "id: 01-test-scenario",
      "title: A small but valid scenario",
      "description: |",
      "  This is a description that is long enough to satisfy the schema's",
      "  minimum-length validator on description.",
      "fixture: some-fixture",
      "task: |",
      "  do a thing",
      "expectations:",
      "  must_invoke_tools: [Read]",
      "  must_cite: []",
      "  must_surface_concepts: []",
      "  must_not: []",
      "",
    ].join("\n"),
  );
  try {
    const s = loadScenario(path);
    assert.equal(s.id, "01-test-scenario");
    assert.equal(s.fixture, "some-fixture");
    assert.equal(s.weight, 1, "weight defaults to 1");
    assert.equal(s.pass_threshold, 0.7, "pass_threshold defaults to 0.7");
    assert.equal(s.samples, 1, "samples defaults to 1");
    assert.equal(s.timeout_ms, 5 * 60 * 1000, "timeout_ms defaults to 5min");
    assert.deepEqual(s.expectations.must_invoke_tools, ["Read"]);
  } finally {
    cleanup();
  }
});

test("scenario loader — rejects malformed YAML with a useful error", () => {
  const { path, cleanup } = makeTmpYaml(
    "id: 01-test-scenario\ntitle: x\nthis: is: not: yaml: ::",
  );
  try {
    assert.throws(
      () => loadScenario(path),
      /failed to parse YAML/,
      "must surface a YAML parse error",
    );
  } finally {
    cleanup();
  }
});

test("scenario loader — rejects schema violations with field paths", () => {
  const { path, cleanup } = makeTmpYaml(
    [
      "id: BAD_ID_with_underscore",
      "title: short",
      "description: too short",
      "fixture: ok",
      "task: t",
      "expectations:",
      "  must_invoke_tools: []",
      "  must_cite: []",
      "  must_surface_concepts: []",
      "  must_not: []",
      "",
    ].join("\n"),
  );
  try {
    assert.throws(
      () => loadScenario(path),
      /failed schema validation/,
      "must surface schema errors",
    );
  } finally {
    cleanup();
  }
});

test("scenario loader — id mismatch with filename is rejected", () => {
  const { path, cleanup } = makeTmpYaml(
    [
      "id: 99-other-id",
      "title: A small but valid scenario",
      "description: This description is long enough for the schema validator to accept.",
      "fixture: some-fixture",
      "task: do a thing",
      "expectations:",
      "  must_invoke_tools: []",
      "  must_cite: []",
      "  must_surface_concepts: []",
      "  must_not: []",
      "",
    ].join("\n"),
    "01-test-scenario.yaml",
  );
  try {
    assert.throws(
      () => loadScenario(path),
      /does not match filename/,
      "id mismatch must be rejected",
    );
  } finally {
    cleanup();
  }
});

test("scenario loader — every shipped scenario file loads cleanly", () => {
  if (!existsSync(SCENARIOS_DIR)) {
    return; // skip if scenarios dir doesn't exist yet
  }
  const files = readdirSync(SCENARIOS_DIR).filter((f) => f.endsWith(".yaml"));
  assert.ok(files.length > 0, "at least one scenario file must exist");
  for (const f of files) {
    const path = join(SCENARIOS_DIR, f);
    assert.doesNotThrow(
      () => loadScenario(path),
      `shipped scenario ${f} must load without error`,
    );
  }
});

// --- Fixture builder -------------------------------------------------------

test("fixture builder — every shipped scenario references an existing fixture dir", () => {
  if (!existsSync(SCENARIOS_DIR) || !existsSync(FIXTURES_DIR)) return;
  const files = readdirSync(SCENARIOS_DIR).filter((f) => f.endsWith(".yaml"));
  for (const f of files) {
    const s = loadScenario(join(SCENARIOS_DIR, f));
    const fixtureDir = join(FIXTURES_DIR, s.fixture);
    assert.ok(
      existsSync(fixtureDir),
      `scenario ${s.id} references fixture "${s.fixture}" but ${fixtureDir} does not exist`,
    );
  }
});

test("fixture builder — assembles a project from seeds + plugin content + overlay", () => {
  const seedsDir = join(PLUGIN_ROOT, "seeds");
  if (!existsSync(seedsDir)) {
    throw new Error(`seeds/ missing — pretest should have built it`);
  }

  // Pick the first scenario that has overlay files; otherwise fall back to
  // the bare empty fixture, which still yields a harnessed project.
  const fixtures = existsSync(FIXTURES_DIR)
    ? readdirSync(FIXTURES_DIR).filter((d) => {
        const sub = join(FIXTURES_DIR, d);
        try {
          return readdirSync(sub).length > 0;
        } catch {
          return false;
        }
      })
    : [];
  if (fixtures.length === 0) return;

  const built = buildFixture({ fixture: fixtures[0]! });
  try {
    // Seeded files exist.
    assert.ok(
      existsSync(join(built.projectRoot, "AGENTS.primer.md")),
      "seeds/AGENTS.primer.md should be present after fixture build",
    );
    assert.ok(
      existsSync(join(built.projectRoot, "knowledge", "_meta", "domains.md")),
      "knowledge/_meta/domains.md should be present",
    );
    // Plugin content materialized inside .cursor/.
    assert.ok(
      existsSync(join(built.projectRoot, ".cursor", "rules")),
      ".cursor/rules/ should be materialized inside the fixture project",
    );
    assert.ok(
      existsSync(join(built.projectRoot, ".cursor", "skills")),
      ".cursor/skills/ should be materialized inside the fixture project",
    );
    assert.ok(
      existsSync(join(built.projectRoot, ".cursor", "commands")),
      ".cursor/commands/ should be materialized inside the fixture project",
    );
    // Overlay applied.
    assert.ok(
      built.overlayFiles.length > 0,
      `non-empty fixture must report at least one overlay file (got ${built.overlayFiles.length})`,
    );
  } finally {
    built.cleanup();
  }
});

test("fixture builder — unknown fixture name fails loudly", () => {
  assert.throws(
    () => buildFixture({ fixture: "this-fixture-does-not-exist-xyz" }),
    /fixture "this-fixture-does-not-exist-xyz" not found/,
    "must reject unknown fixture names with a clear error",
  );
});

test("fixture builder — overlay file content is what ends up at the destination", () => {
  // Build the populated-kb-with-policy fixture (if present) and verify the
  // policy file's content survives the overlay byte-for-byte.
  const overlayPath = join(
    FIXTURES_DIR,
    "populated-kb-with-policy",
    "knowledge",
    "engineering",
    "auth-policy.md",
  );
  if (!existsSync(overlayPath)) return;

  const expected = readFileSync(overlayPath, "utf-8");
  const built = buildFixture({ fixture: "populated-kb-with-policy" });
  try {
    const dest = join(
      built.projectRoot,
      "knowledge",
      "engineering",
      "auth-policy.md",
    );
    assert.ok(existsSync(dest), "overlay file must land at the expected path");
    const actual = readFileSync(dest, "utf-8");
    assert.equal(
      actual,
      expected,
      "overlay file content must match source byte-for-byte",
    );
  } finally {
    built.cleanup();
  }
});
