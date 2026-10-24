/**
 * tests/lib.test.ts: the small pure pieces everything else stands on.
 * Marker blocks, hook-file merging, the lock, flags, skill lint, paths, the
 * catalog and the templates. The installer's safety story (never clobber
 * what the user owns) rests on these, so they are tested edge by edge.
 */

import assert from "node:assert/strict";
import { chmodSync, mkdirSync, symlinkSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";

import { portableVault } from "../src/commands/install.js";
import { parseFlags, toList, UsageError } from "../src/lib/args.js";
import { loadCatalog, loadProfiles, packProblems } from "../src/lib/catalog.js";
import { onPath, realish, toPosix } from "../src/lib/fsx.js";
import { looksLikeOurHook, mergeClaudeHooks, mergeCursorHooks, removeClaudeHooks, removeCursorHooks } from "../src/lib/jsonx.js";
import { LOCK_SCHEMA, emptyLock, readLock, writeLock } from "../src/lib/lock.js";
import { findBlock, removeBlock, upsertBlock } from "../src/lib/markers.js";
import { globalConfigJson, pointerJson, renderPrimer, renderTemplate } from "../src/lib/render.js";
import { buildScope } from "../src/lib/scope.js";
import { lintSkillDir, parseSkillMd } from "../src/lib/skillmd.js";
import { read, tmp, write } from "./_helpers.ts";

const HTML = { style: "html", name: "magik-harness:primer", version: "2.0.0" } as const;

describe("markers", () => {
  it("creates a block in an empty file", () => {
    const r = upsertBlock("", { ...HTML, body: "hello" });
    assert.equal(r.action, "create");
    assert.equal(r.text, "<!-- magik-harness:primer:start v=2.0.0 -->\nhello\n<!-- magik-harness:primer:end -->\n");
  });

  it("inserts at the top of an existing file and leaves the user's text alone", () => {
    const r = upsertBlock("# Mine\n\nmy notes\n", { ...HTML, body: "hello" });
    assert.equal(r.action, "insert");
    assert.ok(r.text.startsWith("<!-- magik-harness:primer:start v=2.0.0 -->\nhello\n<!-- magik-harness:primer:end -->\n\n# Mine"));
    assert.ok(r.text.endsWith("my notes\n"));
  });

  it("can insert at the bottom", () => {
    const r = upsertBlock("# Mine\n", { ...HTML, body: "hello", position: "bottom" });
    assert.ok(r.text.startsWith("# Mine\n\n<!-- magik-harness:primer:start"));
  });

  it("replaces a block in place, reports unchanged for identical input, keeps text around it", () => {
    const first = upsertBlock("# Mine\n", { ...HTML, body: "one" }).text;
    const same = upsertBlock(first, { ...HTML, body: "one" });
    assert.equal(same.action, "unchanged");
    const next = upsertBlock(first, { ...HTML, version: "2.1.0", body: "two" });
    assert.equal(next.action, "update");
    assert.match(next.text, /primer:start v=2\.1\.0 -->\ntwo\n/);
    assert.ok(!next.text.includes("one"));
    assert.ok(next.text.endsWith("# Mine\n"));
  });

  it("keeps CRLF files CRLF", () => {
    const r = upsertBlock("# Mine\r\n", { ...HTML, body: "a\nb" });
    assert.ok(r.text.includes("a\r\nb"));
    assert.ok(!/[^\r]\n/.test(r.text), "no bare LF in a CRLF file");
  });

  it("leaves a block with another name alone, so the project's own text is never taken for ours", () => {
    const other = "<!-- harness:primer:start v=1.9.1 -->\nsomeone else's block\n<!-- harness:primer:end -->\n\n# My project\n";
    const r = upsertBlock(other, { ...HTML, body: "new primer" });
    assert.equal(r.action, "insert");
    assert.ok(r.text.includes("someone else's block"), "the block with a different name is untouched");
    assert.equal(r.text.match(/magik-harness:primer:start/g)?.length, 1);
  });

  it("supports hash-style blocks for .gitignore", () => {
    const r = upsertBlock("node_modules/\n", { style: "hash", name: "magik-harness:gitignore", version: "2.0.0", body: ".magik/backups/", position: "bottom" });
    assert.ok(r.text.includes("# magik-harness:gitignore:start v=2.0.0\n.magik/backups/\n# magik-harness:gitignore:end"));
    assert.equal(findBlock(r.text, "hash", ["magik-harness:gitignore"])?.body, ".magik/backups/");
  });

  it("remove restores the original text exactly", () => {
    const original = "# Mine\n\nmy notes\n";
    const withBlock = upsertBlock(original, { ...HTML, body: "hello" }).text;
    const removed = removeBlock(withBlock, "html", [HTML.name]);
    assert.equal(removed.removed, true);
    assert.equal(removed.text, original);
  });

  it("removing the only content leaves an empty string, and a missing block is a no-op", () => {
    const only = upsertBlock("", { ...HTML, body: "hello" }).text;
    assert.equal(removeBlock(only, "html", [HTML.name]).text, "");
    const r = removeBlock("# nothing here\n", "html", [HTML.name]);
    assert.equal(r.removed, false);
    assert.equal(r.text, "# nothing here\n");
  });

  it("does not mistake a similar marker for ours", () => {
    const text = "<!-- other:start v=1 -->\nx\n<!-- other:end -->\n";
    assert.equal(findBlock(text, "html", [HTML.name]), null);
  });
});

describe("hook registration files", () => {
  const CURSOR_CMD = "node .magik/runtime/session-start.mjs --format cursor";

  it("adds the Cursor entry, keeps other hooks, and is idempotent", () => {
    const foreign = { version: 1, hooks: { sessionStart: [{ command: "orca-hook start" }], stop: [{ command: "orca-hook stop" }] } };
    const a = mergeCursorHooks(foreign, { command: CURSOR_CMD });
    assert.equal(a.changed, true);
    assert.deepEqual(a.doc.hooks.sessionStart, [{ command: "orca-hook start" }, { command: CURSOR_CMD }]);
    assert.deepEqual(a.doc.hooks.stop, [{ command: "orca-hook stop" }]);
    assert.equal(mergeCursorHooks(a.doc, { command: CURSOR_CMD }).changed, false);
  });

  it("creates a Cursor hooks file from nothing", () => {
    const r = mergeCursorHooks(undefined, { command: CURSOR_CMD });
    assert.deepEqual(r.doc, { version: 1, hooks: { sessionStart: [{ command: CURSOR_CMD }] } });
  });

  it("replaces our own older registration instead of stacking a second one", () => {
    const old = { version: 1, hooks: { sessionStart: [{ command: 'node "/old/place/.magik/runtime/session-start.mjs" --format cursor' }] } };
    const r = mergeCursorHooks(old, { command: CURSOR_CMD });
    assert.deepEqual(r.doc.hooks.sessionStart, [{ command: CURSOR_CMD }]);
  });

  it("leaves a hook that is not ours alone, even one that is called session-start", () => {
    const theirs = { version: 1, hooks: { sessionStart: [{ command: "node .cursor/hooks/session-start.js" }] } };
    assert.deepEqual(mergeCursorHooks(theirs, { command: CURSOR_CMD }).doc.hooks.sessionStart, [
      { command: "node .cursor/hooks/session-start.js" },
      { command: CURSOR_CMD },
    ]);
  });

  it("removes only our Cursor entry, and reports a file we created as empty", () => {
    const created = mergeCursorHooks(undefined, { command: CURSOR_CMD }).doc;
    const gone = removeCursorHooks(created, { command: CURSOR_CMD });
    assert.equal(gone.empty, true);
    const shared = mergeCursorHooks({ version: 1, hooks: { sessionStart: [{ command: "orca-hook start" }] } }, { command: CURSOR_CMD }).doc;
    const kept = removeCursorHooks(shared, { command: CURSOR_CMD });
    assert.equal(kept.empty, false);
    assert.deepEqual(kept.doc.hooks.sessionStart, [{ command: "orca-hook start" }]);
  });

  it("merges into Claude settings without touching other keys, and removes cleanly", () => {
    const cmd = 'node "/home/u/.magik/runtime/session-start.mjs" --format claude';
    const settings = { model: "opus", hooks: { SessionStart: [{ matcher: "startup", hooks: [{ type: "command", command: "echo hi" }] }] } };
    const a = mergeClaudeHooks(settings, { command: cmd });
    assert.equal(a.doc.model, "opus");
    assert.equal(a.doc.hooks.SessionStart.length, 2);
    assert.equal(mergeClaudeHooks(a.doc, { command: cmd }).changed, false);
    const back = removeClaudeHooks(a.doc, { command: cmd });
    assert.deepEqual(back.doc, settings);
    assert.equal(back.empty, false);
    assert.equal(removeClaudeHooks(mergeClaudeHooks({}, { command: cmd }).doc, { command: cmd }).empty, true);
  });

  it("keeps a foreign hook that shares a Claude group with ours", () => {
    const cmd = "node .magik/runtime/session-start.mjs --format claude";
    const shared = { hooks: { SessionStart: [{ hooks: [{ type: "command", command: cmd }, { type: "command", command: "echo mine" }] }] } };
    const r = removeClaudeHooks(shared, { command: cmd });
    assert.deepEqual(r.doc.hooks.SessionStart, [{ hooks: [{ type: "command", command: "echo mine" }] }]);
  });

  it("recognises our hook commands and nobody else's", () => {
    assert.equal(looksLikeOurHook("node .magik/runtime/session-start.mjs --format cursor"), true);
    assert.equal(looksLikeOurHook('node "C:\\Users\\x\\.magik\\runtime\\session-start.mjs" --format cursor'), true);
    assert.equal(looksLikeOurHook("node .cursor/hooks/session-start.js"), false, "a hook script that is not ours is never taken for ours");
    assert.equal(looksLikeOurHook("orca-hook start"), false);
    assert.equal(looksLikeOurHook("node scripts/session-start.mjs"), false);
    assert.equal(looksLikeOurHook(42), false);
  });
});

describe("lock file", () => {
  it("round-trips with sorted keys so it merges cleanly in git", () => {
    const dir = tmp("lock");
    const path = join(dir, "lock.json");
    const lock = { ...emptyLock(), version: "2.0.0", files: { "b.txt": "sha256:2", "a.txt": "sha256:1" } };
    writeLock(path, lock);
    const text = read(path);
    assert.ok(text.indexOf('"a.txt"') < text.indexOf('"b.txt"'));
    assert.ok(text.endsWith("\n"));
    const back = readLock(path);
    assert.ok(back.ok);
    if (back.ok) assert.deepEqual(back.lock.files, lock.files);
  });

  it("tells a missing lock from a broken or foreign one", () => {
    const dir = tmp("lock");
    const missing = readLock(join(dir, "nope.json"));
    assert.ok(!missing.ok && missing.missing);
    write(join(dir, "bad.json"), "{ not json");
    const bad = readLock(join(dir, "bad.json"));
    assert.ok(!bad.ok && !bad.missing);
    write(join(dir, "foreign.json"), JSON.stringify({ schema: "something/else@1" }));
    const foreign = readLock(join(dir, "foreign.json"));
    assert.ok(!foreign.ok && /schema/.test(foreign.error));
    assert.equal(LOCK_SCHEMA, "magik-harness/lock@1");
  });
});

describe("flag parsing", () => {
  const spec = { string: ["vault", "tools"], boolean: ["dry-run", "yes", "force"], alias: { y: "yes" } };

  it("handles values, booleans, negation, aliases, = form and --", () => {
    const r = parseFlags(["install", "--vault", "~/v", "--dry-run", "-y", "--no-force", "--tools=cursor,claude", "--", "--literal"], spec);
    assert.deepEqual(r.positional, ["install", "--literal"]);
    assert.deepEqual(r.flags, { vault: "~/v", "dry-run": true, yes: true, force: false, tools: "cursor,claude" });
  });

  it("rejects typos and missing values instead of ignoring them", () => {
    assert.throws(() => parseFlags(["--vualt", "x"], spec), UsageError);
    assert.throws(() => parseFlags(["--vault"], spec), /needs a value/);
    assert.throws(() => parseFlags(["--vault", "--yes"], spec), /needs a value/);
  });

  it("splits lists", () => {
    assert.deepEqual(toList("a, b ,,c"), ["a", "b", "c"]);
    assert.deepEqual(toList(undefined), []);
    assert.deepEqual(toList(true), []);
  });
});

describe("skill files", () => {
  it("parses plain, quoted and folded frontmatter", () => {
    assert.equal(parseSkillMd("---\nname: a\ndescription: Does a thing.\n---\nbody").description, "Does a thing.");
    assert.equal(parseSkillMd('---\nname: "a"\ndescription: \'quoted: yes\'\n---\n').description, "quoted: yes");
    const folded = parseSkillMd("---\nname: a\ndescription: >\n  first line\n  second line\n---\nbody\n");
    assert.equal(folded.description, "first line second line");
    assert.equal(folded.body, "body\n");
  });

  it("reports missing or unclosed frontmatter", () => {
    assert.match(parseSkillMd("# no frontmatter").errors[0], /frontmatter/);
    assert.match(parseSkillMd("---\nname: a\n").errors[0], /not closed/);
  });

  it("lints a skill directory against the Agent Skills rules", () => {
    const dir = tmp("skills");
    const ok = join(dir, "good-skill");
    write(join(ok, "SKILL.md"), "---\nname: good-skill\ndescription: Use when testing.\n---\nbody\n");
    assert.deepEqual(lintSkillDir(ok).problems, []);

    const mismatch = join(dir, "other-name");
    write(join(mismatch, "SKILL.md"), "---\nname: good-skill\ndescription: x\n---\n");
    assert.ok(lintSkillDir(mismatch).problems.some((p) => /must equal the folder name/.test(p)));

    const bad = join(dir, "Bad_Name");
    write(join(bad, "SKILL.md"), `---\nname: Bad_Name\ndescription: ${"x".repeat(1100)}\n---\n`);
    const problems = lintSkillDir(bad).problems.join("\n");
    assert.match(problems, /lowercase/);
    assert.match(problems, /description is 1100 chars/);

    assert.deepEqual(lintSkillDir(join(dir, "empty")).problems, ["SKILL.md is missing"]);
  });
});

describe("paths", () => {
  it("toPosix normalises separators", () => {
    assert.equal(toPosix("a\\b\\c"), "a/b/c");
  });

  it("realish resolves through a symlink even when the target does not exist yet", (t) => {
    const dir = tmp("real");
    mkdirSync(join(dir, "real"));
    try {
      symlinkSync(join(dir, "real"), join(dir, "link"), "dir");
    } catch {
      t.skip("symlinks are not available here");
      return;
    }
    assert.equal(realish(join(dir, "link", "a", "b")), join(dir, "real", "a", "b"));
  });

  it("onPath finds a real command and rejects a bogus one", () => {
    assert.equal(onPath("node", { PATH: dirname(process.execPath), PATHEXT: ".EXE;.CMD" }), true);
    assert.equal(onPath("definitely-not-a-command-xyz", { PATH: dirname(process.execPath) }), false);
    assert.equal(onPath("node", { PATH: "" }), false);
  });

  it("stores a vault path so a tracked pointer works on every machine", () => {
    const home = tmp("home");
    const cwd = join(home, "Projects", "app");
    mkdirSync(cwd, { recursive: true });
    assert.deepEqual(portableVault("~/vault", cwd, home), { value: "~/vault", portable: true });
    assert.deepEqual(portableVault(join(home, "vault"), cwd, home), { value: "~/vault", portable: true });
    assert.deepEqual(portableVault("../../vault", cwd, home), { value: "~/vault", portable: true });
    const outside = tmp("elsewhere");
    const r = portableVault(join(outside, "v"), cwd, home);
    assert.equal(r.portable, false);
    assert.equal(r.value, toPosix(join(outside, "v")));
  });

  it("treats a home behind a symlink as the same home", (t) => {
    const dir = tmp("symhome");
    const realHome = join(dir, "real-home");
    mkdirSync(join(realHome, "work"), { recursive: true });
    try {
      symlinkSync(realHome, join(dir, "linked-home"), "dir");
    } catch {
      t.skip("symlinks are not available here");
      return;
    }
    const r = portableVault(join(realHome, "vault"), join(realHome, "work"), join(dir, "linked-home"));
    assert.deepEqual(r, { value: "~/vault", portable: true });
  });
});

describe("scope", () => {
  it("project scope keeps everything inside the repo", () => {
    const root = tmp("scope");
    const s = buildScope({ kind: "project", projectRoot: root, home: "/home/u" });
    assert.equal(s.pointerPath, join(root, ".magik", "harness.json"));
    assert.equal(s.skillsDir, join(root, ".agents", "skills"));
    assert.equal(s.hookCommand("cursor"), "node .magik/runtime/session-start.mjs --format cursor");
    assert.equal(s.key(join(root, ".agents", "skills", "harness", "SKILL.md")), ".agents/skills/harness/SKILL.md");
    assert.equal(s.runtimeDisplay, ".magik/runtime/session-start.mjs");
  });

  it("global scope lives under the home directory and quotes the hook path", () => {
    const home = tmp("home");
    const s = buildScope({ kind: "global", home });
    assert.equal(s.root, home);
    assert.equal(s.harnessDir, join(home, ".magik"));
    assert.equal(s.pointerPath, join(home, ".magik", "config.json"));
    assert.equal(s.hookCommand("claude"), `node "${join(home, ".magik", "runtime", "session-start.mjs")}" --format claude`);
    assert.equal(s.runtimeDisplay, "~/.magik/runtime/session-start.mjs");
  });

  it("honours a custom MAGIK_HOME and skills dir", () => {
    const home = tmp("home");
    const magik = join(tmp("elsewhere"), "m");
    const s = buildScope({ kind: "global", home, magikHome: magik, skillsDir: ".cursor/skills" });
    assert.equal(s.harnessDir, magik);
    assert.equal(s.skillsDir, join(home, ".cursor", "skills"));
  });
});

describe("catalog and profiles", () => {
  const catalog = loadCatalog();
  const { profiles } = loadProfiles();

  it("ships the core skills and the two opt-in packs", () => {
    for (const name of ["harness", "harness-memory", "knowledge-base", "kb-conventions", "kb-search", "kb-sanitize", "kb-code-sync", "agentic-e2e-loop", "harness-fit"]) {
      assert.ok(catalog.all.has(name), `core skill ${name} is missing`);
    }
    assert.deepEqual(catalog.packs.map((p) => p.name).sort(), ["ci-runners", "worktrees"]);
  });

  it("every profile names skills that exist", () => {
    for (const [name, p] of Object.entries(profiles)) {
      for (const s of p.skills) assert.ok(catalog.all.has(s), `profile ${name} lists unknown skill ${s}`);
    }
  });

  it("the minimal profile needs no vault and the knowledge profile does", () => {
    assert.equal(profiles.minimal.vault, false);
    assert.equal(profiles.knowledge.vault, true);
  });

  it("warns about what a pack needs without refusing it", (t) => {
    if (process.platform === "win32") {
      t.skip("the worktrees pack is darwin/linux only and this test builds a POSIX PATH");
      return;
    }
    const worktrees = catalog.packs.find((p) => p.name === "worktrees");
    assert.ok(worktrees);
    const bin = tmp("bin");
    for (const c of ["git", "python3"]) {
      write(join(bin, c), "#!/bin/sh\n");
      chmodSync(join(bin, c), 0o755);
    }
    assert.deepEqual(packProblems(worktrees, { env: { PATH: bin }, platform: "linux" }), []);
    const none = packProblems(worktrees, { env: { PATH: "" }, platform: "linux" });
    assert.equal(none.length, 2);
    assert.ok(none.every((m) => /needs `/.test(m)));
    const win = packProblems(worktrees, { env: { PATH: bin }, platform: "win32" });
    assert.ok(win.some((m) => /written for darwin, linux/.test(m)));
  });
});

describe("templates", () => {
  it("renders the knowledge primer for both scopes with no stray tokens", () => {
    const project = renderPrimer("primer.knowledge.md", buildScope({ kind: "project", projectRoot: tmp("p"), home: "/h" }));
    assert.ok(!project.includes("{{"));
    assert.ok(project.includes("`.magik/harness.json`"));
    assert.ok(project.includes("kb-search"));
    assert.ok(project.includes("node .magik/runtime/session-start.mjs --format text"));
    const global = renderPrimer("primer.knowledge.md", buildScope({ kind: "global", home: tmp("h") }));
    assert.ok(global.includes("~/.magik/config.json"));
    assert.ok(global.includes("node ~/.magik/runtime/session-start.mjs --format text"));
  });

  it("renders the minimal primer without any vault wording that would mislead", () => {
    const minimal = renderPrimer("primer.minimal.md", buildScope({ kind: "project", projectRoot: tmp("p"), home: "/h" }));
    assert.ok(!minimal.includes("{{"));
    assert.ok(!/kb-search/.test(minimal), "the minimal profile does not ship kb-search");
  });

  it("refuses to leave an unknown token behind", () => {
    assert.throws(() => renderTemplate("a {{NOPE}} b", { OTHER: "x" }), /unreplaced template token/);
    assert.equal(renderTemplate("a {{X}} b", { X: "1" }), "a 1 b");
  });

  it("writes the pointer and global config with the documented defaults", () => {
    const p = JSON.parse(pointerJson({ vault: "~/vault", knowledgeMount: "proj/knowledge", memoryMount: "proj/memory", accessVia: "path", autonomy: "open" }));
    assert.equal(p.schema, "magik-harness/harness@2");
    assert.equal(p.vault, "~/vault");
    assert.deepEqual(p.knowledge, { mount: "proj/knowledge", accessVia: "path", autonomy: "open" });
    assert.deepEqual(p.memory, { mount: "proj/memory", accessVia: "path" });
    const g = JSON.parse(globalConfigJson({ vault: "~/vault", autonomy: "ask", git: "harnessed" }));
    assert.equal(g.schema, "magik-harness/config@1");
    assert.equal(g.layout, "per-project");
    assert.equal(g.knowledge.autonomy, "ask");
    assert.equal(g.memory.inject.maxBytes, 4000);
  });
});
