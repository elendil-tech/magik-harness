/**
 * tests/worktree-audit.test.ts — coverage for skills/worktree-audit/scripts/wt_audit.py.
 *
 * Everything runs in a throwaway sandbox: HOME is redirected so the durable / Cursor /
 * Orca roots resolve inside it, "origin" is a local bare repo, and `gh` is a fake on PATH
 * (so the PR logic — including the squash-merge case that defeats ancestry checks — runs
 * without network). Nothing outside the sandbox is read or modified.
 */

import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test, { after } from "node:test";
import assert from "node:assert/strict";

const TEST_DIR = dirname(fileURLToPath(import.meta.url));
const PLUGIN_ROOT = dirname(TEST_DIR);
const TOOL = join(PLUGIN_ROOT, "skills", "worktree-audit", "scripts", "wt_audit.py");

// The tool is POSIX-only (lsof, symlinks, POSIX paths), and so is this fixture (`sleep`, `#!/bin/sh`).
const posix = process.platform !== "win32";
const hasTools =
  posix &&
  spawnSync("python3", ["--version"]).status === 0 &&
  spawnSync("git", ["--version"]).status === 0;
const opts = {
  skip: hasTools ? false : posix ? "python3 and git are required" : "POSIX-only tool; skipped on Windows",
};

const sandbox = realpathSync(mkdtempSync(join(tmpdir(), "wt-audit-")));
const home = join(sandbox, "home");
const projects = join(home, "Projects");
const durable = join(home, "worktrees");
const cursorRoot = join(home, ".cursor", "worktrees");
const binDir = join(sandbox, "bin");
const prFile = join(sandbox, "prs.json");

const baseEnv: NodeJS.ProcessEnv = {
  ...process.env,
  HOME: home,
  WORKTREES_HOME: durable,
  WT_REPOS_ROOT: projects,
  ORCA_WORKSPACES: join(home, "orca", "workspaces"),
  WT_FRESH_DAYS: "0",
  WT_PROTECT: "dev,dev2,dev3",
  GIT_CONFIG_GLOBAL: join(sandbox, "gitconfig"),
  GIT_CONFIG_NOSYSTEM: "1",
  GH_PROMPT_DISABLED: "1",
};
// Same, but with a fake `gh` first on PATH that serves ${prFile}.
const prEnv: NodeJS.ProcessEnv = { ...baseEnv, PATH: `${binDir}:${process.env.PATH ?? ""}` };

function sh(cwd: string, cmd: string, args: string[], env = baseEnv): string {
  const r = spawnSync(cmd, args, { cwd, env, encoding: "utf8" });
  if (r.status !== 0) {
    throw new Error(`${cmd} ${args.join(" ")} (in ${cwd}) failed:\n${r.stdout}${r.stderr}`);
  }
  return r.stdout.trim();
}
const git = (cwd: string, ...args: string[]) => sh(cwd, "git", args);

function audit(args: string[], env = baseEnv): { code: number | null; out: string } {
  const r = spawnSync("python3", [TOOL, ...args], { env, encoding: "utf8" });
  return { code: r.status, out: `${r.stdout}${r.stderr}` };
}

interface Row {
  name: string;
  path: string;
  where: string;
  verdict: string;
  branch: string;
}
function inventory(env = baseEnv, extra: string[] = []) {
  const r = audit(["inventory", "--json", ...extra], env);
  assert.equal(r.code, 0, r.out);
  const data = JSON.parse(r.out) as {
    repos: { repo: string; worktrees: Row[] }[];
    strays: { kind: string; path: string }[];
    janitor: {
      cursor_root_worktrees: number;
      cap: number;
      would_remove: number;
      aliases: { path: string; target: string }[];
    };
  };
  const rows: Record<string, Row> = {};
  for (const repo of data.repos) for (const w of repo.worktrees) rows[w.name] = w;
  return { data, rows };
}

const wtPath = (name: string) => join(durable, "app", name);
let app = "";
let busy: ChildProcess | undefined;

