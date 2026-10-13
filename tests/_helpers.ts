/**
 * tests/_helpers.ts: shared fixtures for the suite.
 *
 * Every test works in throwaway directories with a fake HOME, so nothing here
 * can touch the machine it runs on. The CLI is driven in-process (fast, easy
 * to debug); the session hook is driven as a real subprocess, because that is
 * how a tool runs it.
 *
 * The `_` prefix keeps this file out of the `tests/*.test.ts` glob.
 */

import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, relative } from "node:path";
import { after } from "node:test";

import { main } from "../src/cli.js";
import { PLUGIN_ROOT_DIR } from "./_version.ts";

export const ROOT: string = PLUGIN_ROOT_DIR;
export const HOOK: string = join(ROOT, "runtime", "session-start.mjs");
export const FIXTURES: string = join(ROOT, "tests", "fixtures");

const made: string[] = [];

/** A fresh temp directory (real path, so macOS /tmp symlinks do not confuse comparisons). */
export function tmp(label = "mh"): string {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), `${label}-`)));
  made.push(dir);
  return dir;
}

after(() => {
  for (const d of made) rmSync(d, { recursive: true, force: true });
});

export type Env = Record<string, string | undefined>;

export function write(path: string, text: string): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, text);
}

export function read(path: string): string {
  return readFileSync(path, "utf8");
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function readJson(path: string): any {
  return JSON.parse(read(path));
}

export function has(path: string): boolean {
  return existsSync(path);
}

export function git(cwd: string, ...args: string[]): string {
  return execFileSync(
    "git",
    ["-c", "user.name=Test", "-c", "user.email=test@example.com", "-c", "init.defaultBranch=main", "-c", "commit.gpgsign=false", ...args],
    { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
  ).trim();
}

/** A committed git repo at `<parent>/<name>`. */
export function repo(parent: string, name = "proj", files: Record<string, string> = { "README.md": "# proj\n" }): string {
  const dir = join(parent, name);
  mkdirSync(dir, { recursive: true });
  git(dir, "init", "-q");
  for (const [rel, text] of Object.entries(files)) write(join(dir, rel), text);
  git(dir, "add", "-A");
  git(dir, "commit", "-q", "-m", "init");
  return realpathSync(dir);
}

/** Every file under `dir` as sorted forward-slash relative paths (`.git` skipped). */
export function files(dir: string): string[] {
  const out: string[] = [];
  const walk = (d: string): void => {
    for (const e of readdirSync(d, { withFileTypes: true })) {
      if (e.name === ".git") continue;
      const p = join(d, e.name);
      if (e.isDirectory()) walk(p);
      else out.push(relative(dir, p).split("\\").join("/"));
    }
  };
  if (existsSync(dir)) walk(dir);
  return out.sort();
}

export interface Machine {
  /** Parent of everything: home, projects and vaults live under it. */
  root: string;
  /** Fake home directory. */
  home: string;
}

/** A fake machine: an empty home directory in a temp folder. */
export function machine(): Machine {
  const root = tmp("machine");
  const home = join(root, "home");
  mkdirSync(home, { recursive: true });
  return { root, home };
}

export interface Project extends Machine {
  /** The project checkout: `<root>/Projects/app`. */
  app: string;
  /** Where a vault would live: `<home>/vault`. It does not exist until something creates it. */
  vault: string;
}

/** A fake machine with a committed git project named `app` on it. */
export function project(opts: { files?: Record<string, string> } = {}): Project {
  const m = machine();
  const app = repo(join(m.root, "Projects"), "app", opts.files);
  return { ...m, app, vault: join(m.home, "vault") };
}

export interface CliResult {
  code: number;
  out: string;
  err: string;
}

/** Run the CLI in-process with a fake HOME. Output is captured, never printed. */
export async function cli(args: string[], o: { cwd: string; home: string; env?: Env }): Promise<CliResult> {
  let out = "";
  let err = "";
  const env: Env = { ...process.env, HOME: o.home, USERPROFILE: o.home, MAGIK_HOME: undefined, MAGIK_DEBUG: undefined, ...(o.env ?? {}) };
  for (const k of Object.keys(env)) if (env[k] === undefined) delete env[k];
  const code = await main(args, {
    cwd: o.cwd,
    env: env as NodeJS.ProcessEnv,
    home: o.home,
    interactive: false,
    out: (s: string) => {
      out += s;
    },
    err: (s: string) => {
      err += s;
    },
  });
  return { code, out, err };
}

export interface HookResult {
  code: number | null;
  stdout: string;
  stderr: string;
}

/** Run `runtime/session-start.mjs` (or an installed copy) as a subprocess, like a tool does. */
export function hook(args: string[], o: { cwd: string; home?: string; payload?: unknown; raw?: string; script?: string; env?: Env }): HookResult {
  const env: Env = { ...process.env, ...(o.home ? { HOME: o.home, USERPROFILE: o.home } : {}), MAGIK_HOME: undefined, ...(o.env ?? {}) };
  for (const k of Object.keys(env)) if (env[k] === undefined) delete env[k];
  const r = spawnSync(process.execPath, [o.script ?? HOOK, ...args], {
    cwd: o.cwd,
    env: env as NodeJS.ProcessEnv,
    input: o.raw !== undefined ? o.raw : o.payload === undefined ? "" : JSON.stringify(o.payload),
    encoding: "utf8",
    timeout: 15000,
  });
  return { code: r.status, stdout: r.stdout ?? "", stderr: r.stderr ?? "" };
}

/** Extract the injected context text from a hook's stdout, in whichever format. */
export function contextOf(stdout: string): string {
  const t = stdout.trim();
  if (!t) return "";
  try {
    const j = JSON.parse(t);
    if (typeof j.additional_context === "string") return j.additional_context;
    if (j.hookSpecificOutput && typeof j.hookSpecificOutput.additionalContext === "string") return j.hookSpecificOutput.additionalContext;
    return "";
  } catch {
    return t;
  }
}

/** Lay down a genuine magik-repo 1.9.1 install (produced by the real v1 installer) in `dir`. */
export function installV1Fixture(dir: string): void {
  const f = join(FIXTURES, "v1-install");
  write(join(dir, ".cursor", "harness.json"), read(join(f, "harness.json")));
  write(join(dir, ".cursor", "hooks.json"), read(join(f, "hooks.json")));
  write(join(dir, ".cursor", "hooks", "session-start.js"), read(join(f, "session-start.js.txt")));
  write(join(dir, "AGENTS.md"), read(join(f, "AGENTS.md.txt")));
  write(join(dir, ".gitignore"), read(join(f, "gitignore.txt")));
}

/** A vault with the folders a project install scaffolds, for tests that need one up front. */
export function vaultWith(dir: string, project: string, today?: { date: string; note: string }): string {
  mkdirSync(join(dir, project, "knowledge"), { recursive: true });
  mkdirSync(join(dir, project, "memory", "daily"), { recursive: true });
  if (today) write(join(dir, project, "memory", "daily", `${today.date}.md`), today.note);
  return dir;
}
