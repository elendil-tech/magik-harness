/**
 * tests/evals-runner.test.ts — unit coverage for the eval-runner pieces
 * we *can* test without spending API tokens: scenario YAML loading +
 * schema validation, fixture overlay assembly, the param-CSV parser
 * shared by the CLI, and discovery.
 *
 * The eval runner's API-touching surface (the Cursor SDK calls in
 * runner.ts and judge.ts) is covered by `pnpm eval --dry-run` and live
 * runs. Here we lock down everything below that boundary.
 */

import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import assert from "node:assert/strict";

import { loadScenario } from "../evals/runner/scenario.ts";
import { buildFixture } from "../evals/runner/fixture.ts";
import { parseParamCsv } from "../evals/runner/judge.ts";
import {
  checkRegression,
  DEFAULT_REGRESSION_TOLERANCE,
} from "../evals/runner/regression.ts";
import type {
  RunReport,
  ScenarioResult,
} from "../evals/runner/types.ts";

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
      "turns:",
      "  - do a thing",
      "  - and then another thing",
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
    assert.deepEqual(s.turns, ["do a thing", "and then another thing"]);
    assert.equal(s.weight, 1, "weight defaults to 1");
    assert.equal(s.pass_threshold, 0.7, "pass_threshold defaults to 0.7");
    assert.equal(s.samples, 1, "samples defaults to 1");
    assert.equal(s.timeout_ms, 12 * 60 * 1000, "timeout_ms defaults to 12min");
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
      "turns:",
      "  - t",
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
      "turns:",
      "  - do a thing",
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

test("parseParamCsv — empty / undefined → empty array", () => {
  assert.deepEqual(parseParamCsv(undefined), []);
  assert.deepEqual(parseParamCsv(""), []);
  assert.deepEqual(parseParamCsv("   "), []);
});

test("parseParamCsv — single + multi pair, trimming whitespace", () => {
  assert.deepEqual(parseParamCsv("fast=false"), [
    { id: "fast", value: "false" },
  ]);
  assert.deepEqual(
    parseParamCsv(" thinking=true , context=1m, effort=high "),
    [
      { id: "thinking", value: "true" },
      { id: "context", value: "1m" },
      { id: "effort", value: "high" },
    ],
    "leading / trailing whitespace around each pair must be stripped",
  );
});

test("parseParamCsv — values with `=` inside survive", () => {
  // Right-of-first-`=` becomes the entire value. (Not used today by
  // any model, but defensive: model param values are arbitrary
  // strings.)
  assert.deepEqual(parseParamCsv("foo=a=b=c"), [
    { id: "foo", value: "a=b=c" },
  ]);
});

test("parseParamCsv — malformed pairs throw with a helpful message", () => {
  assert.throws(
    () => parseParamCsv("not-a-pair"),
    /no "="/,
    "missing `=` must be reported",
  );
  assert.throws(
    () => parseParamCsv("=value"),
    /both key and value must be non-empty/,
    "empty key must be rejected",
  );
  assert.throws(
    () => parseParamCsv("key="),
    /both key and value must be non-empty/,
    "empty value must be rejected",
  );
});

test("fixture builder — materializes AGENTS.md from the seeded primer with harness markers", () => {
  // Pick the smallest-overlay fixture so the test is fast; we only
  // care about the seeded primer here.
  const fixtures = existsSync(FIXTURES_DIR)
    ? readdirSync(FIXTURES_DIR)
    : [];
  if (fixtures.length === 0) return;

  const built = buildFixture({ fixture: fixtures[0]! });
  try {
    const agentsMd = join(built.projectRoot, "AGENTS.md");
    assert.ok(
      existsSync(agentsMd),
      "AGENTS.md must be materialized at project root so Cursor's primer discovery picks it up",
    );
    const body = readFileSync(agentsMd, "utf-8");
    assert.match(
      body,
      /<!-- harness:primer:start v=\d+\.\d+\.\d+ -->/,
      "AGENTS.md must carry the harness primer start marker with a current version",
    );
    assert.match(
      body,
      /<!-- harness:primer:end -->/,
      "AGENTS.md must carry the harness primer end marker",
    );
    assert.match(
      body,
      /Mandatory protocols/,
      "AGENTS.md must contain the v0.4.2 'Mandatory protocols' section so the agent under test sees the executable protocols",
    );
  } finally {
    built.cleanup();
  }
});