function setup(): void {
  writeFileSync(
    baseEnv.GIT_CONFIG_GLOBAL as string,
    "[init]\n\tdefaultBranch = main\n[user]\n\tname = t\n\temail = t@example.com\n" +
      "[protocol \"file\"]\n\tallow = always\n[commit]\n\tgpgsign = false\n",
  );
  mkdirSync(projects, { recursive: true });
  mkdirSync(binDir, { recursive: true });
  const origin = join(sandbox, "origin.git");
  git(sandbox, "init", "--bare", origin);
  app = join(projects, "app");
  git(projects, "clone", origin, app);
  writeFileSync(join(app, "README.md"), "app\n");
  writeFileSync(join(app, ".gitignore"), ".env.local\nnode_modules/\n");
  git(app, "add", ".");
  git(app, "commit", "-m", "init");
  git(app, "push", "-u", "origin", "main");

  const add = (name: string, branch: string, root = durable, from = "origin/main") => {
    const dir = join(root, "app", name);
    git(app, "worktree", "add", "-b", branch, dir, from);
    return dir;
  };
  const commit = (dir: string, file: string) => {
    writeFileSync(join(dir, file), `${file}\n`);
    git(dir, "add", file);
    git(dir, "commit", "-m", `add ${file}`);
  };
  const merge = (dir: string, branch: string) => {
    git(dir, "push", "origin", `${branch}:${branch}`);
    git(dir, "push", "origin", `${branch}:main`); // fast-forward main
    git(app, "fetch", "origin");
  };

  // finished work: pushed and fast-forwarded into main
  const done = add("done", "feat/done");
  commit(done, "done.txt");
  merge(done, "feat/done");
  // second finished worktree that also holds an ignored, non-regenerable file
  const ignored = add("ignored", "feat/ignored");
  commit(ignored, "ignored.txt");
  merge(ignored, "feat/ignored");
  writeFileSync(join(ignored, ".env.local"), "SECRET=1\n");

  const dirty = add("dirty", "feat/dirty");
  writeFileSync(join(dirty, "wip.txt"), "wip\n");

  const unpushed = add("unpushed", "feat/unpushed");
  commit(unpushed, "unpushed.txt");

  const active = add("active", "feat/active");
  commit(active, "active.txt");
  git(active, "push", "origin", "feat/active:feat/active");

  // squash merge: main gets different commits with the same content; the branch tip is NOT
  // an ancestor of main, so only the PR's head commit proves it landed.
  const squashed = add("squashed", "feat/squashed");
  commit(squashed, "squashed.txt");
  git(squashed, "push", "origin", "feat/squashed:feat/squashed");
  git(app, "merge", "--ff-only", "origin/main"); // the primary's main is behind the pushes above
  writeFileSync(join(app, "squashed.txt"), "squashed.txt\n");
  git(app, "add", "squashed.txt");
  git(app, "commit", "-m", "squash: squashed.txt");
  git(app, "push", "origin", "main");
  git(app, "fetch", "origin");

  // merged PR, but the local tip moved on after the merge (and was pushed)
  const moved = add("moved", "feat/moved");
  commit(moved, "moved.txt");
  git(moved, "push", "origin", "feat/moved:feat/moved");

  add("dev", "dev/workspace"); // standing lane
  add("busy", "feat/busy");
  add("abc123", "cursor/abc123", cursorRoot);
  const legacy = join(projects, "app-worktrees", "legacy");
  git(app, "worktree", "add", "-b", "feat/legacy", legacy, "origin/main");

  // vault siblings: one paired with `done`, one orphan
  const vaultOrigin = join(sandbox, "vault.git");
  git(sandbox, "init", "--bare", vaultOrigin);
  const seedVault = join(sandbox, "vault-seed");
  git(sandbox, "clone", vaultOrigin, seedVault);
  writeFileSync(join(seedVault, "k.md"), "k\n");
  git(seedVault, "add", ".");
  git(seedVault, "commit", "-m", "kb");
  git(seedVault, "push", "-u", "origin", "main");
  git(durable, "clone", vaultOrigin, join(durable, "app", "done.vault"));
  git(durable, "clone", vaultOrigin, join(durable, "app", "gone.vault"));

  // process that keeps a directory busy
  busy = spawn("sleep", ["300"], { cwd: wtPath("busy"), stdio: "ignore" });

  // fake gh: serves prs.json for `gh pr list`
  writeFileSync(
    join(binDir, "gh"),
    `#!/bin/sh\nif [ "$1" = "pr" ] && [ "$2" = "list" ]; then cat "${prFile}"; exit 0; fi\nexit 1\n`,
  );
  chmodSync(join(binDir, "gh"), 0o755);
  const tip = (b: string) => git(app, "rev-parse", b);
  writeFileSync(
    prFile,
    JSON.stringify([
      { number: 7, state: "OPEN", isDraft: false, headRefName: "feat/active", headRefOid: tip("feat/active") },
      { number: 8, state: "MERGED", isDraft: false, headRefName: "feat/squashed", headRefOid: tip("feat/squashed") },
      { number: 9, state: "MERGED", isDraft: false, headRefName: "feat/moved", headRefOid: "0".repeat(40) },
    ]),
  );
}

