/**
 * tests/plugin-manifest.test.ts: the optional Cursor plugin packaging.
 *
 * The CLI is the product; the plugin is a convenience wrapper (skills plus a
 * few slash commands) for people who live in Cursor. It still has to be
 * valid: Cursor reads `.cursor-plugin/plugin.json` to list it, a dangling
 * `logo` path degrades it silently, and a command that names a skill or a CLI
 * command that does not exist is a trap. So the manifest, the commands, the
 * install script and the npm `files` list are all checked against the disk.
 */

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";

import { loadCatalog } from "../src/lib/catalog.js";
import { parseSkillMd } from "../src/lib/skillmd.js";
import { PLUGIN_VERSION } from "./_version.ts";
import { files, has, ROOT, read, tmp } from "./_helpers.ts";

const MANIFEST = join(ROOT, ".cursor-plugin", "plugin.json");
const manifest = () => JSON.parse(readFileSync(MANIFEST, "utf8")) as Record<string, unknown>;
const KNOWN_SKILLS = new Set([...loadCatalog({ packDirs: [] }).all.keys()]);
const CLI_COMMANDS = new Set(["install", "upgrade", "doctor", "status", "resolve", "init", "uninstall", "list", "primer", "help"]);
const commandFiles = () => readdirSync(join(ROOT, "commands")).filter((f) => f.endsWith(".md")).sort();

describe("plugin.json", () => {
  it("exists and parses", () => {
    assert.ok(existsSync(MANIFEST), `${MANIFEST} is missing`);
    assert.doesNotThrow(manifest);
  });

  it("has the required keys, well-typed, under the product's name", () => {
    const m = manifest();
    assert.equal(m.name, "magik-harness");
    assert.equal(typeof m.version, "string");
    assert.ok(typeof m.description === "string" && m.description.length > 40, "a real description");
    assert.equal(m.license, "MIT");
    assert.ok(Array.isArray(m.keywords) && m.keywords.length > 0 && m.keywords.every((k) => typeof k === "string"));
    const author = m.author as { name?: unknown } | string;
    assert.ok(typeof author === "string" ? author.length > 0 : typeof author?.name === "string" && author.name.length > 0, "author present");
  });

  it("version matches package.json", () => {
    assert.equal(manifest().version, PLUGIN_VERSION);
  });

  it("logo resolves to a real file (a dangling asset reference degrades the listing silently)", () => {
    const logo = manifest().logo;
    assert.equal(typeof logo, "string");
    assert.ok(existsSync(join(ROOT, logo as string)), `logo ${logo as string} does not exist`);
  });

  it("does not describe the product as only a Cursor plugin", () => {
    const d = String(manifest().description);
    assert.match(d, /optional/i, "the plugin is one way to get the harness, not the harness");
    assert.match(d, /magik-harness/);
  });
});

describe("slash commands", () => {
  it("there are some, and each has the frontmatter Cursor requires", () => {
    const names = commandFiles();
    assert.ok(names.length >= 3);
    for (const f of names) {
      const meta = parseSkillMd(read(join(ROOT, "commands", f)));
      assert.deepEqual(meta.errors, [], f);
      assert.equal(meta.name, f.replace(/\.md$/, ""), `${f}: name must equal the file name`);
      assert.ok(meta.description && meta.description.length > 20, `${f}: needs a description`);
      assert.ok(meta.body.trim().length > 40, `${f}: needs instructions`);
    }
  });

  it("every skill a command loads exists", () => {
    for (const f of commandFiles()) {
      const body = read(join(ROOT, "commands", f));
      for (const m of body.matchAll(/`([a-z][a-z0-9-]+)` skill/g)) assert.ok(KNOWN_SKILLS.has(m[1]), `${f} loads unknown skill ${m[1]}`);
      for (const m of body.matchAll(/[Ll]oad the `([a-z][a-z0-9-]+)`/g)) assert.ok(KNOWN_SKILLS.has(m[1]), `${f} loads unknown skill ${m[1]}`);
    }
  });

  it("every CLI command a command runs exists", () => {
    for (const f of commandFiles()) {
      const body = read(join(ROOT, "commands", f));
      for (const m of body.matchAll(/`(?:npx )?magik-harness ([a-z]+)/g)) assert.ok(CLI_COMMANDS.has(m[1]), `${f} runs unknown CLI command "magik-harness ${m[1]}"`);
    }
  });
});

describe("packaging", () => {
  it("every path npm would publish exists (a missing one silently ships less)", () => {
    const pkg = JSON.parse(read(join(ROOT, "package.json"))) as { files: string[]; bin: Record<string, string> };
    for (const f of pkg.files) assert.ok(has(join(ROOT, f)), `package.json#files lists ${f}, which does not exist`);
    for (const target of Object.values(pkg.bin)) assert.ok(has(join(ROOT, target)), `bin ${target} does not exist`);
  });

  it("the plugin installer copies only paths that exist, and installs and removes cleanly", () => {
    const src = read(join(ROOT, "scripts", "install-plugin.mjs"));
    const list = /const INCLUDE = \[([^\]]+)\]/.exec(src);
    assert.ok(list, "INCLUDE list found");
    for (const m of list[1].matchAll(/"([^"]+)"/g)) assert.ok(has(join(ROOT, m[1])), `install-plugin copies ${m[1]}, which does not exist`);

    const target = join(tmp("plugin-target"), "magik-harness");
    const run = (...args: string[]) => spawnSync(process.execPath, [join(ROOT, "scripts", "install-plugin.mjs"), ...args], { encoding: "utf8" });
    const installed = run("--target", target);
    assert.equal(installed.status, 0, installed.stderr);
    for (const f of [".cursor-plugin/plugin.json", "commands/magik-harness-doctor.md", "skills/harness/SKILL.md", "assets/magik-harness-logo.png", "package.json"]) {
      assert.ok(has(join(target, f)), `${f} was copied`);
    }
    assert.ok(!has(join(target, "src")), "the plugin carries skills and commands, not the CLI");
    assert.ok(files(target).every((f) => !f.startsWith("tests/") && !f.startsWith("node_modules/")));

    const removed = run("--uninstall", "--target", target);
    assert.equal(removed.status, 0, removed.stderr);
    assert.ok(!has(target));
    assert.equal(run("--uninstall", "--target", target).status, 0, "removing twice is fine");
  });

  it("never targets the 1.x plugin folder by default", () => {
    const src = read(join(ROOT, "scripts", "install-plugin.mjs"));
    assert.ok(src.includes('"magik-harness"'), "installs to .../plugins/local/magik-harness");
    assert.ok(!/plugins["',\s]+local["',\s]+magik-repo/.test(src), "must not overwrite the 1.x plugin");
  });
});
