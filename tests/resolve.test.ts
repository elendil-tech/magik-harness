/**
 * tests/resolve.test.ts: how a directory becomes "which vault, which stores".
 *
 * The resolver is the heart of the harness and the thing every other surface
 * (hook, doctor, `resolve`) shares, so its rules are pinned here: the
 * precedence between a project pointer and the machine-level convention, the
 * overlay, worktrees, and, above all, that a configured but
 * broken harness is LOUD (warnings) while "no harness at all" is silent.
 */

import assert from "node:assert/strict";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";

import { deepMerge, expandPath, projectInfo, resolveHarness } from "../runtime/resolve.mjs";
import { git, machine, repo, tmp, vaultWith, write } from "./_helpers.ts";

/** A machine with one committed project `app` and, optionally, a vault. */
function setup(opts: { vault?: boolean } = {}) {
  const m = machine();
  const projects = join(m.root, "Projects");
  const app = repo(projects, "app");
  const vault = join(m.home, "vault");
  if (opts.vault !== false) vaultWith(vault, "app");
  return { ...m, app, vault };
}

function pointer(app: string, doc: Record<string, unknown>, file = ".magik/harness.json") {
  write(join(app, file), JSON.stringify(doc, null, 2));
}

const BASIC = {
  schema: "magik-harness/harness@2",
  vault: "~/vault",
  knowledge: { mount: "app/knowledge", accessVia: "path", autonomy: "open" },
  memory: { mount: "app/memory", accessVia: "path" },
};

describe("no harness", () => {
  it("is silent: not active, no warnings, no notes", () => {
    const { home, app } = setup();
    const r = resolveHarness({ cwd: app, home, env: {} });
    assert.equal(r.active, false);
    assert.equal(r.source, "none");
    assert.deepEqual(r.warnings, []);
    assert.deepEqual(r.notes, []);
  });

  it("works outside a git repo, using the folder name as the project", () => {
    const dir = tmp("plain");
    const info = projectInfo(dir);
    assert.equal(info.isGit, false);
    assert.equal(info.projectRoot, dir);
    assert.equal(resolveHarness({ cwd: dir, home: dir, env: {} }).active, false);
  });
});