if (hasTools) setup();
after(() => {
  busy?.kill();
  rmSync(sandbox, { recursive: true, force: true });
});

// ---------------------------------------------------------------- inventory
test("inventory — verdicts follow the git facts (no PR data)", opts, () => {
  const { rows } = inventory();
  assert.equal(rows.done.verdict, "DONE");
  assert.equal(rows.ignored.verdict, "DONE");
  assert.equal(rows.dirty.verdict, "DIRTY");
  assert.equal(rows.unpushed.verdict, "UNPUSHED");
  assert.equal(rows.active.verdict, "ACTIVE");
  assert.equal(rows.dev.verdict, "STANDING");
  assert.equal(rows.busy.verdict, "IN-USE");
  assert.equal(rows.app.verdict, "primary");
});

test("inventory — a worktree with no commits of its own is NEW, not DONE, while fresh", opts, () => {
  const { rows } = inventory({ ...baseEnv, WT_FRESH_DAYS: "2" });
  assert.equal(rows.dev.verdict, "STANDING");
  assert.equal(rows.legacy.verdict, "NEW");
});

test("inventory — roots are classified", opts, () => {
  const { rows, data } = inventory();
  assert.equal(rows.done.where, "durable");
  assert.equal(rows.abc123.where, "cursor");
  assert.equal(rows.legacy.where, "legacy");
  assert.equal(data.janitor.cursor_root_worktrees, 1);
  assert.equal(data.janitor.cap, 25);
  assert.equal(data.janitor.would_remove, 0);
  assert.deepEqual(data.janitor.aliases, []);
});

// ---------------------------------------------------------------- the janitor's count
// Cursor's janitor counts folders under <root>/<repo>/<id>, not git registrations (checked
// against Cursor 3.24): a symlink to a worktree is a second entry, and
// `git worktree remove` on the link deletes the real worktree.
test("inventory — the janitor counts what Cursor counts: a link does, empty and broken folders do not", opts, () => {
  const target = join(cursorRoot, "app", "abc123");
  const link = join(cursorRoot, "app", "alias");
  const empty = join(cursorRoot, "app", "empty");
  const broken = join(cursorRoot, "app", "broken");
  symlinkSync(target, link);
  mkdirSync(empty, { recursive: true });
  mkdirSync(broken, { recursive: true });
  writeFileSync(join(broken, ".git"), "gitdir: /nonexistent/.git/worktrees/broken\n");
  try {
    const { data } = inventory();
    assert.equal(data.janitor.cursor_root_worktrees, 2, "abc123 and its link; not the empty or broken folder");
    assert.equal(data.janitor.would_remove, 0, "far below the cap");
    assert.deepEqual(data.janitor.aliases, [{ path: link, target }]);
    assert.match(
      audit(["inventory"]).out,
      /ALIAS +: ~\/\.cursor\/worktrees\/app\/alias -> ~\/\.cursor\/worktrees\/app\/abc123/,
    );
  } finally {
    rmSync(link);
    rmSync(empty, { recursive: true, force: true });
    rmSync(broken, { recursive: true, force: true });
  }
});

