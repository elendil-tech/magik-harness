/**
 * tests/docs.test.ts: the documentation keeps up with the code.
 *
 * Docs rot in three ways that a test can catch cheaply: a link or anchor that
 * no longer resolves, a command or option the CLI has that the reference does
 * not mention, and an environment variable named in prose that no code reads.
 */

import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { describe, it } from "node:test";

import { HELP } from "../src/cli.js";
import { DOCTOR_HELP } from "../src/commands/doctor.js";
import { INIT_HELP } from "../src/commands/init.js";
import { INSTALL_HELP } from "../src/commands/install.js";
import { UNINSTALL_HELP } from "../src/commands/uninstall.js";
import { ROOT } from "./_helpers.ts";

const text = (rel: string) => readFileSync(join(ROOT, rel), "utf8");

/** The markdown that describes the product. */
function docFiles(): string[] {
  const out = ["README.md", "CHANGELOG.md", "ROADMAP.md"];
  for (const f of readdirSync(join(ROOT, "docs"))) if (f.endsWith(".md")) out.push(`docs/${f}`);
  const walk = (dir: string) => {
    for (const name of readdirSync(join(ROOT, dir))) {
      const rel = `${dir}/${name}`;
      if (statSync(join(ROOT, rel)).isDirectory()) walk(rel);
      else if (name.endsWith(".md")) out.push(rel);
    }
  };
  for (const dir of ["skills", "packs"]) walk(dir);
  return out;
}

/** GitHub's heading slug: lower case, punctuation dropped, each space a hyphen. */
function slug(heading: string): string {
  return heading
    .replace(/`/g, "")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s_-]/gu, "")
    .replace(/\s/g, "-");
}

/** Headings outside code fences. */
function headings(markdown: string): string[] {
  const out: string[] = [];
  let fenced = false;
  for (const line of markdown.split("\n")) {
    if (/^\s*```/.test(line)) fenced = !fenced;
    else if (!fenced) {
      const m = line.match(/^#{1,6}\s+(.*?)\s*#*\s*$/);
      if (m) out.push(slug(m[1]));
    }
  }
  return out;
}

/** `[label](target)` links outside code fences, with their line numbers. */
function links(markdown: string): { target: string; line: number }[] {
  const out: { target: string; line: number }[] = [];
  let fenced = false;
  markdown.split("\n").forEach((line, i) => {
    if (/^\s*```/.test(line)) {
      fenced = !fenced;
      return;
    }
    if (fenced) return;
    const bare = line.replace(/`[^`]*`/g, "");
    for (const m of bare.matchAll(/\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g)) out.push({ target: m[1], line: i + 1 });
  });
  return out;
}

describe("links", () => {
  for (const file of docFiles()) {
    it(`${file}: every relative link and anchor resolves`, () => {
      const source = text(file);
      const own = new Set(headings(source));
      const broken: string[] = [];
      for (const { target, line } of links(source)) {
        if (/^(https?:|mailto:)/.test(target)) continue;
        const [path, anchor] = target.split("#");
        const dest = path ? resolve(dirname(join(ROOT, file)), path) : join(ROOT, file);
        if (path && !existsSync(dest)) {
          broken.push(`${file}:${line} -> ${target} (no such file: ${relative(ROOT, dest)})`);
          continue;
        }
        if (anchor && (!path || dest.endsWith(".md"))) {
          const slugs = path ? new Set(headings(readFileSync(dest, "utf8"))) : own;
          if (!slugs.has(anchor)) broken.push(`${file}:${line} -> ${target} (no heading "${anchor}")`);
        }
      }
      assert.deepEqual(broken, []);
    });
  }
});

describe("the CLI reference", () => {
  const cliDoc = text("docs/CLI.md");

  it("documents every command", () => {
    const commands = [...HELP.matchAll(/^ {2}([a-z]+) {2,}\S/gm)].map((m) => m[1]);
    assert.ok(commands.length >= 9, `expected the command list in the help text, got ${commands.join(", ")}`);
    for (const c of commands) assert.ok(cliDoc.includes(`magik-harness ${c}`), `docs/CLI.md never shows "magik-harness ${c}"`);
  });

  it("documents every option of install, uninstall, doctor and init", () => {
    const missing: string[] = [];
    for (const [name, help] of [["install", INSTALL_HELP], ["uninstall", UNINSTALL_HELP], ["doctor", DOCTOR_HELP], ["init", INIT_HELP]] as const) {
      for (const m of help.matchAll(/^\s{2}(--[a-z-]+)/gm)) if (!cliDoc.includes(m[1])) missing.push(`${name} ${m[1]}`);
    }
    assert.deepEqual(missing, [], "options that the help text lists and docs/CLI.md does not mention");
  });

  it("names the right exit codes", () => {
    assert.match(cliDoc, /`0` success[^|]*`1`[^|]*`2` usage error/);
  });
});

describe("environment variables", () => {
  it("every MAGIK_* variable named in the docs is read by the code", () => {
    const code = ["src", "runtime", "bin"]
      .flatMap((dir) => readdirSync(join(ROOT, dir), { recursive: true, withFileTypes: true }).filter((e) => e.isFile()).map((e) => readFileSync(join(e.parentPath ?? (e as unknown as { path: string }).path, e.name), "utf8")))
      .join("\n");
    const unknown: string[] = [];
    for (const file of docFiles().filter((f) => !f.startsWith("skills/") && !f.startsWith("packs/"))) {
      for (const m of new Set(text(file).match(/\bMAGIK_[A-Z_]+\b/g) ?? [])) if (!code.includes(m)) unknown.push(`${file}: ${m}`);
    }
    assert.deepEqual(unknown, []);
  });
});
