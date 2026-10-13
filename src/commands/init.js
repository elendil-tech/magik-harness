// @ts-check
/**
 * init.js — `magik-harness init`: create the vault folders for the project that
 * resolves from the cwd. For global installs this is the per-project step.
 * Never overwrites; never touches a vault that does not exist unless asked.
 */

import { join, resolve } from "node:path";

import { readJson, resolveHarness } from "../../runtime/resolve.mjs";
import { parseFlags, UsageError } from "../lib/args.js";
import { ensureDir, exists, writeFileAtomic } from "../lib/fsx.js";
import { vaultIndex } from "../lib/render.js";
import { today } from "../../runtime/session-start.mjs";

export const INIT_HELP = `Usage: magik-harness init [options]

Create the knowledge and memory folders for this project in its vault.

  --project-root <dir>   project (default: the git root of the cwd)
  --create-vault         also create the vault folder itself if it does not exist
                         (default: refuse, because a missing vault usually means "not cloned yet")
  --dry-run              show what would be created
  --json                 machine-readable output
`;

/**
 * @param {string[]} argv
 * @param {import("./install.js").IO} io
 */
export async function runInit(argv, io) {
  const { flags, positional } = parseFlags(argv, {
    boolean: ["dry-run", "json", "create-vault", "help"],
    string: ["project-root"],
    alias: { h: "help" },
  });
  if (flags.help) {
    io.out(INIT_HELP);
    return 0;
  }
  if (positional.length) throw new UsageError(`unexpected argument "${positional[0]}"`);
  const cwd = resolve(io.cwd, /** @type {string|undefined} */ (flags["project-root"]) ?? ".");
  let res = resolveHarness({ cwd, home: io.home, env: io.env });

  /** @type {{ path: string, action: "create"|"exists" }[]} */
  const done = [];
  const make = (/** @type {string} */ dir) => {
    if (exists(dir)) done.push({ path: dir, action: "exists" });
    else {
      done.push({ path: dir, action: "create" });
      if (!flags["dry-run"]) ensureDir(dir);
    }
  };

  if (!res.active) {
    // Global convention: <vault>/<project>/{knowledge,memory}
    const read = res.configPath ? readJson(res.configPath) : null;
    const cfg = read && read.ok && read.value && typeof read.value === "object" ? read.value : null;
    const vault = cfg && typeof cfg.vault === "string" ? cfg.vault : null;
    if (!vault || !res.vaultDir) {
      io.err("No harness pointer or global config for this project. Run `magik-harness install --vault <dir>` (project) or `magik-harness install --scope global --vault <dir>` first.\n");
      return 1;
    }
    if (!exists(res.vaultDir) && !flags["create-vault"]) {
      io.err(`The vault ${res.vaultDir} does not exist. Clone it, or pass --create-vault to create it.\n`);
      return 1;
    }
    const alias = cfg && isPlain(cfg.projects) && typeof cfg.projects[res.projectName] === "string" ? cfg.projects[res.projectName] : res.projectName;
    make(join(res.vaultDir, alias, "knowledge"));
    make(join(res.vaultDir, alias, "memory"));
    const idx = join(res.vaultDir, alias, "knowledge", "_index.md");
    if (!exists(idx)) {
      done.push({ path: idx, action: "create" });
      if (!flags["dry-run"]) writeFileAtomic(idx, vaultIndex("~/.magik/config.json", today(io.env)));
    }
  } else {
    if (res.vault && !res.vaultExists && !flags["create-vault"]) {
      io.err(`The vault ${res.vaultDir} does not exist. Clone it, or pass --create-vault to create it.\n`);
      return 1;
    }
    for (const s of [res.knowledge, res.memory]) if (s && s.accessVia === "path" && s.dir) make(s.dir);
    for (const m of res.mounts) if (m.accessVia === "path" && m.dir) make(m.dir);
    if (res.knowledge?.dir) {
      const idx = join(res.knowledge.dir, "_index.md");
      if (!exists(idx)) {
        done.push({ path: idx, action: "create" });
        if (!flags["dry-run"]) writeFileAtomic(idx, vaultIndex(res.pointerPath ? ".magik/harness.json" : "the harness pointer", today(io.env)));
      }
    }
  }

  if (flags.json) io.out(JSON.stringify({ command: "init", dryRun: flags["dry-run"] === true, items: done }, null, 2) + "\n");
  else {
    for (const d of done) io.out(`  ${d.action === "create" ? "+ create" : "= exists"}  ${d.path}\n`);
    io.out(flags["dry-run"] ? "Dry run: nothing was written.\n" : "Done.\n");
  }
  return 0;
}

/** @param {unknown} v */
function isPlain(v) {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}