test("inventory — past the cap the next cleanup removes the excess plus four", opts, () => {
  const settings = join(home, "Library", "Application Support", "Cursor", "User", "settings.json");
  const link = join(cursorRoot, "app", "alias");
  mkdirSync(dirname(settings), { recursive: true });
  writeFileSync(settings, '{\n  "cursor.worktreeMaxCount": 1\n}\n');
  symlinkSync(join(cursorRoot, "app", "abc123"), link); // 2 counted entries against a cap of 1
  try {
    const { data } = inventory();
    assert.equal(data.janitor.cap, 1);
    assert.equal(data.janitor.would_remove, 5, "excess 1 + 4");
    assert.match(audit(["inventory"]).out, /over the cap +: the next cleanup removes 5 at once/);
  } finally {
    rmSync(link);
    rmSync(settings);
  }
});

// ---------------------------------------------------------------- Orca's root
// Orca 1.4+ keeps its settings in a SQLite profile store (WAL mode); orca-data.json is only the
// copy from before the migration, frozen at that moment, so it can name a stale directory.
const orcaBase = join(home, "Library", "Application Support", "orca");
const orcaDb = join(orcaBase, "profiles", "local-default", "profile-state.db");
const withoutOverride = (() => {
  const env = { ...baseEnv };
  delete env.ORCA_WORKSPACES;
  return env;
})();
// Builds the store with a `settings` document naming `wsdir`. With hold=1 the writer stays open
// while the tool runs, as a running Orca does: its newest pages exist only in the -wal file.
const ORCA_STORE_PY = `
import json, subprocess, sqlite3, sys
db, wsdir, tool, hold = sys.argv[1:5]
c = sqlite3.connect(db)
c.execute("pragma journal_mode=wal")
c.execute("pragma wal_autocheckpoint=0")
c.execute("create table profile_state_documents (domain text primary key, payload text not null, domain_version integer not null, revision integer not null, updated_at integer not null, content_hash text not null)")
c.execute("insert into profile_state_documents values ('settings', ?, 1, 1, 0, 'x')", (json.dumps({"workspaceDir": wsdir, "nestWorkspaces": True}),))
c.commit()
code = 0
if hold == "1":
    r = subprocess.run([sys.executable, tool, "inventory", "--json"], capture_output=True, text=True)
    sys.stdout.write(r.stdout)
    sys.stderr.write(r.stderr)
    code = r.returncode
c.close()
sys.exit(code)
`;
const orcaRoot = (): string => {
  const r = audit(["inventory", "--json"], withoutOverride);
  assert.equal(r.code, 0, r.out);
  return (JSON.parse(r.out) as { roots: { orca: string } }).roots.orca;
};

test("inventory — Orca's root comes from its live profile store, not the frozen legacy file", opts, () => {
  const live = join(sandbox, "orca-live");
  const stale = join(sandbox, "orca-stale");
  mkdirSync(dirname(orcaDb), { recursive: true });
  writeFileSync(join(orcaBase, "orca-data.json"), JSON.stringify({ settings: { workspaceDir: stale } }));
  try {
    assert.equal(orcaRoot(), stale, "no profile store yet: the legacy file is the fallback");
    const mk = spawnSync("python3", ["-c", ORCA_STORE_PY, orcaDb, live, TOOL, "0"], { encoding: "utf8" });
    assert.equal(mk.status, 0, mk.stderr);
    assert.ok(!existsSync(`${orcaDb}-wal`) && !existsSync(`${orcaDb}-shm`), "fixture is a stopped Orca");
    assert.equal(orcaRoot(), live, "the live store wins over the legacy file");
    assert.ok(
      !existsSync(`${orcaDb}-wal`) && !existsSync(`${orcaDb}-shm`),
      "reading must not leave -wal/-shm files beside Orca's data",
    );
  } finally {
    rmSync(orcaBase, { recursive: true, force: true });
  }
});

