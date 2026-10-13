/**
 * tests/global.test.ts: the machine-level (global) install.
 *
 * A global install lives entirely under the home directory: no repo is touched,
 * and every tool's own files (hooks, settings, instructions) are merged into,
 * never replaced. The bar is the same as for a project install and a little
 * higher, because these are the files a person has been tuning for months:
 * uninstall must hand them back byte for byte.
 */

import assert from "node:assert/strict";
import { mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";

import { collectCommands } from "../src/commands/doctor.js";
import { PLUGIN_VERSION } from "./_version.ts";
import { cli, contextOf, files, has, hook, machine, project, read, readJson, repo, vaultWith, write } from "./_helpers.ts";
import type { Machine, Project } from "./_helpers.ts";

const KNOWLEDGE_SKILLS = ["agentic-e2e-loop", "harness", "harness-memory", "kb-code-sync", "kb-conventions", "kb-sanitize", "kb-search", "knowledge-base"];
const GLOBAL_SKILLS = [...KNOWLEDGE_SKILLS, "harness-setup"].sort();
const TODAY = "2026-03-04";
const json = (v: unknown) => JSON.stringify(v, null, 2) + "\n";

interface Box extends Machine {
  vault: string;
  proj2: string;
  proj3: string;
  original: { cursorHooks: string; claudeSettings: string; codexAgents: string };
}

/** A machine that already has Cursor, Claude Code and Codex set up the way a real one does. */
function box(): Box {
  const m = machine();
  const { home } = m;
  write(join(home, ".cursor/hooks.json"), json({ version: 1, hooks: { sessionStart: [{ command: "orca-hook start" }], stop: [{ command: "orca-hook stop" }] } }));
  write(join(home, ".claude/settings.json"), json({ model: "opus", hooks: { SessionStart: [{ matcher: "startup", hooks: [{ type: "command", command: "echo hi" }] }] } }));
  write(join(home, ".codex/AGENTS.md"), "# my codex notes\n");
  const vault = join(home, "vault");
  vaultWith(vault, "proj2", { date: TODAY, note: "- [note] a global note\n" });
  const proj2 = repo(join(home, "Projects"), "proj2");
  const proj3 = repo(join(home, "Projects"), "proj3");
  return {
    ...m,
    vault,
    proj2,
    proj3,
    original: {
      cursorHooks: read(join(home, ".cursor/hooks.json")),
      claudeSettings: read(join(home, ".claude/settings.json")),
      codexAgents: read(join(home, ".codex/AGENTS.md")),
    },
  };
}

const g = (b: Box, args: string[], o: { cwd?: string; env?: Record<string, string | undefined> } = {}) => cli(args, { cwd: o.cwd ?? b.home, home: b.home, env: o.env });
const installGlobal = (b: Box, extra: string[] = [], env?: Record<string, string | undefined>) =>
  g(b, ["install", "--scope", "global", "--vault", "~/vault", "--tools", "cursor,claude,codex", "--yes", ...extra], { env });
const skillNames = (b: Box, base: string) => files(join(b.home, base)).filter((f) => f.endsWith("/SKILL.md")).map((f) => f.split("/")[0]).sort();
const homeFiles = (b: Box) => files(b.home).filter((f) => !f.startsWith("Projects/") && !f.startsWith("vault/") && !f.startsWith(".magik/backups/"));
const GLOBAL_RUNTIME = (b: Box) => join(b.home, ".magik/runtime/session-start.mjs");
const sessionStart = (b: Box, cwd: string) => hook(["--format", "text"], { cwd, home: b.home, script: GLOBAL_RUNTIME(b), env: { MAGIK_TODAY: TODAY } });

describe("a global install", () => {
  it("lives under the home directory, wires each tool, and touches no repository", async () => {
    const b = box();
    const r = await installGlobal(b);
    assert.equal(r.code, 0, r.err);
    assert.match(r.out, /hook self-test: ok/);

    for (const f of [
      ".magik/config.json",
      ".magik/lock.json",
      ".magik/runtime/resolve.mjs",
      ".magik/runtime/gitctx.mjs",
      ".magik/runtime/session-start.mjs",
      ".claude/CLAUDE.md",
    ]) {
      assert.ok(has(join(b.home, f)), `${f} should exist`);
    }
    assert.deepEqual(skillNames(b, ".agents/skills"), GLOBAL_SKILLS, "the shared skills folder (Cursor and Codex read it)");
    assert.deepEqual(skillNames(b, ".claude/skills"), GLOBAL_SKILLS, "Claude Code reads its own folder");
    assert.deepEqual(files(b.proj2), ["README.md"], "no repository is touched");
    assert.deepEqual(files(b.proj3), ["README.md"]);
    // cursor-agent ignores rule files in ~/.cursor/rules (checked live), so none is written; the install says what to do instead
    assert.ok(!has(join(b.home, ".cursor/rules")), "no dead rule file");
    assert.match(r.out, /Settings -> Rules/);
    assert.match(r.out, /magik-harness primer --scope global/);

    const config = readJson(join(b.home, ".magik/config.json"));
    assert.equal(config.schema, "magik-harness/config@1");
    assert.equal(config.vault, "~/vault");
    assert.equal(config.layout, "per-project");
    assert.deepEqual(config.knowledge, { autonomy: "open" });
    assert.equal(config.git, "harnessed");

    const lock = readJson(join(b.home, ".magik/lock.json"));
    assert.equal(lock.scope, "global");
    assert.deepEqual(lock.tools, ["cursor", "claude", "codex"]);
    assert.equal(lock.version, PLUGIN_VERSION);
  });

  it("merges into the hook files and instruction files you already have", async () => {
    const b = box();
    await installGlobal(b);
    const ours = `node "${GLOBAL_RUNTIME(b)}" --format cursor`;

    const cursor = readJson(join(b.home, ".cursor/hooks.json"));
    assert.deepEqual(cursor.hooks.sessionStart, [{ command: "orca-hook start" }, { command: ours }], "yours first, ours appended");
    assert.deepEqual(cursor.hooks.stop, [{ command: "orca-hook stop" }], "other events untouched");

    const claude = readJson(join(b.home, ".claude/settings.json"));
    assert.equal(claude.model, "opus", "unrelated settings untouched");
    const commands = collectCommands(claude);
    assert.ok(commands.includes("echo hi"));
    assert.ok(commands.includes(`node "${GLOBAL_RUNTIME(b)}" --format claude`));

    const codex = read(join(b.home, ".codex/AGENTS.md"));
    assert.match(codex, /^<!-- magik-harness:primer:start v=/);
    assert.ok(codex.endsWith("# my codex notes\n"), "your notes stay, below the primer");

    const claudeMd = read(join(b.home, ".claude/CLAUDE.md"));
    assert.match(claudeMd, /~\/\.magik\/runtime\/session-start\.mjs/, "the primer points at the machine-level hook script");
  });

  it("a dry run changes nothing", async () => {
    const b = box();
    const before = files(b.home);
    const r = await installGlobal(b, ["--dry-run"]);
    assert.equal(r.code, 0, r.err);
    assert.match(r.out, /Dry run/i);
    assert.deepEqual(files(b.home), before);
    assert.equal(read(join(b.home, ".cursor/hooks.json")), b.original.cursorHooks);
  });

  it("is idempotent", async () => {
    const b = box();
    await installGlobal(b);
    const snapshot = Object.fromEntries(homeFiles(b).map((f) => [f, read(join(b.home, f))]));
    const again = await installGlobal(b);
    assert.equal(again.code, 0, again.err);
    assert.deepEqual(Object.fromEntries(homeFiles(b).map((f) => [f, read(join(b.home, f))])), snapshot);
  });

  it("--tools none still installs the shared skills and runtime, and edits no tool's files", async () => {
    const b = box();
    const r = await installGlobal(b, ["--tools", "none"]);
    assert.equal(r.code, 0, r.err);
    assert.equal(read(join(b.home, ".cursor/hooks.json")), b.original.cursorHooks);
    assert.equal(read(join(b.home, ".claude/settings.json")), b.original.claudeSettings);
    assert.equal(read(join(b.home, ".codex/AGENTS.md")), b.original.codexAgents);
    assert.ok(has(GLOBAL_RUNTIME(b)));
    assert.deepEqual(skillNames(b, ".agents/skills"), GLOBAL_SKILLS);
  });

  it("a knowledge install without a vault is a usage error; minimal needs none", async () => {
    const b = box();
    const bad = await g(b, ["install", "--scope", "global", "--tools", "none", "--profile", "knowledge", "--yes"]);
    assert.equal(bad.code, 2);
    assert.match(bad.err, /needs a vault/);
    assert.ok(!has(join(b.home, ".magik")));

    const ok = await g(b, ["install", "--scope", "global", "--tools", "cursor", "--profile", "minimal", "--yes"]);
    assert.equal(ok.code, 0, ok.err);
    const config = readJson(join(b.home, ".magik/config.json"));
    assert.equal(config.vault, null);
    assert.equal(config.git, "always");
    assert.deepEqual(skillNames(b, ".agents/skills"), ["agentic-e2e-loop", "harness", "harness-setup"]);
  });
});

describe("a repo that has a folder in the vault", () => {
  it("gets context from the machine-level hook, and a repo without one stays silent", async () => {
    const b = box();
    await installGlobal(b);

    const active = sessionStart(b, b.proj2);
    assert.equal(active.code, 0);
    assert.match(active.stdout, /magik-harness session context/);
    assert.match(active.stdout, /a global note/);
    assert.match(active.stdout, /proj2/);

    const quiet = sessionStart(b, b.proj3);
    assert.equal(quiet.code, 0);
    assert.equal(quiet.stdout.trim(), "", "no vault folder for this repo, so nothing is injected");
  });

  it("resolve and doctor agree with the hook", async () => {
    const b = box();
    await installGlobal(b);
    const yes = JSON.parse((await g(b, ["resolve", "--json"], { cwd: b.proj2 })).out);
    assert.equal(yes.active, true);
    assert.equal(yes.source, "global");
    assert.equal(yes.projectName, "proj2");
    const no = JSON.parse((await g(b, ["resolve", "--json"], { cwd: b.proj3 })).out);
    assert.equal(no.active, false);

    const d = await g(b, ["doctor", "--scope", "global"]);
    assert.equal(d.code, 0, d.out);
    assert.match(d.out, /hook registered in ~\/\.cursor\/hooks\.json/);
    assert.match(d.out, /hook registered in ~\/\.claude\/settings\.json/);
    assert.match(d.out, /18 skill folder\(s\) checked, all valid/, "doctor counts the shared folder and Claude's copy");
    assert.match(d.out, /Healthy: 0 failure\(s\), 0 warning\(s\)\./);
  });

  it("`init` creates the per-project folders, and the next session picks them up", async () => {
    const b = box();
    await installGlobal(b);
    const r = await g(b, ["init"], { cwd: b.proj3 });
    assert.equal(r.code, 0, r.err);
    for (const d of ["knowledge", "memory"]) assert.ok(has(join(b.vault, "proj3", d)), `${d} created`);
    assert.ok(has(join(b.vault, "proj3", "knowledge", "_index.md")));
    assert.match(sessionStart(b, b.proj3).stdout, /magik-harness session context/);

    const again = await g(b, ["init", "--json"], { cwd: b.proj3 });
    const doc = JSON.parse(again.out);
    assert.equal(doc.command, "init");
    assert.ok(doc.items.every((i: { action: string }) => i.action === "exists"), "init never overwrites");
  });

  it("`init` refuses a vault that is not there unless asked, and --dry-run writes nothing", async () => {
    const b = box();
    await installGlobal(b);
    rmSync(b.vault, { recursive: true, force: true });
    const no = await g(b, ["init"], { cwd: b.proj3 });
    assert.equal(no.code, 1);
    assert.match(no.err, /does not exist\. Clone it, or pass --create-vault/);
    assert.ok(!has(b.vault));

    const dry = await g(b, ["init", "--create-vault", "--dry-run"], { cwd: b.proj3 });
    assert.equal(dry.code, 0, dry.err);
    assert.match(dry.out, /Dry run: nothing was written/);
    assert.ok(!has(b.vault));

    const yes = await g(b, ["init", "--create-vault"], { cwd: b.proj3 });
    assert.equal(yes.code, 0, yes.err);
    assert.ok(has(join(b.vault, "proj3", "memory")));
  });

  it("`init` with nothing configured says what to do first", async () => {
    const b = box();
    const r = await g(b, ["init"], { cwd: b.proj3 });
    assert.equal(r.code, 1);
    assert.match(r.err, /No harness pointer or global config for this project/);
    assert.match(r.err, /magik-harness install/);
  });

  it("a `projects` alias maps a repo to a differently named vault folder", async () => {
    const b = box();
    await installGlobal(b);
    const cfgPath = join(b.home, ".magik/config.json");
    const config = readJson(cfgPath);
    config.projects = { proj3: "third" };
    write(cfgPath, json(config));
    vaultWith(b.vault, "third", { date: TODAY, note: "- [note] under another name\n" });
    assert.match(sessionStart(b, b.proj3).stdout, /under another name/);
  });
});

describe("a project install and a global install together", () => {
  it("inject the context once, not twice, when both hooks fire for one session", async () => {
    const p: Project = project();
    mkdirSync(join(p.home, ".cursor"), { recursive: true });
    assert.equal((await cli(["install", "--yes", "--vault", p.vault], { cwd: p.app, home: p.home })).code, 0);
    assert.equal((await cli(["install", "--scope", "global", "--vault", "~/vault", "--tools", "cursor", "--yes"], { cwd: p.app, home: p.home })).code, 0);

    const id = `dup-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const payload = { workspace_roots: [p.app], conversation_id: id };
    const first = hook(["--format", "cursor"], { cwd: p.app, home: p.home, payload, script: join(p.home, ".magik/runtime/session-start.mjs") });
    const second = hook(["--format", "cursor"], { cwd: p.app, home: p.home, payload, script: join(p.app, ".magik/runtime/session-start.mjs") });
    assert.match(contextOf(first.stdout), /magik-harness session context/);
    assert.equal(contextOf(second.stdout), "", "the second hook for the same session adds no context");

    const other = hook(["--format", "cursor"], { cwd: p.app, home: p.home, payload: { ...payload, conversation_id: `${id}-b` }, script: join(p.app, ".magik/runtime/session-start.mjs") });
    assert.match(contextOf(other.stdout), /magik-harness session context/, "a different session is not suppressed");
  });
});

describe("MAGIK_HOME", () => {
  it("relocates the machine-level state, and everything that reads it follows", async () => {
    const b = box();
    const elsewhere = join(b.root, "elsewhere");
    const env = { MAGIK_HOME: elsewhere };
    const r = await installGlobal(b, [], env);
    assert.equal(r.code, 0, r.err);
    for (const f of ["config.json", "lock.json", "runtime/session-start.mjs", "runtime/resolve.mjs"]) assert.ok(has(join(elsewhere, f)), `${f} lives under MAGIK_HOME`);
    assert.ok(!has(join(b.home, ".magik")), "nothing under ~/.magik");
    assert.ok(read(join(b.home, ".cursor/hooks.json")).includes(join(elsewhere, "runtime/session-start.mjs")), "the registered hook points at the relocated runtime");

    const found = JSON.parse((await g(b, ["resolve", "--json"], { cwd: b.proj2, env })).out);
    assert.equal(found.active, true);
    assert.equal(found.source, "global");
    const without = JSON.parse((await g(b, ["resolve", "--json"], { cwd: b.proj2 })).out);
    assert.equal(without.active, false, "another shell without MAGIK_HOME does not see that config");

    const ran = hook(["--format", "text"], { cwd: b.proj2, home: b.home, script: join(elsewhere, "runtime/session-start.mjs"), env: { ...env, MAGIK_TODAY: TODAY } });
    assert.match(ran.stdout, /a global note/);
  });
});

describe("upgrade and uninstall", () => {
  it("upgrade restores what was deleted and keeps the tools it was installed for", async () => {
    const b = box();
    await installGlobal(b);
    rmSync(join(b.home, ".agents/skills/harness-setup/SKILL.md"));
    const r = await g(b, ["upgrade", "--scope", "global", "--yes"]);
    assert.equal(r.code, 0, r.err);
    assert.ok(has(join(b.home, ".agents/skills/harness-setup/SKILL.md")));
    assert.ok(has(join(b.home, ".claude/CLAUDE.md")), "claude was part of the install, so it stays");
    assert.equal((await g(b, ["doctor", "--scope", "global"])).code, 0);
  });

  it("uninstall hands every tool's file back exactly as it was", async () => {
    const b = box();
    await installGlobal(b);
    const r = await g(b, ["uninstall", "--scope", "global", "--yes"]);
    assert.equal(r.code, 0, r.err);
    assert.equal(read(join(b.home, ".cursor/hooks.json")), b.original.cursorHooks, "Cursor hooks restored byte for byte");
    assert.equal(read(join(b.home, ".claude/settings.json")), b.original.claudeSettings, "Claude settings restored byte for byte");
    assert.equal(read(join(b.home, ".codex/AGENTS.md")), b.original.codexAgents, "Codex notes restored byte for byte");
    assert.deepEqual(
      homeFiles(b),
      [".claude/settings.json", ".codex/AGENTS.md", ".cursor/hooks.json", ".magik/config.json"],
      "only your own files and your config are left",
    );
  });

  it("keeps the layout of a hooks file that is formatted its own way: tabs, and no newline at the end", async () => {
    const b = box();
    const own = JSON.stringify({ version: 1, hooks: { sessionStart: [{ command: "orca-hook start" }] } }, null, "\t"); // note: no final newline
    write(join(b.home, ".cursor/hooks.json"), own);
    assert.equal((await installGlobal(b)).code, 0);
    const merged = read(join(b.home, ".cursor/hooks.json"));
    assert.ok(!merged.endsWith("\n"), "it did not gain a trailing newline");
    assert.match(merged, /\n\t"version": 1/, "it kept its tab indentation");
    assert.equal(readJson(join(b.home, ".cursor/hooks.json")).hooks.sessionStart.length, 2);
    assert.equal((await g(b, ["uninstall", "--scope", "global", "--yes"])).code, 0);
    assert.equal(read(join(b.home, ".cursor/hooks.json")), own, "and it is handed back exactly as it was");
  });

  it("uninstall --purge removes the config too (it is unedited), and leaves the vault alone", async () => {
    const b = box();
    await installGlobal(b);
    const r = await g(b, ["uninstall", "--scope", "global", "--purge", "--yes"]);
    assert.equal(r.code, 0, r.err);
    assert.ok(!has(join(b.home, ".magik/config.json")));
    assert.ok(has(join(b.vault, "proj2", "memory", "daily", `${TODAY}.md`)), "the vault is never touched");
  });

  it("uninstall --purge keeps a config you have edited", async () => {
    const b = box();
    await installGlobal(b);
    const cfgPath = join(b.home, ".magik/config.json");
    const config = readJson(cfgPath);
    config.projects = { proj3: "third" };
    write(cfgPath, json(config));
    const r = await g(b, ["uninstall", "--scope", "global", "--purge", "--yes"]);
    assert.equal(r.code, 0, r.err);
    assert.match(r.out, /edited since it was created; kept/);
    assert.equal(readJson(cfgPath).projects.proj3, "third");
  });

  it("the project install is untouched by a global uninstall, and the reverse", async () => {
    const p: Project = project();
    assert.equal((await cli(["install", "--yes", "--vault", p.vault], { cwd: p.app, home: p.home })).code, 0);
    assert.equal((await cli(["install", "--scope", "global", "--vault", "~/vault", "--tools", "none", "--yes"], { cwd: p.app, home: p.home })).code, 0);
    assert.equal((await cli(["uninstall", "--scope", "global", "--yes"], { cwd: p.app, home: p.home })).code, 0);
    assert.ok(has(join(p.app, ".magik/lock.json")), "project install intact");
    assert.equal((await cli(["doctor", "--scope", "project"], { cwd: p.app, home: p.home })).code, 0);
    assert.equal((await cli(["uninstall", "--yes"], { cwd: p.app, home: p.home })).code, 0);
    assert.ok(!has(join(p.app, ".magik/lock.json")));
  });

  it("a global status shows both scopes", async () => {
    const b = box();
    await installGlobal(b);
    const r = await g(b, ["status"], { cwd: b.proj2 });
    assert.equal(r.code, 0);
    assert.match(r.out, /project\s+not installed/);
    assert.match(r.out, new RegExp(`global\\s+installed v${PLUGIN_VERSION.replace(/\./g, "\\.")}\\s+profile knowledge\\s+tools cursor,claude,codex`));
    assert.match(r.out, /source: global/);
  });
});

