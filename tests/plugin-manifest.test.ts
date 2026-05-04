/**
 * tests/plugin-manifest.test.ts — assert the Cursor plugin manifest is
 * structurally valid and every path it references actually exists on disk.
 *
 * Cursor reads `.cursor-plugin/plugin.json` to surface the plugin in the
 * marketplace and IDE; a broken `logo` path or missing required key means
 * the plugin loads silently-degraded (or not at all). This test is a cheap
 * gate that would have caught the v0.4.0 dangling `assets/logo.png`
 * reference where the file was deleted from disk but the manifest still
 * pointed at it.
 *
 * What this test does NOT do: validate against an upstream Cursor JSON
 * schema. We don't have a published, stable schema URL today; if/when one
 * lands, switch this to schema-driven validation instead.
 */

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import assert from "node:assert/strict";

import { PLUGIN_ROOT_DIR, PLUGIN_VERSION } from "./_version.ts";

const MANIFEST_PATH = join(PLUGIN_ROOT_DIR, ".cursor-plugin", "plugin.json");

interface PluginManifest {
  name?: unknown;
  version?: unknown;
  description?: unknown;
  author?: unknown;
  license?: unknown;
  logo?: unknown;
  keywords?: unknown;
}

function readManifest(): PluginManifest {
  const raw = readFileSync(MANIFEST_PATH, "utf-8");
  return JSON.parse(raw) as PluginManifest;
}

test("plugin-manifest — file exists and parses as JSON", () => {
  assert.ok(existsSync(MANIFEST_PATH), `${MANIFEST_PATH} is missing`);
  assert.doesNotThrow(() => readManifest(), "plugin.json must parse as JSON");
});

test("plugin-manifest — required keys are present and well-typed", () => {
  const m = readManifest();
  assert.equal(typeof m.name, "string", "manifest#name must be a string");
  assert.equal(m.name, "magik-repo", "manifest#name must be 'magik-repo'");
  assert.equal(typeof m.version, "string", "manifest#version must be a string");
  assert.equal(
    typeof m.description,
    "string",
    "manifest#description must be a string",
  );
  assert.ok(
    typeof m.description === "string" && m.description.length > 0,
    "manifest#description must be non-empty",
  );
  assert.equal(typeof m.license, "string", "manifest#license must be a string");
  assert.ok(
    Array.isArray(m.keywords) && m.keywords.length > 0,
    "manifest#keywords must be a non-empty array",
  );
  for (const kw of m.keywords as unknown[]) {
    assert.equal(typeof kw, "string", "every keyword must be a string");
  }
});

test("plugin-manifest — version matches package.json", () => {
  const m = readManifest();
  assert.equal(
    m.version,
    PLUGIN_VERSION,
    `manifest#version (${m.version as string}) must match package.json#version (${PLUGIN_VERSION})`,
  );
});

test("plugin-manifest — logo path resolves to a real file (catches dangling asset references)", () => {
  const m = readManifest();
  assert.equal(typeof m.logo, "string", "manifest#logo must be a string");
  const logoRel = m.logo as string;
  const logoAbs = join(PLUGIN_ROOT_DIR, logoRel);
  assert.ok(
    existsSync(logoAbs),
    `manifest#logo points at "${logoRel}" but no file exists at ${logoAbs}. ` +
      `Either restore the asset or update plugin.json to point at an existing file.`,
  );
});

test("plugin-manifest — author is present (object or string form)", () => {
  const m = readManifest();
  if (typeof m.author === "string") {
    assert.ok(m.author.length > 0, "author string must be non-empty");
    return;
  }
  assert.equal(
    typeof m.author,
    "object",
    "manifest#author must be a string or an object",
  );
  assert.ok(m.author !== null, "manifest#author must not be null");
  const a = m.author as { name?: unknown };
  assert.equal(typeof a.name, "string", "manifest#author.name must be a string");
  assert.ok((a.name as string).length > 0, "author.name must be non-empty");
});