test("inventory — a running Orca's newest settings sit in its -wal file, and are read from there", opts, () => {
  const live = join(sandbox, "orca-live");
  mkdirSync(dirname(orcaDb), { recursive: true });
  writeFileSync(
    join(orcaBase, "orca-data.json"),
    JSON.stringify({ settings: { workspaceDir: join(sandbox, "orca-stale") } }),
  );
  try {
    const r = spawnSync("python3", ["-c", ORCA_STORE_PY, orcaDb, live, TOOL, "1"], {
      env: withoutOverride,
      encoding: "utf8",
    });
    assert.equal(r.status, 0, r.stderr);
    assert.equal((JSON.parse(r.stdout) as { roots: { orca: string } }).roots.orca, live);
  } finally {
    rmSync(orcaBase, { recursive: true, force: true });
  }
});

test("inventory — orphan vault clones are strays; paired ones are not", opts, () => {
  const { data } = inventory();
  const orphan = data.strays.filter((s) => s.kind === "orphan-vault").map((s) => s.path);
  assert.deepEqual(orphan, [join(durable, "app", "gone.vault")]);
  assert.ok(!data.strays.some((s) => s.path.endsWith("done.vault")));
});

test("inventory — --only narrows the report but never the registry", opts, () => {
  const { data } = inventory(baseEnv, ["--only", "no-such-repo"]);
  assert.equal(data.repos.length, 0);
  assert.ok(!data.strays.some((s) => s.kind === "unregistered-checkout"));
});

test("inventory --prs — an open PR keeps the worktree; a squash merge is recognised by its tip", opts, () => {
  const { rows } = inventory(prEnv, ["--prs"]);
  assert.equal(rows.active.verdict, "OPEN-PR");
  assert.equal(rows.squashed.verdict, "DONE", "squash-merged: ancestry says no, the PR tip says yes");
  assert.equal(rows.moved.verdict, "REVIEW", "merged PR but the local tip moved on");
});

test("inventory without PR data does not mistake a squash merge for finished work", opts, () => {
  const { rows } = inventory();
  assert.equal(rows.squashed.verdict, "ACTIVE");
});

// ---------------------------------------------------------------- remove: refusals
for (const [name, expected] of [
  ["dirty", "uncommitted work"],
  ["unpushed", "exist on no remote"],
  ["dev", "standing lane"],
  ["active", "not finished"],
  ["busy", "in use by"],
] as const) {
  test(`remove — refuses ${name} (exit 2)`, opts, () => {
    const r = audit(["remove", wtPath(name), "--apply"]);
    assert.equal(r.code, 2, r.out);
    assert.match(r.out, new RegExp(expected));
    assert.ok(existsSync(wtPath(name)), "nothing was removed");
  });
}

test("remove — refuses the primary checkout", opts, () => {
  const r = audit(["remove", app, "--apply"]);
  assert.equal(r.code, 2, r.out);
  assert.match(r.out, /primary checkout/);
});

