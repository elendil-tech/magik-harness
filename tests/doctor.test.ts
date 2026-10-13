/**
 * tests/doctor.test.ts: `magik-harness doctor`.
 *
 * Doctor is what a person (or a CI job) runs when something feels off, so each
 * way an install can rot has a test: a missing file, a hook nobody registered,
 * a vault that is not there, a managed path that git ignores. Every failure
 * must say what is wrong and, when there is one, the command that fixes it.
 */

import assert from "node:assert/strict";
import { mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";

import { PLUGIN_VERSION } from "./_version.ts";
import { cli, has, project, read, readJson, repo, tmp, write } from "./_helpers.ts";
import type { Project } from "./_helpers.ts";

const run = (p: Project, args: string[], env?: Record<string, string | undefined>) => cli(args, { cwd: p.app, home: p.home, env });

async function installed(extra: string[] = []): Promise<Project> {
  const p = project();
  const r = await run(p, ["install", "--yes", "--vault", p.vault, ...extra]);
  assert.equal(r.code, 0, r.err);
  return p;
}

interface Check {
  area: string;
  level: "ok" | "info" | "warn" | "fail";
  message: string;
  fix?: string;
}
async function checks(p: Project, args: string[] = [], env?: Record<string, string | undefined>) {
  const r = await run(p, ["doctor", "--json", ...args], env);
  const doc = JSON.parse(r.out) as { command: string; version: string; ok: boolean; failures: number; warnings: number; checks: Check[] };
  return { ...r, doc };
}

describe("a healthy install", () => {
  it("passes, says so, and has nothing to warn about", async () => {
    const p = await installed();
    const r = await run(p, ["doctor"]);
    assert.equal(r.code, 0, r.out + r.err);
    assert.match(r.out, /Healthy: 0 failure\(s\), 0 warning\(s\)\./);
    assert.match(r.out, new RegExp(`installed v${PLUGIN_VERSION.replace(/\./g, "\\.")}: profile knowledge, tools cursor`));
    assert.match(r.out, /managed files present/);
    assert.match(r.out, /hook registered in \.cursor\/hooks\.json/);
    assert.match(r.out, /session hook runs/);
    assert.match(r.out, /8 skill folder\(s\) checked, all valid/);
    assert.match(r.out, /primer present in AGENTS\.md/);
    assert.match(r.out, /no managed path is git-ignored/);
    assert.match(r.out, /up to date with this CLI/);
  });

  it("--json is stable and machine-readable", async () => {
    const p = await installed();
    const { code, doc } = await checks(p);
    assert.equal(code, 0);
    assert.equal(doc.command, "doctor");
    assert.equal(doc.version, PLUGIN_VERSION);
    assert.equal(doc.ok, true);
    assert.equal(doc.failures, 0);
    assert.equal(doc.warnings, 0);
    assert.ok(doc.checks.length >= 8);
    for (const c of doc.checks) {
      assert.ok(["resolution", "project install", "global install", "legacy", "summary"].includes(c.area), `unexpected area ${c.area}`);
      assert.ok(["ok", "info", "warn", "fail"].includes(c.level));
      assert.equal(typeof c.message, "string");
    }
  });

  it("checks the whole machine by default and only the project with --scope project", async () => {
    const p = await installed();
    const all = await checks(p);
    assert.ok(all.doc.checks.some((c) => c.area === "global install" && c.level === "info" && /not installed/.test(c.message)));
    const only = await checks(p, ["--scope", "project"]);
    assert.ok(!only.doc.checks.some((c) => c.area === "global install"));
    const global = await checks(p, ["--scope", "global"]);
    assert.ok(!global.doc.checks.some((c) => c.area === "project install"));
    assert.equal(global.code, 0, "a missing global install is information, not a failure");
  });
});

describe("what makes it fail", () => {
  it("a managed file that is missing, with the command that restores it", async () => {
    const p = await installed();
    rmSync(join(p.app, ".agents/skills/harness/SKILL.md"));
    const r = await run(p, ["doctor"]);
    assert.equal(r.code, 1);
    assert.match(r.out, /FAIL 1 managed file\(s\) missing, e\.g\. \.agents\/skills\/harness\/SKILL\.md/);
    assert.match(r.out, /fix: magik-harness upgrade/);
    assert.match(r.out, /Not healthy: 1 failure\(s\)/);

    assert.equal((await run(p, ["upgrade", "--yes"])).code, 0);
    assert.equal((await run(p, ["doctor"])).code, 0, "upgrade restores what doctor reported");
  });

  it("a session hook that is not registered", async () => {
    const p = await installed();
    write(join(p.app, ".cursor/hooks.json"), JSON.stringify({ version: 1, hooks: {} }, null, 2) + "\n");
    const { code, doc } = await checks(p);
    assert.equal(code, 1);
    assert.equal(doc.ok, false);
    const bad = doc.checks.find((c) => c.level === "fail");
    assert.match(bad?.message ?? "", /session hook is not registered in \.cursor\/hooks\.json/);
    assert.equal(bad?.fix, "magik-harness upgrade");
  });

  it("a hook file that is deleted or not valid JSON", async () => {
    const p = await installed();
    write(join(p.app, ".cursor/hooks.json"), "{ not json");
    const bad = await checks(p);
    assert.equal(bad.code, 1);
    assert.ok(bad.doc.checks.some((c) => c.level === "fail" && /is not valid JSON/.test(c.message)));
    rmSync(join(p.app, ".cursor/hooks.json"));
    const gone = await checks(p);
    assert.equal(gone.code, 1);
    assert.ok(gone.doc.checks.some((c) => c.level === "fail" && /\.cursor\/hooks\.json is missing/.test(c.message)));
  });

  it("a vault that does not exist (a repo cloned without its vault)", async () => {
    const p = await installed();
    rmSync(p.vault, { recursive: true, force: true });
    const r = await run(p, ["doctor"]);
    assert.equal(r.code, 1);
    assert.match(r.out, /FAIL vault .*vault does not exist/);
  });

  it("a tracked pointer that names the vault by an absolute path under the home directory", async () => {
    const p = await installed();
    const pointer = join(p.app, ".magik", "harness.json");
    const doc = readJson(pointer);
    doc.vault = p.vault; // /<home>/vault: correct here, wrong on every other machine
    write(pointer, JSON.stringify(doc, null, 2) + "\n");
    const { doc: d, code } = await checks(p);
    assert.equal(code, 0, "a warning, not a failure");
    const w = d.checks.find((c) => c.level === "warn" && /absolute path under your home directory/.test(c.message));
    assert.ok(w, JSON.stringify(d.checks));
    assert.equal(w.fix, 'edit .magik/harness.json: "vault": "~/vault"');
    // and the portable spelling is clean
    doc.vault = "~/vault";
    write(pointer, JSON.stringify(doc, null, 2) + "\n");
    assert.ok(!(await checks(p)).doc.checks.some((c) => /absolute path under your home/.test(c.message)));
  });

  it("a primer block that was removed from AGENTS.md", async () => {
    const p = await installed();
    write(join(p.app, "AGENTS.md"), "# just mine\n");
    const r = await run(p, ["doctor"]);
    assert.equal(r.code, 1);
    assert.match(r.out, /AGENTS\.md has no harness primer block/);
  });

  it("managed paths that git ignores, because clones and worktrees would not get them", async () => {
    const p = await installed();
    write(join(p.app, ".gitignore"), read(join(p.app, ".gitignore")) + "\n.agents/\n");
    const r = await run(p, ["doctor"]);
    assert.equal(r.code, 1);
    assert.match(r.out, /managed path\(s\) are git-ignored/);
    assert.match(r.out, /--skills-dir/);
  });

  it("a lock file that cannot be read", async () => {
    const p = await installed();
    write(join(p.app, ".magik/lock.json"), "garbage");
    const r = await run(p, ["doctor"]);
    assert.equal(r.code, 1);
    assert.match(r.out, /lock file unreadable/);
  });
});

describe("what only warns", () => {
  it("a skill that no longer follows the format: exit 0, but --strict turns it into exit 1", async () => {
    const p = await installed();
    const skill = join(p.app, ".agents/skills/kb-search/SKILL.md");
    write(skill, read(skill).replace(/^name: .*\n/m, ""));
    const loose = await checks(p);
    assert.equal(loose.code, 0);
    assert.equal(loose.doc.warnings, 1);
    assert.ok(loose.doc.checks.some((c) => c.level === "warn" && /skill kb-search .*`name` is missing/.test(c.message)));
    assert.ok(loose.doc.checks.some((c) => c.level === "info" && /edited locally/.test(c.message)), "an edited managed file is information");

    const strict = await checks(p, ["--strict"]);
    assert.equal(strict.code, 1);
    assert.equal(strict.doc.ok, false);
  });

  it("an install written by an older version of the CLI", async () => {
    const p = await installed();
    const lockPath = join(p.app, ".magik/lock.json");
    const lock = readJson(lockPath);
    lock.version = "1.0.0";
    write(lockPath, JSON.stringify(lock, null, 2) + "\n");
    const { code, doc } = await checks(p);
    assert.equal(code, 0);
    const w = doc.checks.find((c) => c.level === "warn");
    assert.match(w?.message ?? "", new RegExp(`installed v1\\.0\\.0, this CLI is v${PLUGIN_VERSION.replace(/\./g, "\\.")}`));
    assert.equal(w?.fix, "magik-harness upgrade");
  });

  it("a pack whose script needs a command this machine does not have", async () => {
    const p = project();
    const empty = tmp("empty-path");
    mkdirSync(empty, { recursive: true });
    const env = { PATH: empty };
    const i = await run(p, ["install", "--yes", "--vault", p.vault, "--packs", "ci-runners"], env);
    assert.equal(i.code, 0, i.err);
    assert.match(i.out, /pack ci-runners needs `gh` on PATH/);

    const { code, doc } = await checks(p, [], env);
    assert.equal(code, 0, "a missing helper tool is a warning, not a failure");
    assert.ok(doc.checks.some((c) => c.level === "warn" && /pack ci-runners needs `gh` on PATH/.test(c.message)));
    assert.equal((await checks(p, ["--strict"], env)).code, 1);
  });
});

describe("where there is nothing to check", () => {
  it("a plain repository: informational, exit 0, and the one command that starts things", async () => {
    const m = tmp("plain");
    const plain = repo(m, "plain");
    const home = join(m, "home");
    mkdirSync(home, { recursive: true });
    const r = await cli(["doctor"], { cwd: plain, home });
    assert.equal(r.code, 0, r.out + r.err);
    assert.match(r.out, /no harness resolves for this project/);
    assert.match(r.out, /the harness is not installed in this project or on this machine/);
    assert.match(r.out, /fix: magik-harness install --vault <dir>/);
    assert.ok(!has(join(plain, ".magik")), "doctor never writes");
  });

  it("is read-only even on a broken install", async () => {
    const p = await installed();
    rmSync(join(p.app, ".agents/skills/harness/SKILL.md"));
    const before = read(join(p.app, ".magik/lock.json"));
    await run(p, ["doctor"]);
    assert.equal(read(join(p.app, ".magik/lock.json")), before);
    assert.ok(!has(join(p.app, ".agents/skills/harness/SKILL.md")), "doctor reports; it does not repair");
  });
});

describe("usage", () => {
  it("rejects a bad --scope and stray arguments with exit 2", async () => {
    const p = await installed();
    const a = await run(p, ["doctor", "--scope", "everywhere"]);
    assert.equal(a.code, 2);
    assert.match(a.err, /--scope must be project, global or all/);
    const b = await run(p, ["doctor", "extra"]);
    assert.equal(b.code, 2);
    assert.match(b.err, /unexpected argument "extra"/);
  });

  it("--project-root checks another project from anywhere", async () => {
    const p = await installed();
    const elsewhere = tmp("elsewhere");
    const r = await cli(["doctor", "--project-root", p.app], { cwd: elsewhere, home: p.home });
    assert.equal(r.code, 0, r.out + r.err);
    assert.match(r.out, /installed v/);
  });
});
