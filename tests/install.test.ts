/**
 * tests/install.test.ts: project-scope install, upgrade and uninstall.
 *
 * The properties that make an installer safe to point at a real repository:
 * it is idempotent, a dry run writes nothing, your edits survive an upgrade,
 * your own files are merged into rather than replaced, and uninstall puts
 * everything back exactly. Each is pinned with a byte-for-byte comparison.
 */

import assert from "node:assert/strict";
import { chmodSync, rmSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";

import { PLUGIN_VERSION } from "./_version.ts";
import { cli, files, git, has, hook, project as proj, read, readJson, write } from "./_helpers.ts";
import type { Project as P } from "./_helpers.ts";

const KNOWLEDGE_SKILLS = ["agentic-e2e-loop", "harness", "harness-memory", "kb-code-sync", "kb-conventions", "kb-sanitize", "kb-search", "knowledge-base"];
const MINIMAL_SKILLS = ["agentic-e2e-loop", "harness"];
const CURSOR_CMD = "node .magik/runtime/session-start.mjs --format cursor";

const run = (p: P, args: string[]) => cli(args, { cwd: p.app, home: p.home });
const install = (p: P, args: string[] = []) => run(p, ["install", "--yes", ...args]);
const skillDirs = (p: P, base = ".agents/skills") => files(join(p.app, base)).filter((f) => f.endsWith("/SKILL.md")).map((f) => f.split("/")[0]).sort();

describe("a fresh knowledge install", () => {
  it("writes the runtime, skills, pointer, primer, gitignore block and hook registration", async () => {
    const p = proj();
    const r = await install(p, ["--vault", p.vault]);
    assert.equal(r.code, 0, r.err);
    assert.match(r.out, /hook self-test: ok/);

    for (const f of [".magik/runtime/resolve.mjs", ".magik/runtime/gitctx.mjs", ".magik/runtime/session-start.mjs", ".magik/harness.json", ".magik/lock.json", "AGENTS.md", ".gitignore", ".cursor/hooks.json"]) {
      assert.ok(has(join(p.app, f)), `${f} should exist`);
    }
    assert.deepEqual(skillDirs(p), KNOWLEDGE_SKILLS);
    assert.ok(!has(join(p.app, ".agents/skills/harness-setup")), "harness-setup is for a machine-level install only");
    assert.ok(!has(join(p.app, ".claude")), "only the detected/default tool is configured");

    const pointer = readJson(join(p.app, ".magik/harness.json"));
    assert.equal(pointer.schema, "magik-harness/harness@2");
    assert.equal(pointer.vault, "~/vault", "a path under home is stored portably");
    assert.deepEqual(pointer.knowledge, { mount: "app/knowledge", accessVia: "path", autonomy: "open" });
    assert.deepEqual(pointer.memory, { mount: "app/memory", accessVia: "path" });
    assert.ok(has(join(p.vault, "app", "knowledge", "_index.md")), "the vault gets a starter index");
    assert.ok(has(join(p.vault, "app", "memory")));

    assert.ok(read(join(p.app, "AGENTS.md")).startsWith(`<!-- magik-harness:primer:start v=${PLUGIN_VERSION} -->`));
    assert.match(read(join(p.app, ".gitignore")), /# magik-harness:gitignore:start[\s\S]*\.magik\/harness\.local\.json[\s\S]*\.magik\/backups\//);
    assert.deepEqual(readJson(join(p.app, ".cursor/hooks.json")), { version: 1, hooks: { sessionStart: [{ command: CURSOR_CMD }] } });

    const lock = readJson(join(p.app, ".magik/lock.json"));
    assert.equal(lock.scope, "project");
    assert.equal(lock.profile, "knowledge");
    assert.deepEqual(lock.tools, ["cursor"]);
    assert.ok(Object.keys(lock.files).length >= 15);
    for (const key of Object.keys(lock.files)) assert.ok(has(join(p.app, key)), `locked file ${key} exists`);
  });

  it("writes a lock that is safe to commit: no path of this machine in it, and it still works", async () => {
    const p = proj();
    const packs = join(p.home, "packs");
    write(join(packs, "mine/pack.json"), JSON.stringify({ description: "An external pack, here to check what the lock records about it.", requires: {} }));
    write(join(packs, "mine/skills/mine-skill/SKILL.md"), "---\nname: mine-skill\ndescription: Use when checking that an external pack is recorded portably in the lock file.\n---\n\n# mine\n");
    const r = await install(p, ["--vault", p.vault, "--pack-dir", packs, "--packs", "mine"]);
    assert.equal(r.code, 0, r.err);

    const raw = read(join(p.app, ".magik/lock.json"));
    assert.ok(!raw.includes(p.root), "the project lock is committed, so it must not name this machine's directories");
    const lock = JSON.parse(raw);
    assert.deepEqual(lock.packDirs, ["~/packs"]);
    assert.ok("~/vault/app/knowledge/_index.md" in lock.seeds, "the vault's starter index is recorded home-relative");

    assert.equal((await run(p, ["upgrade", "--yes"])).code, 0, "the saved pack dir is found again from its portable form");
    assert.equal((await run(p, ["doctor"])).code, 0);
    const again = await install(p, ["--pack-dir", packs]);
    assert.equal(again.code, 0, again.err);
    assert.deepEqual(readJson(join(p.app, ".magik/lock.json")).packDirs, ["~/packs"], "passing the same directory again does not duplicate it");

    assert.equal((await run(p, ["uninstall", "--purge"])).code, 0);
    assert.ok(!has(join(p.vault, "app/knowledge/_index.md")), "purge finds the seed through its portable key");
  });

  it("installs a hook that works from inside the repo, on its own", async () => {
    const p = proj();
    await install(p, ["--vault", p.vault]);
    write(join(p.vault, "app", "memory", "daily", "2026-03-04.md"), "- [note] from yesterday's work\n");
    const r = hook(["--format", "text"], { cwd: p.app, home: p.home, script: join(p.app, ".magik/runtime/session-start.mjs"), env: { MAGIK_TODAY: "2026-03-04" } });
    assert.equal(r.code, 0);
    assert.match(r.stdout, /magik-harness session context/);
    assert.match(r.stdout, /from yesterday's work/);
  });

  it("is idempotent: a second install changes nothing, byte for byte", async () => {
    const p = proj();
    await install(p, ["--vault", p.vault]);
    const before = files(p.app);
    const agents = read(join(p.app, "AGENTS.md"));
    const lock = read(join(p.app, ".magik/lock.json"));
    const again = await install(p, []);
    assert.equal(again.code, 0, again.err);
    assert.match(again.out, /already current/);
    assert.ok(!/\+ create|~ update/.test(again.out));
    assert.deepEqual(files(p.app), before);
    assert.equal(read(join(p.app, "AGENTS.md")), agents);
    assert.equal(read(join(p.app, ".magik/lock.json")), lock);
  });

  it("a dry run writes nothing at all, not even the vault", async () => {
    const p = proj();
    const before = files(p.app);
    const r = await install(p, ["--vault", p.vault, "--dry-run"]);
    assert.equal(r.code, 0);
    assert.match(r.out, /Dry run/);
    assert.deepEqual(files(p.app), before);
    assert.ok(!has(p.vault));

    const json = await run(p, ["install", "--vault", p.vault, "--dry-run", "--json"]);
    const doc = JSON.parse(json.out);
    assert.equal(doc.command, "install");
    assert.equal(doc.dryRun, true);
    assert.ok(Array.isArray(doc.items) && doc.items.length > 10);
    assert.deepEqual(files(p.app), before);
  });

  it("works from another directory with --project-root", async () => {
    const p = proj();
    const r = await cli(["install", "--yes", "--vault", p.vault, "--project-root", p.app], { cwd: p.root, home: p.home });
    assert.equal(r.code, 0, r.err);
    assert.ok(has(join(p.app, ".magik/harness.json")));
  });
});

describe("your files are yours", () => {
  it("merges into AGENTS.md, .gitignore and hooks.json, and uninstall puts them back exactly", async () => {
    const original = {
      agents: "# Mine\n\nBuild with `make`.\n",
      gitignore: "node_modules/\n.env\n",
      hooks: { version: 1, hooks: { sessionStart: [{ command: "orca-hook start" }], stop: [{ command: "orca-hook stop" }] } },
    };
    const p = proj({ files: { "AGENTS.md": original.agents, ".gitignore": original.gitignore, ".cursor/hooks.json": JSON.stringify(original.hooks, null, 2) + "\n" } });
    const r = await install(p, ["--vault", p.vault]);
    assert.equal(r.code, 0, r.err);

    const agents = read(join(p.app, "AGENTS.md"));
    assert.ok(agents.startsWith("<!-- magik-harness:primer:start"));
    assert.ok(agents.endsWith(original.agents), "the user's text is intact below the primer");
    assert.ok(read(join(p.app, ".gitignore")).startsWith(original.gitignore));
    const hooks = readJson(join(p.app, ".cursor/hooks.json"));
    assert.deepEqual(hooks.hooks.sessionStart, [{ command: "orca-hook start" }, { command: CURSOR_CMD }]);
    assert.deepEqual(hooks.hooks.stop, [{ command: "orca-hook stop" }]);

    const un = await run(p, ["uninstall"]);
    assert.equal(un.code, 0, un.err);
    assert.equal(read(join(p.app, "AGENTS.md")), original.agents);
    assert.equal(read(join(p.app, ".gitignore")), original.gitignore);
    assert.deepEqual(readJson(join(p.app, ".cursor/hooks.json")), original.hooks);
    assert.deepEqual(
      files(p.app).filter((f) => !f.startsWith(".magik/backups/")),
      [".cursor/hooks.json", ".gitignore", ".magik/harness.json", "AGENTS.md"],
      "only the pointer is left behind, and it is yours",
    );
    assert.ok(has(join(p.vault, "app", "knowledge", "_index.md")), "the vault is never touched");
  });

  it("keeps a CRLF file CRLF", async () => {
    const p = proj({ files: { "AGENTS.md": "# Mine\r\n\r\nnotes\r\n" } });
    await install(p, ["--vault", p.vault]);
    const agents = read(join(p.app, "AGENTS.md"));
    assert.ok(!/[^\r]\n/.test(agents), "no bare LF was introduced");
    assert.ok(agents.endsWith("notes\r\n"));
  });

  it("leaves an invalid hooks.json alone, says how to register by hand, and doctor keeps failing until it is fixed", async () => {
    const p = proj({ files: { ".cursor/hooks.json": "{ nope" } });
    const r = await install(p, ["--vault", p.vault]);
    assert.equal(r.code, 0, r.err);
    assert.match(r.out, /not valid JSON/);
    assert.ok(r.out.includes(CURSOR_CMD), "the exact command to register is printed");
    assert.equal(read(join(p.app, ".cursor/hooks.json")), "{ nope");
    const d = await run(p, ["doctor"]);
    assert.equal(d.code, 1);
    assert.match(d.out, /not valid JSON/);
  });

  it("keeps your edits on upgrade, and --force overwrites them only after taking a backup", async () => {
    const p = proj();
    await install(p, ["--vault", p.vault]);
    const skill = join(p.app, ".agents/skills/harness/SKILL.md");
    write(skill, read(skill) + "\n<!-- my local edit -->\n");

    const up = await run(p, ["upgrade", "--yes"]);
    assert.equal(up.code, 0, up.err);
    assert.match(up.out, /modified locally; kept/);
    assert.match(read(skill), /my local edit/);

    const forced = await install(p, ["--force"]);
    assert.match(forced.out, /overwritten \(--force\)/);
    assert.ok(!/my local edit/.test(read(skill)));
    const backups = files(join(p.app, ".magik/backups"));
    const saved = backups.find((f) => f.endsWith(".agents/skills/harness/SKILL.md"));
    assert.ok(saved, "the edited file was backed up first");
    assert.match(read(join(p.app, ".magik/backups", saved)), /my local edit/);
  });

  it("keeps backups out of git, even after uninstall has removed the .gitignore block", async () => {
    const p = proj();
    await install(p, ["--vault", p.vault]);
    const skill = join(p.app, ".agents/skills/harness/SKILL.md");
    write(skill, read(skill) + "\nedit\n");
    await install(p, ["--force"]);
    await run(p, ["uninstall"]);
    const status = git(p.app, "status", "--porcelain", "--untracked-files=all");
    assert.ok(!/backups/.test(status), `backups must not show up in git status:\n${status}`);
  });
});

describe("profiles", () => {
  it("installs the minimal profile without a vault, and its primer does not mention a knowledge base it does not have", async () => {
    const p = proj();
    const r = await install(p, ["--profile", "minimal"]);
    assert.equal(r.code, 0, r.err);
    assert.deepEqual(skillDirs(p), MINIMAL_SKILLS);
    assert.ok(!has(join(p.app, ".magik/harness.json")), "no pointer without a vault");
    assert.ok(!/kb-search/.test(read(join(p.app, "AGENTS.md"))));
    const h = hook(["--format", "text"], { cwd: p.app, home: p.home, script: join(p.app, ".magik/runtime/session-start.mjs") });
    assert.match(h.stdout, /no vault configured/);
  });

  it("defaults to minimal when there is nothing to point at, and to knowledge when there is", async () => {
    const bare = proj();
    await install(bare);
    assert.equal(readJson(join(bare.app, ".magik/lock.json")).profile, "minimal");
    const withVault = proj();
    await install(withVault, ["--vault", withVault.vault]);
    assert.equal(readJson(join(withVault.app, ".magik/lock.json")).profile, "knowledge");
  });

  it("upgrades a minimal install to knowledge in place", async () => {
    const p = proj();
    await install(p, ["--profile", "minimal"]);
    const r = await install(p, ["--profile", "knowledge", "--vault", p.vault]);
    assert.equal(r.code, 0, r.err);
    assert.deepEqual(skillDirs(p), KNOWLEDGE_SKILLS);
    assert.ok(has(join(p.app, ".magik/harness.json")));
    assert.match(read(join(p.app, "AGENTS.md")), /kb-search/);
  });

  it("asks for a vault when the knowledge profile is explicit and none is given", async () => {
    const p = proj();
    const r = await install(p, ["--profile", "knowledge"]);
    assert.equal(r.code, 2);
    assert.match(r.err, /--vault/);
    assert.ok(!has(join(p.app, ".magik")), "a refused install leaves nothing behind");
  });

  it("points at remote stores without creating any folders (accessVia mcp)", async () => {
    const p = proj();
    const r = await install(p, ["--profile", "knowledge", "--access-via", "mcp"]);
    assert.equal(r.code, 0, r.err);
    const pointer = readJson(join(p.app, ".magik/harness.json"));
    assert.equal(pointer.vault, null);
    assert.equal(pointer.knowledge.accessVia, "mcp");
    assert.ok(!has(p.vault));
  });

  it("writes the chosen knowledge autonomy and rejects an unknown one", async () => {
    const p = proj();
    await install(p, ["--vault", p.vault, "--kb-autonomy", "readonly"]);
    assert.equal(readJson(join(p.app, ".magik/harness.json")).knowledge.autonomy, "readonly");
    const q = proj();
    const bad = await install(q, ["--vault", q.vault, "--kb-autonomy", "yolo"]);
    assert.equal(bad.code, 2);
    assert.ok(!has(join(q.app, ".magik")));
  });

  it("tells you when --vault disagrees with the pointer you already have, and does not change the pointer", async () => {
    const p = proj();
    await install(p, ["--vault", p.vault]);
    const r = await install(p, ["--vault", join(p.home, "another-vault")]);
    assert.match(r.out, /already names the vault ~\/vault/);
    assert.equal(readJson(join(p.app, ".magik/harness.json")).vault, "~/vault");
  });
});

describe("where skills go", () => {
  it("falls back to .cursor/skills when .agents/ is git-ignored, and says so", async () => {
    const p = proj({ files: { ".gitignore": ".agents/\n" } });
    const r = await install(p, ["--vault", p.vault]);
    assert.match(r.out, /\.agents\/ is git-ignored/);
    assert.deepEqual(skillDirs(p, ".cursor/skills"), KNOWLEDGE_SKILLS);
    assert.ok(!has(join(p.app, ".agents")));
    assert.equal(readJson(join(p.app, ".magik/lock.json")).skillsDir, ".cursor/skills");
    const h = hook(["--format", "text"], { cwd: p.app, home: p.home, script: join(p.app, ".magik/runtime/session-start.mjs") });
    assert.match(h.stdout, /\.cursor\/skills\/kb-search\/SKILL\.md/, "the hook points at where the skills really are");
  });

  it("honours --skills-dir", async () => {
    const p = proj();
    await install(p, ["--vault", p.vault, "--skills-dir", "tools/agent-skills"]);
    assert.deepEqual(skillDirs(p, "tools/agent-skills"), KNOWLEDGE_SKILLS);
    assert.ok(!has(join(p.app, ".agents")));
  });
});

describe("tools", () => {
  it("configures Claude Code: hook, CLAUDE.md import and a skills mirror, and removes them cleanly", async () => {
    const p = proj();
    const r = await install(p, ["--vault", p.vault, "--tools", "claude"]);
    assert.equal(r.code, 0, r.err);
    const settings = readJson(join(p.app, ".claude/settings.json"));
    assert.deepEqual(settings.hooks.SessionStart, [{ hooks: [{ type: "command", command: "node .magik/runtime/session-start.mjs --format claude" }] }]);
    assert.match(read(join(p.app, "CLAUDE.md")), /@AGENTS\.md/);
    assert.deepEqual(skillDirs(p, ".claude/skills"), KNOWLEDGE_SKILLS);
    assert.ok(!has(join(p.app, ".cursor")), "Cursor was not asked for");

    await run(p, ["uninstall"]);
    assert.deepEqual(
      files(p.app).filter((f) => !f.startsWith(".magik/backups/")),
      [".magik/harness.json", "README.md"],
      "everything Claude-related and every file install created is gone",
    );
  });

  it("configures several tools at once, and Codex needs nothing but a note", async () => {
    const p = proj();
    const r = await install(p, ["--vault", p.vault, "--tools", "cursor,claude,codex"]);
    assert.equal(r.code, 0, r.err);
    assert.ok(has(join(p.app, ".cursor/hooks.json")));
    assert.ok(has(join(p.app, ".claude/settings.json")));
    assert.match(r.out, /codex: reads AGENTS\.md/);
  });

  it("with --tools none installs only the portable part: AGENTS.md, skills and the runtime", async () => {
    const p = proj();
    await install(p, ["--vault", p.vault, "--tools", "none"]);
    assert.ok(!has(join(p.app, ".cursor")) && !has(join(p.app, ".claude")));
    assert.ok(has(join(p.app, "AGENTS.md")));
    assert.deepEqual(skillDirs(p), KNOWLEDGE_SKILLS);
  });

  it("detects the tool already in use in the repo", async () => {
    const p = proj({ files: { ".claude/notes.md": "x\n" } });
    await install(p, ["--vault", p.vault]);
    assert.ok(has(join(p.app, ".claude/settings.json")));
    assert.ok(!has(join(p.app, ".cursor/hooks.json")));
    assert.deepEqual(readJson(join(p.app, ".magik/lock.json")).tools, ["claude"]);
  });

  it("rejects an unknown tool with a usage error", async () => {
    const p = proj();
    const r = await install(p, ["--vault", p.vault, "--tools", "bogus"]);
    assert.equal(r.code, 2);
    assert.match(r.err, /unknown tool "bogus"/);
  });
});

describe("packs", () => {
  it("installs the opt-in packs with their scripts executable, and removes them on uninstall", async () => {
    const p = proj();
    const r = await install(p, ["--vault", p.vault, "--packs", "worktrees,ci-runners"]);
    assert.equal(r.code, 0, r.err);
    assert.ok(skillDirs(p).includes("worktree-audit"));
    assert.ok(skillDirs(p).includes("ci-runners"));
    const script = join(p.app, ".agents/skills/worktree-audit/scripts/wt_audit.py");
    assert.ok(has(script));
    if (process.platform !== "win32") assert.ok((statSync(script).mode & 0o111) !== 0, "scripts keep their executable bit");
    assert.deepEqual(readJson(join(p.app, ".magik/lock.json")).packs, ["worktrees", "ci-runners"]);

    await run(p, ["uninstall"]);
    assert.ok(!has(join(p.app, ".agents")));
  });

  it("rejects an unknown pack and leaves the repo untouched", async () => {
    const p = proj();
    const before = files(p.app);
    const r = await install(p, ["--vault", p.vault, "--packs", "bogus"]);
    assert.equal(r.code, 2);
    assert.match(r.err, /unknown pack "bogus"/);
    assert.deepEqual(files(p.app), before);
  });

  it("loads an external pack from --pack-dir", async () => {
    const p = proj();
    const packs = join(p.root, "team-packs");
    write(join(packs, "team-style", "pack.json"), JSON.stringify({ description: "Our house style." }));
    write(join(packs, "team-style", "skills", "house-style", "SKILL.md"), "---\nname: house-style\ndescription: Use when writing code in this team's style.\n---\nUse tabs.\n");
    const r = await install(p, ["--vault", p.vault, "--pack-dir", packs, "--packs", "team-style"]);
    assert.equal(r.code, 0, r.err);
    assert.ok(skillDirs(p).includes("house-style"));
    assert.deepEqual(readJson(join(p.app, ".magik/lock.json")).packDirs.length, 1);
  });
});

describe("uninstall", () => {
  it("is a no-op when nothing is installed, and when run twice", async () => {
    const p = proj();
    const none = await run(p, ["uninstall"]);
    assert.equal(none.code, 0);
    assert.match(none.out, /Nothing to uninstall/);
    await install(p, ["--vault", p.vault]);
    assert.equal((await run(p, ["uninstall"])).code, 0);
    const twice = await run(p, ["uninstall"]);
    assert.equal(twice.code, 0);
    assert.match(twice.out, /Nothing to uninstall/);
  });

  it("a dry run changes nothing", async () => {
    const p = proj();
    await install(p, ["--vault", p.vault]);
    const before = files(p.app);
    const r = await run(p, ["uninstall", "--dry-run"]);
    assert.match(r.out, /Dry run/);
    assert.deepEqual(files(p.app), before);
  });

  it("keeps files you modified", async () => {
    const p = proj();
    await install(p, ["--vault", p.vault]);
    const skill = join(p.app, ".agents/skills/kb-search/SKILL.md");
    write(skill, read(skill) + "\nmine\n");
    const r = await run(p, ["uninstall"]);
    assert.equal(r.code, 0, r.err);
    assert.match(r.out, /modified locally; kept/);
    assert.match(read(skill), /\nmine\n/, "an edited skill stays, with its edit");
    assert.ok(!has(join(p.app, ".agents/skills/harness/SKILL.md")), "an untouched one goes");
  });

  it("--force removes modified files too, after backing them up", async () => {
    const p = proj();
    await install(p, ["--vault", p.vault]);
    const skill = join(p.app, ".agents/skills/kb-search/SKILL.md");
    write(skill, read(skill) + "\nmine\n");
    const r = await run(p, ["uninstall", "--force"]);
    assert.equal(r.code, 0, r.err);
    assert.ok(!has(skill));
    const saved = files(join(p.app, ".magik/backups")).find((f) => f.endsWith(".agents/skills/kb-search/SKILL.md"));
    assert.ok(saved, "the modified file was backed up before removal");
    assert.match(read(join(p.app, ".magik/backups", saved)), /\nmine\n/);
  });

  it("--purge also removes the pointer and the starter index, never the vault itself", async () => {
    const p = proj();
    await install(p, ["--vault", p.vault]);
    const r = await run(p, ["uninstall", "--purge"]);
    assert.equal(r.code, 0, r.err);
    assert.ok(!has(join(p.app, ".magik/harness.json")));
    assert.ok(!has(join(p.vault, "app", "knowledge", "_index.md")));
    assert.ok(has(join(p.vault, "app", "knowledge")) && has(join(p.vault, "app", "memory")));
    assert.match(r.out, /vault and its notes were left untouched/);
  });

  it("--purge keeps a starter index or pointer you have since edited: that is real work", async () => {
    const p = proj();
    await install(p, ["--vault", p.vault]);
    const index = join(p.vault, "app", "knowledge", "_index.md");
    write(index, read(index) + "\n## My first entry\n");
    const pointerPath = join(p.app, ".magik/harness.json");
    write(pointerPath, read(pointerPath).replace('"open"', '"ask"'));
    const r = await run(p, ["uninstall", "--purge"]);
    assert.equal(r.code, 0, r.err);
    assert.match(r.out, /edited since it was created; kept/);
    assert.match(read(index), /My first entry/);
    assert.match(read(pointerPath), /"ask"/);
  });

  it("--purge --force removes even edited seeds, with a backup", async () => {
    const p = proj();
    await install(p, ["--vault", p.vault]);
    const index = join(p.vault, "app", "knowledge", "_index.md");
    write(index, read(index) + "\n## My first entry\n");
    const r = await run(p, ["uninstall", "--purge", "--force"]);
    assert.equal(r.code, 0, r.err);
    assert.ok(!has(index));
    assert.ok(files(join(p.app, ".magik/backups")).some((f) => f.endsWith("knowledge/_index.md")), "the edited index was backed up");
  });
});

describe("upgrade", () => {
  it("refuses to run before an install, with the command to run instead", async () => {
    const p = proj();
    const r = await run(p, ["upgrade", "--yes"]);
    assert.equal(r.code, 2);
    assert.match(r.err, /nothing to upgrade/);
    assert.match(r.err, /magik-harness install/);
  });

  it("re-applies the saved profile, tools and packs without repeating them", async () => {
    const p = proj();
    await install(p, ["--vault", p.vault, "--tools", "cursor,claude", "--packs", "worktrees"]);
    const lockBefore = readJson(join(p.app, ".magik/lock.json"));
    const r = await run(p, ["upgrade", "--yes"]);
    assert.equal(r.code, 0, r.err);
    const lockAfter = readJson(join(p.app, ".magik/lock.json"));
    assert.deepEqual([lockAfter.profile, lockAfter.tools, lockAfter.packs], [lockBefore.profile, lockBefore.tools, lockBefore.packs]);
    assert.match(r.out, /already current/);
  });

  it("restores a managed file that was deleted", async () => {
    const p = proj();
    await install(p, ["--vault", p.vault]);
    const skill = join(p.app, ".agents/skills/harness/SKILL.md");
    const content = read(skill);
    rmSync(skill);
    const r = await run(p, ["upgrade", "--yes"]);
    assert.equal(r.code, 0, r.err);
    assert.equal(read(skill), content);
  });
});

describe("read-only commands", () => {
  it("list --json describes profiles, skills, packs and tools", async () => {
    const p = proj();
    const doc = JSON.parse((await run(p, ["list", "--json"])).out);
    assert.equal(doc.version, PLUGIN_VERSION);
    assert.deepEqual(Object.keys(doc.profiles).sort(), ["knowledge", "minimal"]);
    assert.ok(doc.skills.some((s: { name: string }) => s.name === "kb-search"));
    assert.deepEqual(doc.packs.map((x: { name: string }) => x.name).sort(), ["ci-runners", "worktrees"]);
    assert.deepEqual(doc.tools.map((t: { id: string }) => t.id), ["cursor", "claude", "codex", "generic"]);
  });

  it("resolve --json reports what resolves, and says not-harnessed for a plain repo", async () => {
    const p = proj();
    const plain = JSON.parse((await run(p, ["resolve", "--json"])).out);
    assert.equal(plain.active, false);
    await install(p, ["--vault", p.vault]);
    const doc = JSON.parse((await run(p, ["resolve", "--json"])).out);
    assert.equal(doc.active, true);
    assert.equal(doc.source, "project");
    assert.equal(doc.projectName, "app");
  });

  it("primer prints the primer text for tools that need it pasted", async () => {
    const p = proj();
    const knowledge = (await run(p, ["primer", "--profile", "knowledge"])).out;
    assert.match(knowledge, /kb-search/);
    assert.ok(!knowledge.includes("{{"));
    const minimal = (await run(p, ["primer", "--profile", "minimal"])).out;
    assert.ok(!/kb-search/.test(minimal));
  });

  it("status shows both scopes", async () => {
    const p = proj();
    const before = (await run(p, ["status"])).out;
    assert.match(before, /project\s+not installed/);
    await install(p, ["--vault", p.vault]);
    assert.match((await run(p, ["status"])).out, /project\s+installed v/);
  });
});

describe("command line", () => {
  it("prints help, the version, and usage errors with exit code 2", async () => {
    const p = proj();
    const help = await run(p, ["--help"]);
    assert.equal(help.code, 0);
    assert.match(help.out, /Usage: magik-harness <command>/);
    assert.equal((await run(p, [])).code, 2, "no command prints help and signals a usage error");
    assert.equal((await run(p, ["--version"])).out.trim(), PLUGIN_VERSION);
    const unknown = await run(p, ["frobnicate"]);
    assert.equal(unknown.code, 2);
    assert.match(unknown.err, /unknown command "frobnicate"/);
    const typo = await run(p, ["install", "--vualt", "x"]);
    assert.equal(typo.code, 2);
    assert.match(typo.err, /unknown option --vualt/);
    assert.equal((await run(p, ["help", "install"])).code, 0);
  });

  it("every command answers --help", async () => {
    const p = proj();
    for (const c of ["install", "upgrade", "doctor", "status", "resolve", "init", "uninstall", "list", "primer"]) {
      const r = await run(p, [c, "--help"]);
      assert.equal(r.code, 0, `${c} --help`);
      assert.match(r.out, /Usage: magik-harness/, `${c} --help`);
    }
  });

  it("chmod on a managed script survives an upgrade (local permission changes are not edits)", async () => {
    if (process.platform === "win32") return;
    const p = proj();
    await install(p, ["--vault", p.vault, "--packs", "worktrees"]);
    const script = join(p.app, ".agents/skills/worktree-audit/scripts/wt_audit.py");
    chmodSync(script, 0o700);
    const r = await run(p, ["upgrade", "--yes"]);
    assert.equal(r.code, 0, r.err);
    assert.ok(!/kept/.test(r.out), "a permission change alone is not reported as a modification");
  });
});