describe("project pointer", () => {
  it("resolves the vault, both stores and the default autonomy", () => {
    const { home, app, vault } = setup();
    pointer(app, BASIC);
    const r = resolveHarness({ cwd: app, home, env: {} });
    assert.equal(r.active, true);
    assert.equal(r.source, "project");
    assert.equal(r.projectName, "app");
    assert.equal(r.vaultDir, vault);
    assert.equal(r.knowledge?.dir, join(vault, "app", "knowledge"));
    assert.equal(r.memory?.dir, join(vault, "app", "memory"));
    assert.equal(r.knowledge?.autonomy, "open");
    assert.deepEqual(r.warnings, []);
  });

  it("accepts the three autonomy levels and falls back to open for anything else", () => {
    const { home, app } = setup();
    for (const [given, want] of [["readonly", "readonly"], ["ask", "ask"], ["open", "open"], ["bogus", "open"], [undefined, "open"]] as const) {
      pointer(app, { ...BASIC, knowledge: { ...BASIC.knowledge, autonomy: given } });
      assert.equal(resolveHarness({ cwd: app, home, env: {} }).knowledge?.autonomy, want, `autonomy ${String(given)}`);
    }
  });

  it("applies the local overlay on top, field by field", () => {
    const { home, app, root } = setup();
    pointer(app, BASIC);
    vaultWith(join(root, "other-vault"), "app");
    pointer(app, { vault: join(root, "other-vault"), knowledge: { autonomy: "readonly" } }, ".magik/harness.local.json");
    const r = resolveHarness({ cwd: app, home, env: {} });
    assert.equal(r.vaultDir, join(root, "other-vault"));
    assert.equal(r.knowledge?.autonomy, "readonly");
    assert.equal(r.knowledge?.mount, "app/knowledge", "fields the overlay does not mention survive");
    assert.ok(r.overlayPath?.endsWith("harness.local.json"));
  });

  it("ignores an overlay that has no tracked pointer to apply to", () => {
    const { home, app } = setup();
    pointer(app, { vault: "~/vault" }, ".magik/harness.local.json");
    const r = resolveHarness({ cwd: app, home, env: {} });
    assert.equal(r.active, false);
    assert.ok(r.notes.some((n) => /without a tracked pointer/.test(n)));
  });

  it("only looks for the pointer at .magik/harness.json", () => {
    const { home, app } = setup();
    pointer(app, BASIC, ".cursor/harness.json");
    const elsewhere = resolveHarness({ cwd: app, home, env: {} });
    assert.equal(elsewhere.active, false, "a pointer anywhere else is invisible");
    assert.equal(elsewhere.pointerPath, null);
    pointer(app, BASIC);
    assert.equal(resolveHarness({ cwd: app, home, env: {} }).active, true);
  });

  it("notes an unknown schema but still reads the file", () => {
    const { home, app } = setup();
    pointer(app, { ...BASIC, schema: "someone-else/thing@9" });
    const r = resolveHarness({ cwd: app, home, env: {} });
    assert.equal(r.active, true);
    assert.ok(r.notes.some((n) => /not recognised/.test(n)));
  });

  it("is loud when the vault is missing", () => {
    const { home, app } = setup({ vault: false });
    pointer(app, BASIC);
    const r = resolveHarness({ cwd: app, home, env: {} });
    assert.equal(r.active, true);
    assert.equal(r.vaultExists, false);
    assert.equal(r.warnings.length, 1);
    assert.match(r.warnings[0], /Vault not found/);
    assert.match(r.warnings[0], /harness\.local\.json/, "the warning says how to fix it");
  });

  it("is loud about a pointer it cannot parse, and keeps the harness active so the problem is visible", () => {
    const { home, app } = setup();
    write(join(app, ".magik", "harness.json"), "{ not json");
    const r = resolveHarness({ cwd: app, home, env: {} });
    assert.equal(r.active, true);
    assert.match(r.warnings[0], /not valid JSON/);
  });

  it("warns about a broken overlay without losing the pointer", () => {
    const { home, app } = setup();
    pointer(app, BASIC);
    write(join(app, ".magik", "harness.local.json"), "oops");
    const r = resolveHarness({ cwd: app, home, env: {} });
    assert.equal(r.vaultDir, join(home, "vault"));
    assert.ok(r.warnings.some((w) => /overlay/.test(w)));
  });

  it("warns when a path store has no vault to live in", () => {
    const { home, app } = setup();
    pointer(app, { ...BASIC, vault: null });
    const r = resolveHarness({ cwd: app, home, env: {} });
    assert.ok(r.warnings.some((w) => /no `vault`/.test(w)));
  });

  it("treats stores reached over MCP as remote: no directory, no warning", () => {
    const { home, app } = setup({ vault: false });
    pointer(app, { schema: "magik-harness/harness@2", vault: null, knowledge: { mount: "kb-logical-id", accessVia: "mcp" }, memory: { mount: "mem-id", accessVia: "mcp" } });
    const r = resolveHarness({ cwd: app, home, env: {} });
    assert.equal(r.active, true);
    assert.equal(r.knowledge?.accessVia, "mcp");
    assert.equal(r.knowledge?.dir, null);
    assert.deepEqual(r.warnings, []);
  });

  it("resolves extra mounts and flags a missing one", () => {
    const { home, app, vault } = setup();
    vaultWith(vault, "shared");
    pointer(app, { ...BASIC, mounts: [{ name: "shared-kb", role: "knowledge", mount: "shared/knowledge" }, { name: "gone", role: "knowledge", mount: "nope/knowledge" }] });
    const r = resolveHarness({ cwd: app, home, env: {} });
    assert.deepEqual(r.mounts.map((s) => [s.name, s.exists]), [["shared-kb", true], ["gone", false]]);
    assert.ok(r.warnings.some((w) => /Mount "gone" not found/.test(w)));
  });

  it("reads the memory injection cap from the pointer and ignores nonsense", () => {
    const { home, app } = setup();
    pointer(app, BASIC);
    assert.equal(resolveHarness({ cwd: app, home, env: {} }).memoryInject.maxBytes, 4000);
    pointer(app, { ...BASIC, memory: { ...BASIC.memory, inject: { maxBytes: 1234 } } });
    assert.equal(resolveHarness({ cwd: app, home, env: {} }).memoryInject.maxBytes, 1234);
    pointer(app, { ...BASIC, memory: { ...BASIC.memory, inject: { maxBytes: -5 } } });
    assert.equal(resolveHarness({ cwd: app, home, env: {} }).memoryInject.maxBytes, 4000);
    pointer(app, { ...BASIC, memory: { ...BASIC.memory, inject: { maxBytes: "lots" } } });
    assert.equal(resolveHarness({ cwd: app, home, env: {} }).memoryInject.maxBytes, 4000);
  });

  it("resolves a linked git worktree to the same project, with the pointer it checked out", () => {
    const { home, app, root } = setup();
    pointer(app, BASIC);
    git(app, "add", "-A");
    git(app, "commit", "-q", "-m", "pointer");
    mkdirSync(join(root, "worktrees"), { recursive: true });
    const wt = join(root, "worktrees", "feature");
    git(app, "worktree", "add", "-q", wt, "-b", "feature");
    const r = resolveHarness({ cwd: wt, home, env: {} });
    assert.equal(r.projectName, "app", "named after the primary checkout, not the worktree folder");
    assert.equal(r.isLinkedWorktree, true);
    assert.equal(r.active, true);
    assert.equal(r.vaultDir, join(home, "vault"));
  });
});