test("remove — an open PR blocks unless explicitly allowed", opts, () => {
  const blocked = audit(["remove", wtPath("active"), "--apply"], prEnv);
  assert.equal(blocked.code, 2, blocked.out);
  assert.match(blocked.out, /PR #7 is still open/);
  const dry = audit(["remove", wtPath("active"), "--allow-open-pr"], prEnv);
  assert.equal(dry.code, 0, dry.out);
  assert.match(dry.out, /DRY RUN/);
  assert.ok(existsSync(wtPath("active")));
});

test("remove — unmerged but pushed work needs --allow-unmerged (dry run, nothing removed)", opts, () => {
  const r = audit(["remove", wtPath("active"), "--allow-unmerged"]);
  assert.equal(r.code, 0, r.out);
  assert.match(r.out, /DRY RUN/);
  assert.ok(existsSync(wtPath("active")));
});

test("remove — ignored, non-regenerable files block until accepted", opts, () => {
  const r = audit(["remove", wtPath("ignored"), "--apply"]);
  assert.equal(r.code, 2, r.out);
  assert.match(r.out, /\.env\.local/);
  assert.ok(existsSync(wtPath("ignored")));
});

// ---------------------------------------------------------------- remove: success paths
test("remove — a finished worktree is a dry run by default", opts, () => {
  const r = audit(["remove", wtPath("done"), "--delete-branch", "--vault"]);
  assert.equal(r.code, 0, r.out);
  assert.match(r.out, /DRY RUN/);
  assert.match(r.out, /branch -D feat\/done/);
  assert.ok(existsSync(wtPath("done")) && existsSync(`${wtPath("done")}.vault`));
});

test("remove --apply — worktree, merged branch and vault sibling go; nothing else does", opts, () => {
  const r = audit(["remove", wtPath("done"), "--delete-branch", "--vault", "--apply"]);
  assert.equal(r.code, 0, r.out);
  assert.ok(!existsSync(wtPath("done")));
  assert.ok(!existsSync(`${wtPath("done")}.vault`));
  assert.equal(git(app, "branch", "--list", "feat/done"), "");
  assert.ok(!git(app, "worktree", "list").includes(wtPath("done")));
  assert.ok(existsSync(wtPath("ignored")) && existsSync(wtPath("dirty")));
});

test("remove --apply — a squash-merged branch is deleted only because the PR tip matches", opts, () => {
  const r = audit(["remove", wtPath("squashed"), "--delete-branch", "--apply"], prEnv);
  assert.equal(r.code, 0, r.out);
  assert.ok(!existsSync(wtPath("squashed")));
  assert.equal(git(app, "branch", "--list", "feat/squashed"), "");
});

test("remove --apply --accept-ignored — removes the worktree once the ignored file is accepted", opts, () => {
  const r = audit(["remove", wtPath("ignored"), "--accept-ignored", "--apply"]);
  assert.equal(r.code, 0, r.out);
  assert.ok(!existsSync(wtPath("ignored")));
});

test("remove — an orphan vault clone is removed through the same guard", opts, () => {
  const orphan = join(durable, "app", "gone.vault");
  const dry = audit(["remove", orphan]);
  assert.equal(dry.code, 0, dry.out);
  assert.ok(existsSync(orphan));
  const real = audit(["remove", orphan, "--apply"]);
  assert.equal(real.code, 0, real.out);
  assert.ok(!existsSync(orphan));
});

test("remove — a vault clone whose worktree still exists is refused", opts, () => {
  const vault = join(durable, "app", "dirty.vault"); // `dirty` is still a live worktree
  git(durable, "clone", join(sandbox, "vault.git"), vault);
  const r = audit(["remove", vault, "--apply"]);
  assert.equal(r.code, 2, r.out);
  assert.match(r.out, /still exists/);
  assert.ok(existsSync(vault));
});

test("remove — a vault clone with local commits that exist on no remote is refused", opts, () => {
  const vault = join(durable, "app", "lonely.vault"); // no sibling worktree: an orphan
  git(durable, "clone", join(sandbox, "vault.git"), vault);
  writeFileSync(join(vault, "note.md"), "only here\n");
  git(vault, "add", ".");
  git(vault, "commit", "-m", "local only");
  const r = audit(["remove", vault, "--apply"]);
  assert.equal(r.code, 2, r.out);
  assert.match(r.out, /exist on no remote/);
  assert.ok(existsSync(vault));
});

// ---------------------------------------------------------------- remove: fails closed
// These build their own worktree (nothing of its own on the branch: merged, clean, so DONE) and
// put the sandbox back as they found it, so they do not depend on, or disturb, the tests above.
function addWorktree(name: string, branch: string): string {
  const dir = wtPath(name);
  git(app, "worktree", "add", "-b", branch, dir, "origin/main");
  return dir;
}
function dropWorktree(dir: string, branch: string): void {
  // Cleanup must never replace the assertion that failed: tolerate "already gone".
  spawnSync("git", ["worktree", "remove", "--force", dir], { cwd: app, env: baseEnv });
  spawnSync("git", ["worktree", "prune"], { cwd: app, env: baseEnv });
  spawnSync("git", ["branch", "-D", branch], { cwd: app, env: baseEnv });
}

// The tool learns whether commits are unpushed from `git rev-list --count HEAD --not --remotes`.
// This git wrapper fails exactly that probe and passes every other call through to real git.
function gitThatCannotCountUnpushed(): NodeJS.ProcessEnv {
  const shimDir = join(sandbox, "git-shim");
  mkdirSync(shimDir, { recursive: true });
  const realGit = sh(sandbox, "sh", ["-c", "command -v git"]);
  writeFileSync(
    join(shimDir, "git"),
    [
      "#!/bin/sh",
      "has_rev_list=0; has_remotes=0",
      'for a in "$@"; do',
      '  [ "$a" = "rev-list" ] && has_rev_list=1',
      '  [ "$a" = "--remotes" ] && has_remotes=1',
      "done",
      'if [ "$has_rev_list" = 1 ] && [ "$has_remotes" = 1 ]; then',
      '  echo "fatal: simulated failure" >&2; exit 128',
      "fi",
      `exec "${realGit}" "$@"`,
      "",
    ].join("\n"),
  );
  chmodSync(join(shimDir, "git"), 0o755);
  return { ...baseEnv, PATH: `${shimDir}:${process.env.PATH ?? ""}` };
}

test("remove — refuses when git cannot say whether every commit is on a remote", opts, () => {
  const dir = addWorktree("blind", "feat/blind");
  try {
    const control = audit(["remove", dir]);
    assert.equal(control.code, 0, `control: removable while git answers\n${control.out}`);
    assert.match(control.out, /verdict=DONE/);
    const r = audit(["remove", dir, "--apply"], gitThatCannotCountUnpushed());
    assert.equal(r.code, 2, r.out);
    assert.match(r.out, /cannot tell whether every commit exists on a remote/);
    assert.ok(existsSync(dir), "an unknown push state must not read as 'nothing unpushed'");
  } finally {
    dropWorktree(dir, "feat/blind");
  }
});

test("remove — a symlink is refused with its target named; the real worktree stays", opts, () => {
  const dir = addWorktree("pointed-at", "feat/pointed-at");
  const link = join(durable, "app", "pointed-at-link");
  symlinkSync(dir, link);
  try {
    const r = audit(["remove", link, "--apply"]);
    assert.equal(r.code, 2, r.out);
    assert.match(r.out, /is a symlink to .*pointed-at/);
    assert.ok(existsSync(dir) && existsSync(link), "neither the worktree nor the link was touched");
  } finally {
    rmSync(link);
    dropWorktree(dir, "feat/pointed-at");
  }
});

test("remove --vault — a symlinked vault sibling is refused before anything is removed", opts, () => {
  const dir = addWorktree("tied", "feat/tied");
  const clone = join(sandbox, "elsewhere.vault");
  git(sandbox, "clone", join(sandbox, "vault.git"), clone);
  symlinkSync(clone, `${dir}.vault`);
  try {
    const r = audit(["remove", dir, "--vault", "--apply"]);
    assert.equal(r.code, 2, r.out);
    assert.match(r.out, /vault sibling is a symlink/);
    assert.ok(existsSync(dir), "the worktree stays: the refusal comes before the first deletion");
    assert.ok(existsSync(join(clone, "k.md")), "and the clone behind the link is intact");
  } finally {
    rmSync(`${dir}.vault`);
    rmSync(clone, { recursive: true, force: true });
    dropWorktree(dir, "feat/tied");
  }
});

test("inventory — WORKTREES_HOME: empty means unset, and a leading ~ is expanded", opts, () => {
  const durableOf = (env: NodeJS.ProcessEnv): string => {
    const r = audit(["inventory", "--json"], env);
    assert.equal(r.code, 0, r.out);
    return (JSON.parse(r.out) as { roots: { durable: string } }).roots.durable;
  };
  assert.equal(durableOf({ ...baseEnv, WORKTREES_HOME: "" }), durable, "empty: ~/worktrees, not the cwd");
  assert.equal(durableOf({ ...baseEnv, WORKTREES_HOME: "~/worktrees" }), durable, "~ expands against HOME");
});

// ---------------------------------------------------------------- squash merge, remote branch deleted
// The usual flow on a repo that deletes the head branch when a PR merges: the branch's own commits
// then sit on no remote *branch* (git counts them as unpushed), yet the merged PR's tip is exactly
// this HEAD and GitHub keeps it under refs/pull/<n>/head. That is finished work. Commits past that
// tip are not. (What main received is irrelevant to the verdict: only the PR's tip proves it.)
function mergedPrWithDeletedBranch(name: string, branch: string, number: number): string {
  const dir = addWorktree(name, branch);
  writeFileSync(join(dir, `${name}.txt`), `${name}\n`);
  git(dir, "add", `${name}.txt`);
  git(dir, "commit", "-m", `add ${name}`);
  git(dir, "push", "origin", `${branch}:${branch}`);
  const prs = JSON.parse(readFileSync(prFile, "utf8")) as object[];
  prs.push({ number, state: "MERGED", isDraft: false, headRefName: branch, headRefOid: git(dir, "rev-parse", "HEAD") });
  writeFileSync(prFile, JSON.stringify(prs));
  git(dir, "push", "origin", "--delete", branch); // what "delete branch on merge" does
  git(app, "fetch", "--prune", "origin");
  return dir;
}

test("remove — a squash-merged branch whose remote branch was deleted is DONE, not UNPUSHED", opts, () => {
  const prsBefore = readFileSync(prFile, "utf8");
  const dir = mergedPrWithDeletedBranch("gone-remote", "feat/gone-remote", 21);
  try {
    assert.equal(git(dir, "rev-list", "--count", "HEAD", "--not", "--remotes"), "1", "git sees one commit on no remote");
    assert.equal(inventory(prEnv, ["--prs"]).rows["gone-remote"].verdict, "DONE");
    const dry = audit(["remove", dir, "--delete-branch"], prEnv);
    assert.equal(dry.code, 0, dry.out);
    assert.match(dry.out, /verdict=DONE/);
    assert.match(dry.out, /PR #21 merged this exact tip/);
    assert.match(dry.out, /branch -D feat\/gone-remote/);
    assert.ok(existsSync(dir), "a dry run removes nothing");
    const r = audit(["remove", dir, "--delete-branch", "--apply"], prEnv);
    assert.equal(r.code, 0, r.out);
    assert.ok(!existsSync(dir));
    assert.equal(git(app, "branch", "--list", "feat/gone-remote"), "");
  } finally {
    writeFileSync(prFile, prsBefore);
    dropWorktree(dir, "feat/gone-remote");
  }
});

test("remove — commits past the merged PR's tip are still unpushed work: no exemption", opts, () => {
  const prsBefore = readFileSync(prFile, "utf8");
  const dir = mergedPrWithDeletedBranch("past-the-tip", "feat/past-the-tip", 22);
  try {
    writeFileSync(join(dir, "after-merge.txt"), "written after the PR merged\n");
    git(dir, "add", "after-merge.txt");
    git(dir, "commit", "-m", "work after the merge");
    const r = audit(["remove", dir, "--delete-branch", "--apply"], prEnv);
    assert.equal(r.code, 2, r.out);
    assert.match(r.out, /verdict=UNPUSHED/);
    assert.match(r.out, /commit\(s\) exist on no remote/);
    assert.ok(existsSync(dir), "nothing was removed");
    assert.notEqual(git(app, "branch", "--list", "feat/past-the-tip"), "", "and the branch is kept");
  } finally {
    writeFileSync(prFile, prsBefore);
    dropWorktree(dir, "feat/past-the-tip");
  }
});
