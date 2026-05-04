/**
 * tests/seed-tree.snapshot.test.ts — pin the exact set of files (paths +
 * content hashes) that `/init-harness` would lay into a user project.
 *
 * The test hashes every file under `seeds/` (the build output that
 * `install-local.ts` copies into Cursor's plugin dir) and compares the
 * manifest to a checked-in snapshot at
 * `tests/__snapshots__/seed-tree.json`. Any unintended addition, removal,
 * or content mutation fails CI.
 *
 * Why hash `seeds/` and not `seed-sources/`: `scripts/build.ts` produces
 * `seeds/` as the runtime payload. Snapshotting the build output also
 * doubles as a regression test for the build script.
 *
 * Updating the snapshot intentionally: after a deliberate seed-payload
 * change, run `UPDATE_SNAPSHOTS=1 pnpm test` to rewrite the manifest. The
 * diff in the resulting JSON should be reviewed in the PR.
 */

import { createHash } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { join, relative } from "node:path";
import test from "node:test";
import assert from "node:assert/strict";

import { PLUGIN_ROOT_DIR } from "./_version.ts";

const SEEDS_DIR = join(PLUGIN_ROOT_DIR, "seeds");
const SNAPSHOT_DIR = join(PLUGIN_ROOT_DIR, "tests", "__snapshots__");
const SNAPSHOT_PATH = join(SNAPSHOT_DIR, "seed-tree.json");

interface SeedSnapshot {
  /** Stamped from package.json#version at the time the snapshot was written. */
  version: string;
  /** Total file count for an at-a-glance sanity check. */
  fileCount: number;
  /** Sorted list of {path, sha256} pairs. */
  entries: Array<{ path: string; sha256: string }>;
}

function ensureBuilt(): void {
  if (!existsSync(SEEDS_DIR)) {
    throw new Error(
      `seeds/ missing — run \`pnpm build\` before the test suite (looked at ${SEEDS_DIR}).`,
    );
  }
}

function walkFiles(root: string): string[] {
  const out: string[] = [];
  function walk(dir: string): void {
    const entries = readdirSync(dir, { withFileTypes: true }).sort((a, b) =>
      a.name.localeCompare(b.name),
    );
    for (const entry of entries) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.isFile()) out.push(full);
    }
  }
  walk(root);
  return out;
}

function hashFile(absPath: string): string {
  const buf = readFileSync(absPath);
  return createHash("sha256").update(buf).digest("hex");
}

function buildSnapshot(version: string): SeedSnapshot {
  ensureBuilt();
  const files = walkFiles(SEEDS_DIR);
  const entries = files
    .map((abs) => ({
      path: relative(SEEDS_DIR, abs).split("\\").join("/"),
      sha256: hashFile(abs),
    }))
    .sort((a, b) => a.path.localeCompare(b.path));
  return {
    version,
    fileCount: entries.length,
    entries,
  };
}

function readSnapshot(): SeedSnapshot | null {
  if (!existsSync(SNAPSHOT_PATH)) return null;
  return JSON.parse(readFileSync(SNAPSHOT_PATH, "utf-8")) as SeedSnapshot;
}

function writeSnapshot(snap: SeedSnapshot): void {
  if (!existsSync(SNAPSHOT_DIR)) mkdirSync(SNAPSHOT_DIR, { recursive: true });
  writeFileSync(SNAPSHOT_PATH, `${JSON.stringify(snap, null, 2)}\n`);
}

const UPDATE = process.env.UPDATE_SNAPSHOTS === "1";

test("seed-tree snapshot — file set + content hashes match the checked-in manifest", () => {
  ensureBuilt();
  const pkg = JSON.parse(
    readFileSync(join(PLUGIN_ROOT_DIR, "package.json"), "utf-8"),
  ) as { version: string };

  const current = buildSnapshot(pkg.version);

  if (UPDATE) {
    writeSnapshot(current);
    console.log(
      `seed-tree snapshot updated → ${relative(PLUGIN_ROOT_DIR, SNAPSHOT_PATH)} (${current.fileCount} files)`,
    );
    return;
  }

  const stored = readSnapshot();
  assert.ok(
    stored,
    `seed-tree snapshot missing at ${SNAPSHOT_PATH}. Generate it with \`UPDATE_SNAPSHOTS=1 pnpm test\` and commit the result.`,
  );

  // File count first — gives a friendlier error than per-entry diff when
  // entire trees are added or removed.
  assert.equal(
    current.fileCount,
    stored!.fileCount,
    `seed-tree file count drifted: expected ${stored!.fileCount}, got ${current.fileCount}. ` +
      `Run \`UPDATE_SNAPSHOTS=1 pnpm test\` if intentional.`,
  );

  // Build maps for easier diffing.
  const expected = new Map(stored!.entries.map((e) => [e.path, e.sha256]));
  const actual = new Map(current.entries.map((e) => [e.path, e.sha256]));

  const added: string[] = [];
  const removed: string[] = [];
  const changed: string[] = [];
  for (const [path, sha] of actual) {
    if (!expected.has(path)) added.push(path);
    else if (expected.get(path) !== sha) changed.push(path);
  }
  for (const path of expected.keys()) {
    if (!actual.has(path)) removed.push(path);
  }

  if (added.length || removed.length || changed.length) {
    const lines = [
      "seed-tree snapshot drift detected:",
      ...added.map((p) => `  + added    ${p}`),
      ...removed.map((p) => `  - removed  ${p}`),
      ...changed.map((p) => `  ~ changed  ${p}`),
      "",
      "If this is intentional, run `UPDATE_SNAPSHOTS=1 pnpm test` and review the diff.",
    ];
    assert.fail(lines.join("\n"));
  }
});

test("seed-tree snapshot — version stamp tracks current package.json", () => {
  if (UPDATE) return;
  const stored = readSnapshot();
  if (!stored) return;
  const pkg = JSON.parse(
    readFileSync(join(PLUGIN_ROOT_DIR, "package.json"), "utf-8"),
  ) as { version: string };
  assert.equal(
    stored.version,
    pkg.version,
    `seed-tree snapshot version (${stored.version}) is out of date. ` +
      `Bump it with \`UPDATE_SNAPSHOTS=1 pnpm test\` after every release.`,
  );
});
