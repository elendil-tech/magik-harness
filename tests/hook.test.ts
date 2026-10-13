/**
 * tests/hook.test.ts: the session hook, run the way a tool runs it.
 *
 * Contract under test: when a harness resolves, the hook prints one block
 * (harness status, today's memory, git sync state, next steps) in whatever
 * shape the calling tool expects; when none resolves it prints nothing; when
 * a configured harness is broken it says so loudly; and it NEVER fails the
 * session (exit 0, always).
 */

import assert from "node:assert/strict";
import { mkdirSync, utimesSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";

import { gitSyncContext, gitSyncInfo } from "../runtime/gitctx.mjs";
import { MARKER_LINE, claimSession, formatOutput, readTail, today } from "../runtime/session-start.mjs";
import { contextOf, git, hook, machine, repo, tmp, vaultWith, write } from "./_helpers.ts";

const DAY = "2026-01-02";

interface World {
  home: string;
  root: string;
  app: string;
  vault: string;
  /** isolated lock directory so dedupe never leaks between tests */
  locks: string;
  env: Record<string, string>;
}

function world(opts: { pointer?: boolean; note?: string } = {}): World {
  const m = machine();
  const app = repo(join(m.root, "Projects"), "app");
  const vault = join(m.home, "vault");
  vaultWith(vault, "app", opts.note === undefined ? undefined : { date: DAY, note: opts.note });
  if (opts.pointer !== false) {
    write(
      join(app, ".magik", "harness.json"),
      JSON.stringify({
        schema: "magik-harness/harness@2",
        vault: "~/vault",
        knowledge: { mount: "app/knowledge", accessVia: "path", autonomy: "open" },
        memory: { mount: "app/memory", accessVia: "path" },
      }),
    );
  }
  const locks = join(m.root, "locks");
  mkdirSync(locks, { recursive: true });
  return { ...m, app, vault, locks, env: { MAGIK_TODAY: DAY, TMPDIR: locks, TEMP: locks, TMP: locks } };
}

function run(w: World, args: string[] = ["--format", "cursor"], payload?: unknown, extraEnv: Record<string, string> = {}) {
  return hook(args, { cwd: w.app, home: w.home, payload, env: { ...w.env, ...extraEnv } });
}

describe("what it prints", () => {
  it("prints the harness status, paths, today's memory and next steps for a resolved harness", () => {
    const w = world({ note: "- [lesson] remember the milk\n" });
    const r = run(w);
    assert.equal(r.code, 0);
    const ctx = contextOf(r.stdout);
    assert.ok(ctx.startsWith(MARKER_LINE), "the marker line comes first, so an agent can tell the hook ran");
    assert.match(ctx, /## Harness/);
    assert.ok(ctx.includes(join(w.vault, "app", "knowledge")));
    assert.ok(ctx.includes(join(w.vault, "app", "memory")));
    assert.match(ctx, /autonomy: open/);
    assert.match(ctx, /## Memory: today's notes \(`daily\/2026-01-02\.md`\)/);
    assert.ok(ctx.includes("remember the milk"));
    assert.match(ctx, /## Next steps/);
    assert.match(ctx, /kb-search/);
    assert.match(ctx, /`agentic-e2e-loop` skill for substantive work \(`\.agents\/skills\/agentic-e2e-loop\/SKILL\.md`\)/, "the loop skill is named even when a vault is configured: a global Cursor install has no primer file to say so");
  });

  it("speaks Cursor, Claude and plain text", () => {
    const w = world();
    const cursor = JSON.parse(run(w, ["--format", "cursor"]).stdout);
    assert.deepEqual(Object.keys(cursor), ["additional_context"]);
    const claude = JSON.parse(run(w, ["--format", "claude"]).stdout);
    assert.deepEqual(Object.keys(claude), ["hookSpecificOutput"]);
    assert.equal(claude.hookSpecificOutput.hookEventName, "SessionStart");
    assert.ok(claude.hookSpecificOutput.additionalContext.startsWith(MARKER_LINE));
    const text = run(w, ["--format", "text"]).stdout;
    assert.ok(text.startsWith(MARKER_LINE));
    assert.ok(text.endsWith("\n"));
  });

  it("omits the memory section when there is no note for today", () => {
    const w = world();
    assert.ok(!/## Memory/.test(contextOf(run(w).stdout)));
  });

  it("shows the knowledge autonomy that applies", () => {
    const w = world();
    write(join(w.app, ".magik", "harness.json"), JSON.stringify({ vault: "~/vault", knowledge: { mount: "app/knowledge", autonomy: "readonly" }, memory: { mount: "app/memory" } }));
    const ctx = contextOf(run(w).stdout);
    assert.match(ctx, /autonomy: readonly/);
    assert.match(ctx, /`readonly`: report KB changes, never write them/);
  });

  it("tells the agent where the skills live, from the lock file", () => {
    const w = world();
    write(join(w.app, ".magik", "lock.json"), JSON.stringify({ schema: "magik-harness/lock@1", version: "2.0.0", scope: "project", skillsDir: ".cursor/skills" }));
    assert.match(contextOf(run(w).stdout), /\.cursor\/skills\/kb-search\/SKILL\.md/);
  });

  it("covers a minimal install (no vault) with the delivery loop and git protocol", () => {
    const w = world({ pointer: false });
    write(join(w.app, ".magik", "lock.json"), JSON.stringify({ schema: "magik-harness/lock@1", version: "2.0.0", scope: "project", profile: "minimal" }));
    const ctx = contextOf(run(w).stdout);
    assert.match(ctx, /no vault configured/);
    assert.match(ctx, /agentic-e2e-loop/);
    assert.match(ctx, /### Git sync state/);
    assert.ok(!/kb-search/.test(ctx));
  });
});

describe("silence and loudness", () => {
  it("prints nothing at all when no harness applies", () => {
    const w = world({ pointer: false });
    assert.equal(run(w, ["--format", "cursor"]).stdout, "{}");
    assert.equal(run(w, ["--format", "claude"]).stdout, "{}");
    assert.equal(run(w, ["--format", "text"]).stdout, "");
  });

  it("is loud when the vault is missing, and still exits 0", () => {
    const w = world();
    write(join(w.app, ".magik", "harness.json"), JSON.stringify({ vault: "~/not-cloned-yet", knowledge: { mount: "k" }, memory: { mount: "m" } }));
    const r = run(w);
    assert.equal(r.code, 0);
    const ctx = contextOf(r.stdout);
    assert.match(ctx, /WARNING: Vault not found/);
    assert.match(ctx, /not-cloned-yet/);
    assert.match(ctx, /`harness-fit` skill/, "a broken harness points at the way to repair it");
  });

  it("stays quiet about the fit skill while everything is fine", () => {
    const w = world();
    const ctx = contextOf(run(w).stdout);
    assert.ok(!/WARNING/.test(ctx));
    assert.ok(!/harness-fit/.test(ctx), "no extra context for a healthy harness");
  });

  it("is loud about a pointer it cannot parse", () => {
    const w = world();
    write(join(w.app, ".magik", "harness.json"), "{ broken");
    const r = run(w);
    assert.equal(r.code, 0);
    assert.match(contextOf(r.stdout), /WARNING: Harness pointer .* is not valid JSON/);
  });

  it("never fails the session, whatever arrives on stdin", () => {
    const w = world();
    for (const raw of ["", "{{{", "null", "42", '"a string"', "[]", "\u0000\u0001"]) {
      const r = hook(["--format", "cursor"], { cwd: w.app, home: w.home, raw, env: w.env });
      assert.equal(r.code, 0, `stdin ${JSON.stringify(raw)}`);
      assert.ok(contextOf(r.stdout).startsWith(MARKER_LINE), `stdin ${JSON.stringify(raw)} still resolves from the cwd`);
    }
  });

  it("exits 0 even for a nonsense directory", () => {
    const w = world();
    const r = hook(["--format", "cursor", "--project-root", join(w.root, "does", "not", "exist")], { cwd: w.root, home: w.home, env: w.env });
    assert.equal(r.code, 0);
  });
});

describe("memory cap", () => {
  const BIG = Array.from({ length: 300 }, (_, i) => `- line ${i} ${"x".repeat(40)}`).join("\n") + "\n";

  it("injects only the newest part of a long note, cut at a line boundary", () => {
    const w = world({ note: BIG });
    const ctx = contextOf(run(w, ["--format", "cursor", "--max-memory-bytes", "500"]).stdout);
    assert.match(ctx, /newest \d+ of \d+ bytes; full note: `/);
    assert.ok(ctx.includes("- line 299 "), "the newest line is there");
    assert.ok(!ctx.includes("- line 0 "), "the oldest is not");
    const body = ctx.split("## Memory:")[1].split("\n\n").slice(1).join("\n\n").split("\n\n---")[0];
    assert.match(body.split("\n")[0], /^- line \d+ x+$/, "the first retained line is whole");
  });

  it("uses the cap from the pointer, and 0 turns injection off but still points at the note", () => {
    const w = world({ note: BIG });
    write(join(w.app, ".magik", "harness.json"), JSON.stringify({ vault: "~/vault", knowledge: { mount: "app/knowledge" }, memory: { mount: "app/memory", inject: { maxBytes: 0 } } }));
    const ctx = contextOf(run(w).stdout);
    assert.match(ctx, /Injection is disabled/);
    assert.ok(ctx.includes(join(w.vault, "app", "memory", "daily", `${DAY}.md`)));
    assert.ok(!ctx.includes("- line 299"));
  });

  it("injects a short note whole", () => {
    const w = world({ note: "- short\n" });
    const ctx = contextOf(run(w, ["--format", "cursor", "--max-memory-bytes", "500"]).stdout);
    assert.ok(!/newest/.test(ctx));
    assert.ok(ctx.includes("- short"));
  });

  it("never starts a truncated note in the middle of a multi-byte character", () => {
    const lines = Array.from({ length: 200 }, (_, i) => `- ${i} 🚀 launch ✓ ünïcödé ${"é".repeat(30)}`).join("\n") + "\n";
    const w = world({ note: lines });
    for (const cap of ["301", "302", "303", "304", "305", "499"]) {
      const ctx = contextOf(run(w, ["--format", "cursor", "--max-memory-bytes", cap]).stdout);
      assert.ok(!ctx.includes("\uFFFD"), `no replacement character at cap ${cap}`);
    }
  });

  it("readTail handles empty, blank and exact-size files", () => {
    const dir = tmp("tail");
    write(join(dir, "empty.md"), "");
    write(join(dir, "blank.md"), "  \n\n");
    write(join(dir, "small.md"), "a\nb\n");
    assert.equal(readTail(join(dir, "empty.md"), 100), null);
    assert.equal(readTail(join(dir, "blank.md"), 100), null);
    assert.deepEqual(readTail(join(dir, "small.md"), 100), { body: "a\nb", size: 4, truncated: false });
    assert.equal(readTail(join(dir, "small.md"), 4)?.truncated, false, "a file exactly at the cap is not truncated");
  });
});

describe("which directory it resolves", () => {
  function projects() {
    const m = machine();
    const names = ["from-cwd", "from-payload-cwd", "from-roots", "from-env", "from-flag"];
    const vault = join(m.home, "vault");
    const dirs: Record<string, string> = {};
    for (const n of names) {
      dirs[n] = repo(join(m.root, "Projects"), n);
      vaultWith(vault, n);
      write(join(dirs[n], ".magik", "harness.json"), JSON.stringify({ vault: "~/vault", knowledge: { mount: `${n}/knowledge` }, memory: { mount: `${n}/memory` } }));
    }
    const neutral = join(m.root, "neutral");
    mkdirSync(neutral);
    const locks = join(m.root, "locks");
    mkdirSync(locks);
    return { ...m, dirs, neutral, env: { TMPDIR: locks, TEMP: locks, TMP: locks } };
  }
  const projectOf = (stdout: string) => /Project: `([^`]+)`/.exec(contextOf(stdout))?.[1];

  it("follows the documented precedence: flag, MAGIK_PROJECT_DIR, workspace_roots, CURSOR/CLAUDE dirs, payload cwd, process cwd", () => {
    const p = projects();
    const at = (o: { cwd: string; args?: string[]; payload?: unknown; env?: Record<string, string> }) =>
      projectOf(hook(["--format", "cursor", ...(o.args ?? [])], { cwd: o.cwd, home: p.home, payload: o.payload, env: { ...p.env, ...(o.env ?? {}) } }).stdout);

    assert.equal(at({ cwd: p.dirs["from-cwd"] }), "from-cwd");
    assert.equal(at({ cwd: p.neutral, payload: { cwd: p.dirs["from-payload-cwd"] } }), "from-payload-cwd");
    assert.equal(at({ cwd: p.neutral, payload: { cwd: p.dirs["from-payload-cwd"], workspace_roots: [p.dirs["from-roots"]] } }), "from-roots");
    assert.equal(at({ cwd: p.neutral, payload: { workspace_roots: [p.dirs["from-roots"]] }, env: { CURSOR_PROJECT_DIR: p.dirs["from-cwd"] } }), "from-roots");
    assert.equal(at({ cwd: p.neutral, env: { CURSOR_PROJECT_DIR: p.dirs["from-env"] } }), "from-env");
    assert.equal(at({ cwd: p.neutral, env: { CLAUDE_PROJECT_DIR: p.dirs["from-env"] } }), "from-env");
    assert.equal(at({ cwd: p.neutral, payload: { workspace_roots: [p.dirs["from-roots"]] }, env: { MAGIK_PROJECT_DIR: p.dirs["from-env"] } }), "from-env");
    assert.equal(at({ cwd: p.neutral, args: ["--project-root", p.dirs["from-flag"]], env: { MAGIK_PROJECT_DIR: p.dirs["from-env"] } }), "from-flag");
  });
});

describe("dedupe (a project hook and a global hook fire for one session)", () => {
  const start = (w: World, payload: unknown) => contextOf(run(w, ["--format", "cursor"], payload).stdout);

  it("emits once per session and event, not twice", () => {
    const w = world();
    const p = { workspace_roots: [w.app], session_id: "s-1", source: "startup" };
    assert.ok(start(w, p).startsWith(MARKER_LINE));
    assert.equal(start(w, p), "", "the second hook for the same event stays quiet");
  });

  it("still emits for another session, and for a later event of the same session (compact, resume)", () => {
    const w = world();
    const base = { workspace_roots: [w.app], session_id: "s-2", source: "startup" };
    assert.ok(start(w, base).startsWith(MARKER_LINE));
    assert.ok(start(w, { ...base, session_id: "s-3" }).startsWith(MARKER_LINE), "another session");
    assert.ok(start(w, { ...base, source: "compact" }).startsWith(MARKER_LINE), "context was compacted away, so it must come back");
  });

  it("takes over a stale claim from an earlier event of the same session", () => {
    const w = world();
    const p = { workspace_roots: [w.app], session_id: "s-4", source: "startup" };
    assert.ok(start(w, p).startsWith(MARKER_LINE));
    const old = new Date(Date.now() - 10 * 60 * 1000);
    for (const f of readdirSync(join(w.locks, "magik-harness"))) utimesSync(join(w.locks, "magik-harness", f), old, old);
    assert.ok(start(w, p).startsWith(MARKER_LINE));
  });

  it("without a session id there is nothing to dedupe on", () => {
    const w = world();
    assert.ok(start(w, { workspace_roots: [w.app] }).startsWith(MARKER_LINE));
    assert.ok(start(w, { workspace_roots: [w.app] }).startsWith(MARKER_LINE));
    assert.equal(claimSession(null), true);
  });
});

describe("small pieces", () => {
  it("today() follows the local calendar and honours MAGIK_TODAY only when it is a date", () => {
    assert.equal(today({ MAGIK_TODAY: "2030-05-06" }), "2030-05-06");
    assert.match(today({ MAGIK_TODAY: "not-a-date" }), /^\d{4}-\d{2}-\d{2}$/);
    assert.notEqual(today({ MAGIK_TODAY: "not-a-date" }), "not-a-date");
  });

  it("formats output per tool, and an empty result per tool", () => {
    assert.equal(formatOutput(null, "cursor"), "{}");
    assert.equal(formatOutput(null, "claude"), "{}");
    assert.equal(formatOutput(null, "text"), "");
    assert.equal(JSON.parse(formatOutput("hi", "cursor")).additional_context, "hi");
    assert.equal(JSON.parse(formatOutput("hi", "claude")).hookSpecificOutput.additionalContext, "hi");
    assert.equal(formatOutput("hi", "text"), "hi\n");
  });
});

describe("git sync state", () => {
  function withRemote() {
    const m = machine();
    const app = repo(join(m.root, "Projects"), "app");
    const remote = join(m.root, "remote.git");
    git(m.root, "init", "-q", "--bare", remote);
    git(app, "remote", "add", "origin", remote);
    git(app, "push", "-q", "-u", "origin", "main");
    return { ...m, app, remote };
  }

  it("is absent outside a git work tree", () => {
    const dir = tmp("nogit");
    assert.equal(gitSyncInfo(dir), null);
    assert.equal(gitSyncContext(dir), null);
  });

  it("tells you to publish a branch that has no upstream", () => {
    const m = machine();
    const app = repo(join(m.root, "Projects"), "app");
    const info = gitSyncInfo(app);
    assert.equal(info?.branch, "main");
    assert.equal(info?.hasUpstream, false);
    const ctx = gitSyncContext(app) ?? "";
    assert.match(ctx, /UNPUBLISHED BRANCH/);
    assert.match(ctx, /git push -u origin main/);
  });

  it("reports a synced, a dirty, an unpushed and a behind checkout", () => {
    const w = withRemote();
    const synced = gitSyncContext(w.app) ?? "";
    assert.match(synced, /synced with origin\/main/);
    assert.match(synced, /\(clean\)/);
    assert.ok(!/UNPUBLISHED|PULL REQUIRED|PUSH REQUIRED/.test(synced));

    write(join(w.app, "scratch.txt"), "x");
    const dirty = gitSyncContext(w.app) ?? "";
    assert.match(dirty, /1 uncommitted file\(s\)/);
    assert.match(dirty, /UNCOMMITTED CHANGES/);

    git(w.app, "add", "-A");
    git(w.app, "commit", "-q", "-m", "local");
    const ahead = gitSyncContext(w.app) ?? "";
    assert.match(ahead, /1 commit\(s\) ahead of origin\/main \(UNPUSHED\)/);
    assert.match(ahead, /PUSH REQUIRED/);

    git(w.app, "push", "-q");
    const other = join(w.root, "other");
    git(w.root, "clone", "-q", w.remote, other);
    write(join(other, "from-elsewhere.txt"), "y");
    git(other, "add", "-A");
    git(other, "commit", "-q", "-m", "elsewhere");
    git(other, "push", "-q");
    git(w.app, "fetch", "-q");
    const behind = gitSyncContext(w.app) ?? "";
    assert.match(behind, /1 commit\(s\) behind origin\/main \(PULL NEEDED\)/);
    assert.match(behind, /PULL REQUIRED/);
    assert.match(behind, /git pull --ff-only/);
  });

  it("does not ask to publish a detached HEAD, and names a linked worktree", () => {
    const w = withRemote();
    git(w.app, "checkout", "-q", "--detach");
    const detached = gitSyncContext(w.app) ?? "";
    assert.match(detached, /\(detached HEAD\)/);
    assert.ok(!/UNPUBLISHED/.test(detached));
    const wt = join(w.root, "wt");
    git(w.app, "checkout", "-q", "main");
    git(w.app, "worktree", "add", "-q", wt, "-b", "feature");
    const ctx = gitSyncContext(wt, { isLinkedWorktree: true, primaryRoot: w.app }) ?? "";
    assert.match(ctx, /linked worktree of/);
  });

  it("the hook includes git state by default and leaves it out with --no-git", () => {
    const w = world();
    assert.match(contextOf(run(w).stdout), /### Git sync state/);
    assert.ok(!/### Git sync state/.test(contextOf(run(w, ["--format", "cursor", "--no-git"]).stdout)));
  });
});
