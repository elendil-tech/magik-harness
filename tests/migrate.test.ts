/**
 * tests/migrate.test.ts: upgrading a magik-repo 1.x project to magik-harness 2.
 *
 * The fixture under tests/fixtures/v1-install is a byte-accurate install made
 * by the real 1.9.1 installer, with user content around it (a line of
 * AGENTS.md, ignore rules above the managed block). The promises: one
 * `install` migrates everything, nothing of yours is lost, a script you edited
 * is never deleted behind your back, and doctor tells you where things stand.
 */

import assert from "node:assert/strict";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";

import { collectCommands } from "../src/commands/doctor.js";
import { cli, contextOf, files, git, has, hook, installV1Fixture, project, read, readJson, write } from "./_helpers.ts";
import type { Project } from "./_helpers.ts";

const CURSOR_CMD = "node .magik/runtime/session-start.mjs --format cursor";
const LEGACY_CMD = "node .cursor/hooks/session-start.js";
const USER_AGENTS_TEXT = "# My project\n\nBuild with `make`.\n";
const TODAY = "2026-03-04";

/** A project exactly as 1.9.1 left it, committed, with its (version-1 layout) vault in place. */
function v1Project(): Project {
  const p = project();
  installV1Fixture(p.app);
  git(p.app, "add", "-A");
  git(p.app, "commit", "-q", "-m", "magik-repo 1.9.1");
  mkdirSync(join(p.vault, "knowledge"), { recursive: true });
  write(join(p.vault, "memory", "daily", `${TODAY}.md`), "- [note] written under 1.x\n");
  return p;
}

const run = (p: Project, args: string[]) => cli(args, { cwd: p.app, home: p.home });
const migrate = (p: Project, args: string[] = []) => run(p, ["install", "--yes", ...args]);
const snapshot = (p: Project) => Object.fromEntries(files(p.app).filter((f) => !f.startsWith(".magik/backups/")).map((f) => [f, read(join(p.app, f))]));