describe("machine-level convention (global config)", () => {
  function config(home: string, doc: Record<string, unknown>) {
    write(join(home, ".magik", "config.json"), JSON.stringify({ schema: "magik-harness/config@1", layout: "per-project", ...doc }));
  }

  it("is active only for projects that have a folder in the vault", () => {
    const { home, app, root } = setup();
    config(home, { vault: "~/vault" });
    const r = resolveHarness({ cwd: app, home, env: {} });
    assert.equal(r.active, true);
    assert.equal(r.source, "global");
    assert.equal(r.knowledge?.dir, join(home, "vault", "app", "knowledge"));
    assert.equal(r.memory?.dir, join(home, "vault", "app", "memory"));

    const other = repo(join(root, "Projects"), "unrelated");
    const o = resolveHarness({ cwd: other, home, env: {} });
    assert.equal(o.active, false, "no folder in the vault, so the harness stays out of the way");
    assert.ok(o.notes.some((n) => /No folder "unrelated"/.test(n)));
    assert.deepEqual(o.warnings, []);
  });

  it("maps a repo to a differently named vault folder", () => {
    const { home, app, vault } = setup({ vault: false });
    vaultWith(vault, "app-notes");
    config(home, { vault: "~/vault", projects: { app: "app-notes" } });
    const r = resolveHarness({ cwd: app, home, env: {} });
    assert.equal(r.active, true);
    assert.equal(r.knowledge?.dir, join(vault, "app-notes", "knowledge"));
  });

  it("a project's own pointer wins over the convention", () => {
    const { home, app, root } = setup();
    config(home, { vault: "~/vault" });
    vaultWith(join(root, "team-vault"), "app");
    pointer(app, { ...BASIC, vault: join(root, "team-vault") });
    const r = resolveHarness({ cwd: app, home, env: {} });
    assert.equal(r.source, "project");
    assert.equal(r.vaultDir, join(root, "team-vault"));
  });

  it("does not warn about a machine whose global vault is simply not there", () => {
    const { home, app } = setup({ vault: false });
    config(home, { vault: "~/vault" });
    const r = resolveHarness({ cwd: app, home, env: {} });
    assert.equal(r.active, false);
    assert.deepEqual(r.warnings, []);
  });

  it("reports an unreadable global config", () => {
    const { home, app } = setup();
    write(join(home, ".magik", "config.json"), "{ nope");
    const r = resolveHarness({ cwd: app, home, env: {} });
    assert.ok(r.warnings.some((w) => /Global config .* is unreadable/.test(w)));
  });

  it("takes the memory cap and git policy from the config, and a pointer can override them", () => {
    const { home, app } = setup();
    config(home, { vault: "~/vault", memory: { inject: { maxBytes: 999 } }, git: "never" });
    pointer(app, BASIC);
    const fromConfig = resolveHarness({ cwd: app, home, env: {} });
    assert.equal(fromConfig.memoryInject.maxBytes, 999);
    assert.equal(fromConfig.gitPolicy, "never");
    pointer(app, { ...BASIC, git: "always", memory: { ...BASIC.memory, inject: { maxBytes: 50 } } });
    const overridden = resolveHarness({ cwd: app, home, env: {} });
    assert.equal(overridden.memoryInject.maxBytes, 50);
    assert.equal(overridden.gitPolicy, "always");
  });

  it("honours MAGIK_HOME for the config location", () => {
    const { home, app, root } = setup();
    write(join(root, "alt-magik", "config.json"), JSON.stringify({ vault: "~/vault" }));
    const r = resolveHarness({ cwd: app, home, env: { MAGIK_HOME: join(root, "alt-magik") } });
    assert.equal(r.source, "global");
  });
});

describe("helpers", () => {
  it("expandPath handles ~, relative and absolute paths", () => {
    const home = join(tmp("home"));
    const base = join(home, "base");
    assert.equal(expandPath("~", home, base), home);
    assert.equal(expandPath("~/v", home, base), join(home, "v"));
    assert.equal(expandPath("../v", home, base), join(home, "v"));
    assert.equal(expandPath(join(home, "abs"), "/elsewhere", base), join(home, "abs"));
  });

  it("deepMerge merges objects, replaces arrays and scalars, ignores undefined, lets null replace", () => {
    assert.deepEqual(deepMerge({ a: { b: 1, c: 2 }, d: [1, 2] }, { a: { b: 9 }, d: [3] }), { a: { b: 9, c: 2 }, d: [3] });
    assert.deepEqual(deepMerge({ a: 1 }, { a: undefined, b: 2 }), { a: 1, b: 2 });
    assert.deepEqual(deepMerge({ a: { x: 1 } }, { a: null }), { a: null });
  });
});
