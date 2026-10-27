// Input nobody planned for: files that point elsewhere, a pds.yaml that sends output
// where it should not go, arguments no one would type, and a rename that cannot
// finish. A command may refuse any of these, and must say why in words; it must not
// crash, hang, or touch anything it was not asked to. Each case here was found by
// attacking the tool, not by reading it.
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { chmodSync, cpSync, existsSync, mkdirSync, readFileSync, renameSync, symlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import { clip, closest, pathProblem } from "../lib/errors.mjs";
import { BANNER } from "../lib/views/index.mjs";
import { analyseRoot, copyExample, LEDGERLY, listFiles, pds, PROJECT_ROOT, recordPath, scratch, snapshot, TODAY } from "./helpers.mjs";

/** Make a symbolic link; where the system does not allow it, the test says so and stops. */
function link(t, target, path) {
  try {
    symlinkSync(target, path);
    return true;
  } catch (e) {
    t.skip(`cannot make symbolic links here (${e.code})`);
    return false;
  }
}

const addToConfig = (root, text) => writeFileSync(join(root, "pds.yaml"), readFileSync(join(root, "pds.yaml"), "utf8") + text);

describe("files that point outside the project", () => {
  it("does not follow a link out of the project, and says which one", async (t) => {
    const root = copyExample();
    const outside = scratch("pds-outside-");
    writeFileSync(join(outside, "FEAT-external.md"), "---\nid: FEAT-external\ntitle: Outside\n---\n");
    if (!link(t, outside, join(root, "definition", "structure", "linked"))) return;
    for (const command of ["lint", "status", "next"]) {
      const r = await pds([command, "--root", root]);
      assert.equal(r.code, 1, command);
      assert.match(r.err, /definition\/structure\/linked is a link to .*, outside the project/, command);
    }
  });

  it("does not follow a definition folder that is a link out of the project", async (t) => {
    const root = copyExample();
    const moved = join(scratch("pds-outside-"), "definition");
    renameSync(join(root, "definition"), moved);
    if (!link(t, moved, join(root, "definition"))) return;
    const r = await pds(["lint", "--root", root]);
    assert.equal(r.code, 1);
    assert.match(r.err, /definition is a link to .*, outside the project/);
  });

  it("follows a link that stays inside the project", async (t) => {
    const root = copyExample();
    assert.equal((await pds(["new", "FEAT", "linked", "--anchor", "CAP-invoicing", "--root", root])).code, 0);
    const real = join(root, "notes", "FEAT-linked.md");
    mkdirSync(join(root, "notes"));
    renameSync(recordPath(root, "FEAT-linked"), real);
    if (!link(t, real, recordPath(root, "FEAT-linked"))) return;
    assert.ok(analyseRoot(root).model.has("FEAT-linked"));
  });

  it("works when the project folder is itself reached through a link", async (t) => {
    const root = copyExample();
    const alias = join(scratch("pds-alias-"), "project");
    if (!link(t, root, alias)) return;
    const r = await pds(["lint", "--root", alias]);
    assert.equal(r.code, 0, r.err + r.out);
    assert.match(r.out, /\b0 errors\b/);
  });

  it("says so when a link leads nowhere", async (t) => {
    const root = copyExample();
    if (!link(t, join(root, "nowhere.md"), join(root, "definition", "structure", "FEAT-ghost.md"))) return;
    const r = await pds(["lint", "--root", root]);
    assert.equal(r.code, 1);
    assert.match(r.err, /definition\/structure\/FEAT-ghost\.md is a link that leads nowhere/);
  });

  it("does not wait for a pipe that is named like a record", (t) => {
    const root = copyExample();
    try {
      execFileSync("mkfifo", [join(root, "definition", "structure", "FEAT-pipe.md")]);
    } catch {
      t.skip("no mkfifo here");
      return;
    }
    // a child process, because a read that waits for ever cannot be interrupted from inside the test
    const r = spawnSync(process.execPath, [join(PROJECT_ROOT, "tools", "pds.mjs"), "lint", "--root", root], { env: { ...process.env, PDS_TODAY: TODAY }, encoding: "utf8", timeout: 60_000 });
    assert.equal(r.error, undefined, "it finished instead of waiting for the pipe");
    assert.equal(r.status, 0, r.stderr + r.stdout);
  });
});

describe("a pds.yaml that sends files elsewhere", () => {
  const ELSEWHERE = scratch("pds-elsewhere-");
  const OUTSIDE = ["../outside-views", ELSEWHERE, "..", ".", "a/../../b", "C:\\elsewhere", "''"];

  for (const where of OUTSIDE) {
    it(`keeps views_dir inside the project: ${where === ELSEWHERE ? "an absolute path" : where}`, async () => {
      const root = copyExample();
      addToConfig(root, `views_dir: ${where}\n`);
      const before = snapshot(root);
      const lint = await pds(["lint", "--root", root]);
      assert.equal(lint.code, 1);
      assert.match(lint.out, /views_dir must be (a folder inside the project|the name of a folder)/);
      const views = await pds(["views", "--root", root]);
      assert.equal(views.code, 1, views.err);
      assert.match(views.err, /views_dir must be (a folder inside the project|the name of a folder).*--out/);
      assert.deepEqual(snapshot(root), before, "nothing was written");
      assert.ok(!existsSync(join(root, "..", "outside-views")), "nothing was written next to the project");
      assert.deepEqual(listFiles(ELSEWHERE), [], "nothing was written to the absolute path");
    });
  }

  it("keeps views and records apart, whichever way they overlap", async () => {
    for (const [key, value, extra] of [["views_dir", "definition", ""], ["views_dir", "definition/views", ""], ["definition_dir", "views", ""], ["views_dir", "definition_copy", "definition_dir: definition_copy\n"]]) {
      const root = copyExample();
      addToConfig(root, `${extra}${key}: ${value}\n`);
      const lint = await pds(["lint", "--root", root]);
      assert.equal(lint.code, 1, `${key}: ${value}`);
      assert.match(lint.out, /must be separate folders, neither inside the other/, `${key}: ${value}`);
      const before = snapshot(root);
      const views = await pds(["views", "--root", root]);
      assert.equal(views.code, 1, `${key}: ${value}`);
      assert.deepEqual(snapshot(root), before, `${key}: ${value} wrote nothing`);
    }
  });

  it("keeps views_dir inside the project even when it is a link to somewhere else", async (t) => {
    const root = copyExample();
    const outside = scratch("pds-outside-views-");
    if (!link(t, outside, join(root, "evil-views"))) return;
    addToConfig(root, "views_dir: evil-views\n");
    const lint = await pds(["lint", "--root", root]);
    assert.equal(lint.code, 1);
    assert.match(lint.out, /views_dir \(evil-views\) leads outside the project/);
    const r = await pds(["views", "--root", root]);
    assert.equal(r.code, 1, r.err);
    assert.match(r.err, /leads outside the project/);
    assert.deepEqual(listFiles(outside), [], "nothing was written through the link");
  });

  it("will not write views into the definition folder through a link", async (t) => {
    const root = copyExample();
    if (!link(t, "definition", join(root, "out-link"))) return;
    const before = snapshot(root);
    const r = await pds(["views", "--out", join(root, "out-link"), "--root", root]);
    assert.equal(r.code, 2, r.err);
    assert.match(r.err, /definition folder/);
    assert.deepEqual(snapshot(root), before);
  });

  it("sees through a capital letter where the file system ignores case", async (t) => {
    const root = copyExample();
    if (!existsSync(join(root, "Definition"))) {
      t.skip("this file system tells Definition from definition");
      return;
    }
    addToConfig(root, "views_dir: Definition\n");
    const lint = await pds(["lint", "--root", root]);
    assert.match(lint.out, /one folder, or one is inside the other/);
    const before = snapshot(root);
    assert.equal((await pds(["views", "--root", root])).code, 1);
    const out = await pds(["views", "--out", join(root, "Definition"), "--root", root]);
    assert.equal(out.code, 2, out.err);
    assert.deepEqual(snapshot(root), before, "nothing was written into the records");
  });

  it("keeps definition_dir inside the project", async () => {
    const root = copyExample();
    addToConfig(root, "definition_dir: ../elsewhere\n");
    const r = await pds(["lint", "--root", root]);
    assert.equal(r.code, 1);
    assert.match(r.out, /definition_dir must be a folder inside the project, not \.\.\/elsewhere/);
  });

  it("will not write generated views over the definition, or sweep it", async () => {
    const root = copyExample();
    for (const out of [join(root, "definition"), join(root, "definition", "views"), root, join(root, "..")]) {
      const before = snapshot(root);
      const r = await pds(["views", "--out", out, "--root", root]);
      assert.equal(r.code, 2, out);
      assert.match(r.err, /definition folder/, out);
      assert.deepEqual(snapshot(root), before, `${out}: nothing changed`);
    }
  });

  it("removes only the views that pds itself generated", async () => {
    const out = scratch("pds-views-");
    writeFileSync(join(out, "someone-elses.md"), "<!-- Generated by mkdocs -->\n# Another tool's page\n");
    writeFileSync(join(out, "mine.md"), "# Written by hand\n");
    writeFileSync(join(out, "stale.md"), BANNER("deps") + "an old view\n");
    const r = await pds(["views", "--out", out, "--root", LEDGERLY]);
    assert.equal(r.code, 0, r.err);
    assert.ok(existsSync(join(out, "someone-elses.md")), "another tool's generated page stays");
    assert.ok(existsSync(join(out, "mine.md")), "a hand-written page stays");
    assert.ok(!existsSync(join(out, "stale.md")), "a stale view of ours goes");
    assert.match(r.out, /1 stale removed/);
  });
});

describe("a rename that cannot finish", () => {
  it("puts every file back when the new name cannot be written", async () => {
    const root = copyExample();
    mkdirSync(recordPath(root, "TERM-customer")); // a folder where the renamed record has to go
    const before = snapshot(root);
    const referrers = [...before].filter(([path, text]) => /\bTERM-client\b/.test(text) && !path.endsWith("/TERM-client.md")).map(([path]) => path);
    assert.ok(referrers.some((path) => path < "definition/information/TERM-client.md"), "test setup: another file is rewritten before the record is moved");
    const r = await pds(["rename", "TERM-client", "TERM-customer", "--root", root]);
    assert.equal(r.code, 2, r.out + r.err);
    assert.match(r.err, /it is a folder, not a file/);
    assert.deepEqual(snapshot(root), before, "every file is as it was");
  });

  it("puts every file back when a later file is read-only", async (t) => {
    const root = copyExample();
    const before = snapshot(root);
    const referrers = [...before].filter(([path, text]) => path.startsWith("definition/") && /\bENT-invoice\b/.test(text) && !path.endsWith("/ENT-invoice.md")).map(([path]) => path).sort();
    assert.ok(referrers.length > 2, "test setup: several files refer to the id");
    const last = join(root, referrers.at(-1));
    chmodSync(last, 0o444);
    try {
      writeFileSync(last, readFileSync(last)); // the same bytes: only to see whether read-only holds here (not for root)
      t.skip("this account can write to read-only files");
      return;
    } catch {
      // good: it cannot
    }
    const r = await pds(["rename", "ENT-invoice", "ENT-bill", "--root", root]);
    assert.equal(r.code, 2, r.out + r.err);
    assert.match(r.err, /permission denied/);
    assert.deepEqual(snapshot(root), before, "every file is as it was");
    assert.ok(!existsSync(recordPath(root, "ENT-bill")));
  });
});

describe("arguments nobody would type", () => {
  it("answers a hundred-kilobyte id in moments, and does not repeat all of it", async () => {
    const long = "A".repeat(100_000);
    for (const argv of [["ask", long], ["explain", long], ["impact", long], ["spec", long], ["view", "deps", long], ["rename", long, "FEAT-x"], ["approve", long, "--by", "x"], ["new", "FEAT", "x", "--anchor", long]]) {
      const started = Date.now();
      const r = await pds([...argv, "--root", LEDGERLY]);
      assert.ok(Date.now() - started < 5000, `${argv[0]} took ${Date.now() - started} ms`);
      assert.ok(r.code === 1 || r.code === 2, `${argv[0]} exits ${r.code}`);
      assert.ok(r.err.length < 2000, `${argv[0]} printed ${r.err.length} characters`);
    }
  });

  it("starts no project where a file is in the way", async () => {
    const dir = scratch();
    const file = join(dir, "a-file");
    writeFileSync(file, "x");
    const onFile = await pds(["init", file]);
    assert.equal(onFile.code, 2);
    assert.match(onFile.err, /is a file, not a folder/);
    const underFile = await pds(["init", join(file, "inside")]);
    assert.equal(underFile.code, 2);
    assert.match(underFile.err, /cannot create the folder /);
    assert.equal(readFileSync(file, "utf8"), "x");
  });

  it("writes views where a file is in the way as a refusal, not a crash", async () => {
    const dir = scratch();
    const file = join(dir, "a-file");
    writeFileSync(file, "x");
    const r = await pds(["views", "--out", join(file, "sub"), "--root", LEDGERLY]);
    assert.equal(r.code, 2, r.err);
    assert.match(r.err, /^pds: cannot /);
  });

  it("says so, and exits 2, when the meta-model it was pointed at cannot be loaded", async () => {
    const meta = scratch("pds-meta-");
    cpSync(join(PROJECT_ROOT, "meta-model"), meta, { recursive: true });
    writeFileSync(join(meta, "element-types.yaml"), "[[[\n");
    const r = await pds(["meta", "check", "--meta", meta]);
    assert.equal(r.code, 2, r.out + r.err);
    assert.match(r.err, /cannot load the meta-model: element-types\.yaml/);
  });

  it("refuses a title that would make an impossible file name, and creates nothing", async () => {
    const root = copyExample();
    const before = snapshot(root);
    const r = await pds(["new", "FEAT", "A very long title ".repeat(30), "--anchor", "CAP-invoicing", "--root", root]);
    assert.equal(r.code, 2, r.out + r.err);
    assert.match(r.err, /the name is too long/);
    assert.deepEqual(snapshot(root), before);
  });
});

describe("the typo helper and the words for a path that cannot be used", () => {
  it("still finds the nearest of a few likely typos, and gives up on absurd input", () => {
    const ids = ["FEAT-send-invoice", "FEAT-pay-invoice-online", "ENT-invoice"];
    assert.equal(closest("FEAT-send-invoic", ids), "FEAT-send-invoice");
    assert.equal(closest("feat-send-invoice", ids), "FEAT-send-invoice", "case does not matter");
    assert.equal(closest("completely-different-thing", ids), undefined);
    assert.equal(closest("A".repeat(100_000), ids), undefined);
    assert.equal(closest("", ids), undefined, "nothing is near the empty word");
  });

  it("never prints more than a screenful", () => {
    assert.equal(clip("short"), "short");
    assert.equal(clip("x".repeat(100_000)).length, 1500);
    assert.ok(clip("x".repeat(100_000)).endsWith("…"));
  });

  it("explains the errors the file system gives about a path, and only those", () => {
    assert.equal(pathProblem({ code: "EEXIST", path: "/a/b", syscall: "mkdir" }), "cannot create the folder /a/b: it already exists");
    assert.equal(pathProblem({ code: "EACCES", path: "/a/b", syscall: "open" }), "cannot open /a/b: permission denied");
    assert.equal(pathProblem({ code: "ENAMETOOLONG", path: "/a/b" }), "cannot use /a/b: the name is too long");
    assert.equal(pathProblem({ code: "ENOSPC", path: "/a/b", syscall: "write" }), null, "a full disk is not a mistake in the path");
    assert.equal(pathProblem({ code: "EEXIST" }), null, "no path, nothing to say about it");
    assert.equal(pathProblem(new TypeError("x is not a function")), null);
    assert.equal(pathProblem(null), null);
    assert.equal(pathProblem({ code: "constructor", path: "/a" }), null, "only the codes it knows");
  });
});
