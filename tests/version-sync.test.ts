/**
 * tests/version-sync.test.ts — assert that the plugin version stamp is
 * consistent across every place it appears.
 *
 * package.json is the canonical source of truth; every other location
 * (plugin manifest, hook PLUGIN_VERSION constant, README, CHANGELOG) must
 * agree.
 *
 * Why: a desynced PLUGIN_VERSION between the hook and the marker regex it
 * writes leads to "current" projects being detected as "stale" forever, or
 * worse, "stale" projects being silently treated as "current". The marker
 * version is the trigger for in-place upgrades — drift here corrupts user
 * AGENTS.md / .gitignore.
 */

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import assert from "node:assert/strict";

import { escapeRegex, PLUGIN_ROOT_DIR, PLUGIN_VERSION } from "./_version.ts";

const V = escapeRegex(PLUGIN_VERSION);

test("version-sync — .cursor-plugin/plugin.json matches package.json", () => {
  const path = join(PLUGIN_ROOT_DIR, ".cursor-plugin", "plugin.json");
  const manifest = JSON.parse(readFileSync(path, "utf-8")) as {
    version?: string;
  };
  assert.equal(
    manifest.version,
    PLUGIN_VERSION,
    `.cursor-plugin/plugin.json#version (${manifest.version}) must match package.json#version (${PLUGIN_VERSION})`,
  );
});

test("version-sync — hooks/init-harness.ts PLUGIN_VERSION matches package.json", () => {
  const path = join(PLUGIN_ROOT_DIR, "hooks", "init-harness.ts");
  const src = readFileSync(path, "utf-8");
  const m = src.match(/const\s+PLUGIN_VERSION\s*=\s*"([^"]+)"/);
  assert.ok(
    m,
    "hooks/init-harness.ts must declare `const PLUGIN_VERSION = \"x.y.z\"`",
  );
  assert.equal(
    m![1],
    PLUGIN_VERSION,
    `PLUGIN_VERSION in hooks/init-harness.ts (${m![1]}) must match package.json#version (${PLUGIN_VERSION}). Drift here breaks marker-block upgrades.`,
  );
});

test("version-sync — README.md cites the current version", () => {
  const path = join(PLUGIN_ROOT_DIR, "README.md");
  const body = readFileSync(path, "utf-8");
  const re = new RegExp(`magik-repo@${V}\\b`);
  assert.match(
    body,
    re,
    `README.md must contain "magik-repo@${PLUGIN_VERSION}" — bump it whenever you bump package.json`,
  );
});

test("version-sync — CHANGELOG.md has a heading for the current version", () => {
  const path = join(PLUGIN_ROOT_DIR, "CHANGELOG.md");
  const body = readFileSync(path, "utf-8");
  const re = new RegExp(`^##\\s+${V}\\b`, "m");
  assert.match(
    body,
    re,
    `CHANGELOG.md must contain a "## ${PLUGIN_VERSION}" heading — every release must be documented`,
  );
});

test("version-sync — no leftover marker stamps from older versions in source files", () => {
  // The hook writes markers at the *current* PLUGIN_VERSION, but a forgotten
  // hardcoded "v=0.x.y" in source can mask drift. We only check non-CHANGELOG
  // sources (CHANGELOG legitimately references historic versions).
  const filesToScan = [
    "hooks/init-harness.ts",
    "README.md",
    ".cursor-plugin/plugin.json",
    "package.json",
  ];
  const markerRe = /v=(\d+\.\d+\.\d+)/g;
  for (const rel of filesToScan) {
    const path = join(PLUGIN_ROOT_DIR, rel);
    if (!existsSync(path)) continue;
    const body = readFileSync(path, "utf-8");
    const matches = [...body.matchAll(markerRe)];
    for (const m of matches) {
      assert.equal(
        m[1],
        PLUGIN_VERSION,
        `${rel} contains a marker stamp v=${m[1]} that doesn't match package.json#version (${PLUGIN_VERSION}). All v=x.y.z stamps in source must track the current version.`,
      );
    }
  }
});
