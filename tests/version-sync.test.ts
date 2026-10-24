/**
 * tests/version-sync.test.ts: one version, everywhere it is written down.
 *
 * package.json is the source of truth. Every other place that states the
 * version (the plugin manifest, the runtime's own constant, the CLI, the
 * README pinned install line and badge, the CHANGELOG) must agree, because a drifting
 * RUNTIME_VERSION makes `doctor` call a current install stale, or worse, call
 * a stale one current.
 */

import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, it } from "node:test";

import { VERSION } from "../src/version.js";
import { MARKER_LINE } from "../runtime/session-start.mjs";
import { RUNTIME_VERSION } from "../runtime/resolve.mjs";
import { escapeRegex, PLUGIN_ROOT_DIR, PLUGIN_VERSION } from "./_version.ts";
import { cli, tmp } from "./_helpers.ts";

const V = escapeRegex(PLUGIN_VERSION);
const text = (rel: string) => readFileSync(join(PLUGIN_ROOT_DIR, rel), "utf8");

function walk(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(join(dir, e.name)) : [join(dir, e.name)]));
}

describe("version-sync", () => {
  it("package.json holds a plain semantic version", () => {
    assert.match(PLUGIN_VERSION, /^\d+\.\d+\.\d+$/);
  });

  it(".cursor-plugin/plugin.json matches package.json", () => {
    assert.equal(JSON.parse(text(".cursor-plugin/plugin.json")).version, PLUGIN_VERSION);
  });

  it("the CLI reports the package version", async () => {
    assert.equal(VERSION, PLUGIN_VERSION);
    const home = tmp("version-home");
    const r = await cli(["--version"], { cwd: home, home });
    assert.equal(r.out.trim(), PLUGIN_VERSION);
  });

  it("the runtime copied into projects carries the same version", () => {
    assert.equal(RUNTIME_VERSION, PLUGIN_VERSION, "runtime/resolve.mjs RUNTIME_VERSION drifted from package.json");
    assert.ok(MARKER_LINE.endsWith(`v${PLUGIN_VERSION}`), "the marker line the hook prints names the version");
  });

  it("README.md shows the pinned install line and the badge for the current version", () => {
    const readme = text("README.md");
    assert.match(readme, new RegExp(`magik-harness#v${V}\\b`), `README.md must show the pinned form "magik-harness#v${PLUGIN_VERSION}" (the tag is the release)`);
    assert.match(readme, new RegExp(`badge/version-${V}-`), `README.md's version badge must say ${PLUGIN_VERSION}`);
  });

  it("CHANGELOG.md has a heading for the current version", () => {
    assert.match(text("CHANGELOG.md"), new RegExp(`^##\\s+\\[?${V}\\b`, "m"), `CHANGELOG.md must have a "## ${PLUGIN_VERSION}" heading`);
  });

  it("no stray marker stamp (v=x.y.z) in shipped sources names another version", () => {
    const sources = ["README.md", "package.json", ".cursor-plugin/plugin.json", ...["runtime", "src", "content", "skills", "commands"].flatMap((d) => walk(join(PLUGIN_ROOT_DIR, d)).map((f) => relative(PLUGIN_ROOT_DIR, f)))];
    const stale: string[] = [];
    for (const rel of sources) {
      if (!existsSync(join(PLUGIN_ROOT_DIR, rel)) || !/\.(md|mjs|js|json|txt)$/.test(rel)) continue;
      for (const m of text(rel).matchAll(/\bv=(\d+\.\d+\.\d+)/g)) if (m[1] !== PLUGIN_VERSION) stale.push(`${rel}: v=${m[1]}`);
    }
    assert.deepEqual(stale, []);
  });
});