describe("a clean 1.9.1 install", () => {
  it("is migrated in one install, keeping the vault layout and everything of yours", async () => {
    const p = v1Project();
    const r = await migrate(p);
    assert.equal(r.code, 0, r.err);

    const pointer = readJson(join(p.app, ".magik/harness.json"));
    assert.equal(pointer.schema, "magik-harness/harness@2");
    assert.equal(pointer.vault, "~/vault");
    assert.deepEqual(pointer.knowledge, { mount: "knowledge", accessVia: "path", autonomy: "open" }, "the 1.x mounts are kept, not rewritten to the new layout");
    assert.deepEqual(pointer.memory, { mount: "memory", accessVia: "path" });
    assert.equal(readJson(join(p.app, ".magik/lock.json")).profile, "knowledge", "a vault is known, so it is the knowledge profile");

    assert.ok(!has(join(p.app, ".cursor/harness.json")), "the old pointer moved");
    assert.ok(!has(join(p.app, ".cursor/hooks/session-start.js")), "the old hook script (an unedited release) is gone");
    assert.deepEqual(readJson(join(p.app, ".cursor/hooks.json")), { version: 1, hooks: { sessionStart: [{ command: CURSOR_CMD }] } }, "its registration was replaced, not duplicated");

    const agents = read(join(p.app, "AGENTS.md"));
    assert.match(agents, /^<!-- magik-harness:primer:start v=/);
    assert.ok(!/<!-- harness:primer/.test(agents), "no 1.x marker left");
    assert.ok(agents.endsWith(USER_AGENTS_TEXT), "your own AGENTS.md text is still there, after the block");
    assert.equal(agents.match(/magik-harness:primer:start/g)?.length, 1);

    const ignore = read(join(p.app, ".gitignore"));
    assert.ok(ignore.startsWith("node_modules/\n.env\n"), "ignore rules above the block are untouched");
    assert.match(ignore, /# magik-harness:gitignore:start/);
    assert.ok(!/# harness:gitignore/.test(ignore), "no 1.x marker left");
    assert.match(ignore, /# Kept from magik-repo 1\.x \(not managed; edit or delete freely\):/);
    for (const line of [".cursor/telemetry/", ".cursor/mcp.local.json", ".DS_Store", ".idea/"]) {
      assert.ok(ignore.split("\n").includes(line), `${line} survives under the kept section`);
    }
  });

  it("leaves a healthy project: doctor passes, the hook runs, and a second install changes nothing", async () => {
    const p = v1Project();
    await migrate(p);
    const d = await run(p, ["doctor"]);
    assert.equal(d.code, 0, d.out);
    assert.match(d.out, /Healthy: 0 failure\(s\), 0 warning\(s\)\./);
    assert.ok(!/1\.x leftovers/.test(d.out));

    const ran = hook(["--format", "text"], { cwd: p.app, home: p.home, script: join(p.app, ".magik/runtime/session-start.mjs"), env: { MAGIK_TODAY: TODAY } });
    assert.match(contextOf(ran.stdout), /written under 1\.x/, "memory written by 1.x is still read");

    const before = snapshot(p);
    const again = await migrate(p);
    assert.equal(again.code, 0, again.err);
    assert.deepEqual(snapshot(p), before, "idempotent after migration");
  });

  it("shows the plan without writing anything on --dry-run", async () => {
    const p = v1Project();
    const before = snapshot(p);
    const r = await run(p, ["install", "--dry-run", "--json"]);
    const doc = JSON.parse(r.out);
    assert.equal(doc.dryRun, true);
    const text = JSON.stringify(doc.items);
    assert.ok(text.includes(".cursor/harness.json"), "the plan names the pointer it will move");
    assert.ok(text.includes(".cursor/hooks/session-start.js"), "and the hook it will replace");
    assert.deepEqual(snapshot(p), before);
  });

  it("uninstall afterwards gives back your AGENTS.md text and keeps the ignore lines it preserved", async () => {
    const p = v1Project();
    await migrate(p);
    const r = await run(p, ["uninstall"]);
    assert.equal(r.code, 0, r.err);
    assert.equal(read(join(p.app, "AGENTS.md")), USER_AGENTS_TEXT);
    const ignore = read(join(p.app, ".gitignore"));
    assert.ok(!/magik-harness:gitignore/.test(ignore));
    assert.ok(ignore.startsWith("node_modules/\n.env\n"));
    assert.ok(ignore.split("\n").includes(".cursor/telemetry/"), "kept lines were never ours to remove");
    assert.ok(!has(join(p.app, ".cursor/harness.json")), "the 1.x pointer is not resurrected");
    assert.ok(has(join(p.app, ".magik/harness.json")), "the pointer is yours and stays");
    assert.deepEqual(readJson(join(p.app, ".cursor/hooks.json")).hooks ?? {}, {}, "no hook left registered");
  });
});

describe("the local overlay", () => {
  it("moves with the pointer and is git-ignored in its new place", async () => {
    const p = v1Project();
    const overlay = JSON.stringify({ vault: "~/another-vault" }, null, 2) + "\n";
    write(join(p.app, ".cursor/harness.local.json"), overlay);
    const r = await migrate(p);
    assert.equal(r.code, 0, r.err);
    assert.equal(read(join(p.app, ".magik/harness.local.json")), overlay, "moved byte for byte");
    assert.ok(!has(join(p.app, ".cursor/harness.local.json")));
    assert.doesNotThrow(() => git(p.app, "check-ignore", "-q", ".magik/harness.local.json"), "the overlay is machine-local, so git must ignore it");
  });
});

describe("a 1.x hook script you edited", () => {
  async function editedHookProject() {
    const p = v1Project();
    const script = join(p.app, ".cursor/hooks/session-start.js");
    write(script, read(script) + "\n// my own tweak\n");
    return { p, script };
  }

  it("is kept, with a loud warning that context will arrive twice", async () => {
    const { p, script } = await editedHookProject();
    const r = await migrate(p);
    assert.equal(r.code, 0, r.err);
    assert.match(r.out, /every session start injects context twice/);
    assert.match(r.out, /--drop-legacy-hook/);
    assert.match(read(script), /my own tweak/, "the file is untouched");
    const commands = collectCommands(readJson(join(p.app, ".cursor/hooks.json")));
    assert.ok(commands.includes(LEGACY_CMD) && commands.includes(CURSOR_CMD), "both hooks stay registered until you decide");

    const d = await run(p, ["doctor"]);
    assert.equal(d.code, 0, "a warning, not a failure");
    assert.match(d.out, /1\.x leftovers: .*session-start\.js.*injected twice/);
    assert.equal((await run(p, ["doctor", "--strict"])).code, 1);
  });

  it("goes away with --drop-legacy-hook, after being backed up", async () => {
    const { p } = await editedHookProject();
    await migrate(p);
    const r = await migrate(p, ["--drop-legacy-hook"]);
    assert.equal(r.code, 0, r.err);
    assert.ok(!has(join(p.app, ".cursor/hooks/session-start.js")));
    assert.deepEqual(collectCommands(readJson(join(p.app, ".cursor/hooks.json"))), [CURSOR_CMD]);
    const saved = files(join(p.app, ".magik/backups")).find((f) => f.endsWith(".cursor/hooks/session-start.js"));
    assert.ok(saved, "the edited script was backed up first");
    assert.match(read(join(p.app, ".magik/backups", saved)), /my own tweak/);

    const d = await run(p, ["doctor"]);
    assert.equal(d.code, 0, d.out);
    assert.match(d.out, /Healthy: 0 failure\(s\), 0 warning\(s\)\./);
  });
});

describe("before migrating, and with --keep-legacy-pointer", () => {
  it("a 1.x pointer already resolves (the old path is still read), and doctor says to migrate", async () => {
    const p = v1Project();
    const res = JSON.parse((await run(p, ["resolve", "--json"])).out);
    assert.equal(res.active, true);
    assert.equal(res.pointerIsLegacy, true);
    assert.equal(res.source, "project");

    const d = await run(p, ["doctor"]);
    assert.equal(d.code, 0, d.out);
    assert.match(d.out, /pointer is at the 1\.x path \.cursor\/harness\.json/);
    assert.match(d.out, /1\.x leftovers: .*\.cursor\/harness\.json/);
    assert.match(d.out, /fix: magik-harness install/);
  });

  it("--keep-legacy-pointer leaves the old pointer in place; a later plain install finishes the move", async () => {
    const p = v1Project();
    const r = await migrate(p, ["--keep-legacy-pointer"]);
    assert.equal(r.code, 0, r.err);
    assert.ok(has(join(p.app, ".cursor/harness.json")), "kept where tools and scripts of yours may read it");
    assert.ok(!has(join(p.app, ".magik/harness.json")));
    const res = JSON.parse((await run(p, ["resolve", "--json"])).out);
    assert.equal(res.active, true, "the project still resolves through the old path");
    assert.equal(res.pointerIsLegacy, true);

    const finish = await migrate(p);
    assert.equal(finish.code, 0, finish.err);
    assert.ok(has(join(p.app, ".magik/harness.json")));
    assert.ok(!has(join(p.app, ".cursor/harness.json")));
    const d = await run(p, ["doctor"]);
    assert.match(d.out, /Healthy: 0 failure\(s\), 0 warning\(s\)\./);
  });

  it("an unreadable 1.x pointer stops a plain install, and changes nothing", async () => {
    const p = v1Project();
    write(join(p.app, ".cursor/harness.json"), "{ nope");
    const before = snapshot(p);
    const r = await migrate(p);
    assert.equal(r.code, 2);
    assert.match(r.err, /\.cursor\/harness\.json exists but is not valid JSON/);
    assert.match(r.err, /--vault <dir> \(or --profile minimal\)/);
    assert.deepEqual(snapshot(p), before, "nothing was written");
  });

  it("with --vault, an unreadable 1.x pointer is left exactly as it was, with a warning, and doctor keeps failing until it is fixed", async () => {
    const p = v1Project();
    write(join(p.app, ".cursor/harness.json"), "{ nope");
    const r = await migrate(p, ["--vault", "~/vault"]);
    assert.equal(r.code, 0, r.err);
    assert.match(r.out, /\.cursor\/harness\.json is unreadable/);
    assert.equal(read(join(p.app, ".cursor/harness.json")), "{ nope");
    assert.ok(!has(join(p.app, ".magik/harness.json")), "no pointer is invented");
    assert.equal((await run(p, ["doctor"])).code, 1, "a project whose pointer cannot be read is not healthy");
  });
});