test("fixture builder — materializes .gitignore from gitignore.harness with harness markers", () => {
  // The harness's enforcement of the v0.5.0 memory contract is
  // structural: `.gitignore` carries `memory/`, so `git add memory/...`
  // is rejected by git itself, not by the agent's discipline. Without
  // this materialization step, the seed payload's `gitignore.harness`
  // file sits at the project root as a template artifact and `.gitignore`
  // never exists — so an agent that runs `git init && git add memory/...`
  // succeeds at committing memory/ contents, defeating the contract.
  // Scenario 04 (v0.6.0 baseline) failed turn 2 entirely because of
  // this gap; this test guards against the bug recurring.
  const fixtures = existsSync(FIXTURES_DIR)
    ? readdirSync(FIXTURES_DIR)
    : [];
  // Find the first harnessed fixture (skip content-only twins, which
  // intentionally have no .gitignore).
  const harnessedFixture = fixtures.find((name) => {
    const metaPath = join(FIXTURES_DIR, name, ".fixture.json");
    if (!existsSync(metaPath)) return true;
    try {
      const meta = JSON.parse(readFileSync(metaPath, "utf-8")) as {
        harness?: boolean;
      };
      return meta.harness !== false;
    } catch {
      return true;
    }
  });
  if (!harnessedFixture) return;

  const built = buildFixture({ fixture: harnessedFixture });
  try {
    const gitignore = join(built.projectRoot, ".gitignore");
    assert.ok(
      existsSync(gitignore),
      ".gitignore must be materialized at project root so the v0.5.0 memory contract is enforced structurally by git",
    );
    const body = readFileSync(gitignore, "utf-8");
    assert.match(
      body,
      /^# harness:gitignore:start v=\d+\.\d+\.\d+$/m,
      ".gitignore must carry the harness gitignore start marker with a current version",
    );
    assert.match(
      body,
      /^# harness:gitignore:end$/m,
      ".gitignore must carry the harness gitignore end marker",
    );
    assert.match(
      body,
      /^memory\/$/m,
      ".gitignore must include `memory/` so `git add memory/...` is structurally rejected",
    );
    assert.match(
      body,
      /^workspace\/\*$/m,
      ".gitignore must include `workspace/*` so craft artifacts are runtime-local by default",
    );
  } finally {
    built.cleanup();
  }
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

// --- Regression gate -------------------------------------------------------

function makeScenarioResult(
  scenarioId: string,
  score: number,
  condition?: ScenarioResult["condition"],
): ScenarioResult {
  return {
    scenario_id: scenarioId,
    title: scenarioId,
    condition,
    passed: score >= 0.7,
    score,
    score_min: score,
    score_max: score,
    score_stddev: 0,
    pass_rate: score >= 0.7 ? 1 : 0,
    samples: [],
    duration_ms: 0,
    transcript_chars: 0,
    status: "ok",
  };
}

function makeReport(scenarios: ScenarioResult[]): RunReport {
  return {
    meta: {
      timestamp: "1970-01-01T00:00:00.000Z",
      plugin_version: "0.0.0-test",
      agent_model: "test-agent",
      agent_params: [],
      judge_model: "test-judge",
      judge_params: [],
      cursor_sdk_version: "test",
      host: "test",
    },
    scenarios,
    summary: {
      total: scenarios.length,
      passed: 0,
      failed: 0,
      skipped: 0,
      mean_score: 0,
      weighted_score: 0,
    },
  };
}

function writeBaseline(report: RunReport): {
  path: string;
  cleanup: () => void;
} {
  const dir = mkdtempSync(join(tmpdir(), "magik-regression-test-"));
  const path = join(dir, "baseline.json");
  writeFileSync(path, JSON.stringify(report));
  return { path, cleanup: () => rmSync(dir, { recursive: true, force: true }) };
}

test("regression gate — clean run flags zero regressions", () => {
  const baseline = makeReport([
    makeScenarioResult("01-foo", 0.8, "harnessed"),
    makeScenarioResult("02-bar", 0.7, "harnessed"),
  ]);
  const current = makeReport([
    makeScenarioResult("01-foo", 0.8, "harnessed"),
    makeScenarioResult("02-bar", 0.72, "harnessed"),
  ]);
  const { path, cleanup } = writeBaseline(baseline);
  try {
    const r = checkRegression(current, path);
    assert.equal(r.regressions.length, 0);
    assert.equal(r.entries.length, 2);
    for (const e of r.entries) assert.equal(e.status, "compared");
  } finally {
    cleanup();
  }
});

test("regression gate — flags scenarios that drop more than the tolerance", () => {
  const baseline = makeReport([makeScenarioResult("01-foo", 0.8, "harnessed")]);
  // 0.8 -> 0.6 = -20pp, which is beyond the default 15pp tolerance.
  const current = makeReport([makeScenarioResult("01-foo", 0.6, "harnessed")]);
  const { path, cleanup } = writeBaseline(baseline);
  try {
    const r = checkRegression(current, path);
    assert.equal(r.regressions.length, 1);
    const reg = r.regressions[0]!;
    assert.equal(reg.scenario_id, "01-foo");
    assert.ok(reg.is_regression);
    assert.ok(reg.delta < -DEFAULT_REGRESSION_TOLERANCE);
  } finally {
    cleanup();
  }
});

test("regression gate — dips within tolerance are NOT regressions", () => {
  const baseline = makeReport([makeScenarioResult("01-foo", 0.8, "harnessed")]);
  // 0.8 -> 0.7 = -10pp, within the 15pp tolerance.
  const current = makeReport([makeScenarioResult("01-foo", 0.7, "harnessed")]);
  const { path, cleanup } = writeBaseline(baseline);
  try {
    const r = checkRegression(current, path);
    assert.equal(
      r.regressions.length,
      0,
      "a 10pp dip is within tolerance and must not be flagged",
    );
    assert.equal(r.entries.length, 1);
    assert.equal(r.entries[0]!.status, "compared");
  } finally {
    cleanup();
  }
});

test("regression gate — improvements over baseline are never flagged", () => {
  const baseline = makeReport([makeScenarioResult("01-foo", 0.5, "harnessed")]);
  const current = makeReport([makeScenarioResult("01-foo", 0.9, "harnessed")]);
  const { path, cleanup } = writeBaseline(baseline);
  try {
    const r = checkRegression(current, path);
    assert.equal(r.regressions.length, 0);
    assert.ok(
      r.entries[0]!.delta > 0,
      "a positive delta must not be a regression regardless of magnitude",
    );
  } finally {
    cleanup();
  }
});

test("regression gate — pairs by (scenario_id, condition); harnessed and content-only compared independently", () => {
  const baseline = makeReport([
    makeScenarioResult("01-foo", 0.9, "harnessed"),
    makeScenarioResult("01-foo", 0.5, "content-only"),
  ]);
  // Harnessed regresses by 30pp; content-only improves by 30pp. The
  // harnessed regression must still be flagged even though the *mean*
  // is unchanged.
  const current = makeReport([
    makeScenarioResult("01-foo", 0.6, "harnessed"),
    makeScenarioResult("01-foo", 0.8, "content-only"),
  ]);
  const { path, cleanup } = writeBaseline(baseline);
  try {
    const r = checkRegression(current, path);
    assert.equal(r.regressions.length, 1);
    assert.equal(r.regressions[0]!.condition, "harnessed");
    assert.equal(r.regressions[0]!.scenario_id, "01-foo");
  } finally {
    cleanup();
  }
});

test("regression gate — pre-v0.6.0 baseline (no condition) matches current run's harnessed", () => {
  const baseline = makeReport([makeScenarioResult("01-foo", 0.8 /* no condition */)]);
  const current = makeReport([makeScenarioResult("01-foo", 0.5, "harnessed")]);
  const { path, cleanup } = writeBaseline(baseline);
  try {
    const r = checkRegression(current, path);
    assert.equal(r.regressions.length, 1, "legacy baseline must pair with harnessed");
    assert.equal(r.regressions[0]!.scenario_id, "01-foo");
  } finally {
    cleanup();
  }
});

test("regression gate — entries present in only one side are surfaced but not flagged", () => {
  const baseline = makeReport([
    makeScenarioResult("01-old-only", 0.9, "harnessed"),
    makeScenarioResult("02-shared", 0.7, "harnessed"),
  ]);
  const current = makeReport([
    makeScenarioResult("02-shared", 0.7, "harnessed"),
    makeScenarioResult("03-new-only", 0.8, "harnessed"),
  ]);
  const { path, cleanup } = writeBaseline(baseline);
  try {
    const r = checkRegression(current, path);
    assert.equal(r.regressions.length, 0);
    const oldOnly = r.entries.find((e) => e.scenario_id === "01-old-only");
    const newOnly = r.entries.find((e) => e.scenario_id === "03-new-only");
    assert.equal(oldOnly?.status, "baseline-only");
    assert.equal(newOnly?.status, "current-only");
  } finally {
    cleanup();
  }
});

test("regression gate — custom tolerance overrides the default", () => {
  const baseline = makeReport([makeScenarioResult("01-foo", 0.8, "harnessed")]);
  const current = makeReport([makeScenarioResult("01-foo", 0.7, "harnessed")]);
  // 10pp dip — within the default 15pp tolerance, but BEYOND a 5pp tolerance.
  const { path, cleanup } = writeBaseline(baseline);
  try {
    const lenient = checkRegression(current, path);
    assert.equal(lenient.regressions.length, 0);
    const strict = checkRegression(current, path, { tolerance: 0.05 });
    assert.equal(strict.regressions.length, 1);
  } finally {
    cleanup();
  }
});

test("regression gate — invalid baseline path throws a clear error", () => {
  assert.throws(
    () => checkRegression(makeReport([]), "/nonexistent/path/baseline.json"),
    /failed to read baseline/,
  );
});
