// @ts-check
/**
 * uninstall.js — `magik-harness uninstall`: remove exactly what the lock lists.
 * Modified files are kept (unless --force); the pointer and vault content are
 * yours and stay unless --purge is given (and the vault itself is never touched).
 */

import { rmSync } from "node:fs";
import { resolve } from "node:path";

import { projectInfo } from "../../runtime/resolve.mjs";
import { parseFlags, UsageError } from "../lib/args.js";
import { removeFileAndPrune } from "../lib/fsx.js";
import { readLock } from "../lib/lock.js";
import { applyUninstall, planUninstall } from "../lib/plan.js";
import { formatPlan, formatSummary, planToJson } from "../lib/report.js";
import { buildScope } from "../lib/scope.js";

export const UNINSTALL_HELP = `Usage: magik-harness uninstall [options]

Remove what \`magik-harness install\` added, as recorded in the lock file.

  --scope project|global   which install to remove (default project)
  --project-root <dir>     project (default: the git root of the cwd)
  --purge                  also remove the pointer/config and the vault's starter _index.md
  --force                  remove files you modified too (a backup is made first)
  --dry-run                print the plan, change nothing
  --json                   machine-readable output
`;

/**
 * @param {string[]} argv
 * @param {import("./install.js").IO} io
 * @returns {Promise<number>}
 */
export async function runUninstall(argv, io) {
  const { flags, positional } = parseFlags(argv, {
    boolean: ["dry-run", "force", "purge", "json", "yes", "help"],
    string: ["scope", "project-root"],
    alias: { h: "help", y: "yes" },
  });
  if (flags.help) {
    io.out(UNINSTALL_HELP);
    return 0;
  }
  if (positional.length) throw new UsageError(`unexpected argument "${positional[0]}"`);
  const kind = /** @type {string} */ (flags.scope ?? "project");
  if (kind !== "project" && kind !== "global") throw new UsageError(`--scope must be project or global (got "${kind}")`);

  const info = kind === "project" ? projectInfo(resolve(io.cwd, /** @type {string|undefined} */ (flags["project-root"]) ?? ".")) : null;
  const scope = buildScope({ kind, projectRoot: info?.projectRoot, home: io.home, magikHome: io.env.MAGIK_HOME });
  const read = readLock(scope.lockPath);
  if (!read.ok) {
    io.out(`Nothing to uninstall: ${scope.display(scope.lockPath)} ${read.missing ? "does not exist" : `is unreadable (${read.error})`}.\n`);
    return read.missing ? 0 : 1;
  }

  const items = planUninstall(read.lock, { scope, force: flags.force === true, purge: flags.purge === true });
  if (flags.json) {
    io.out(JSON.stringify({ command: "uninstall", dryRun: flags["dry-run"] === true, scope: kind, items: planToJson(items, scope) }, null, 2) + "\n");
  } else {
    io.out(`magik-harness uninstall - ${kind} scope${flags["dry-run"] ? " (dry run)" : ""}\n\n`);
    io.out(formatPlan(items, scope).join("\n") + "\n\n");
  }
  if (flags["dry-run"]) {
    if (!flags.json) io.out(`Dry run: ${formatSummary(items)}. Nothing was changed.\n`);
    return 0;
  }

  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const { backups } = applyUninstall(items, { scope, stamp });
  removeFileAndPrune(scope.lockPath, scope.root);
  // tidy: runtime dir and an empty harness dir
  try {
    rmSync(scope.runtimeDir, { recursive: true, force: true });
  } catch {
    /* ignore */
  }
  if (!flags.json) {
    io.out(`Done: ${formatSummary(items)}.\n`);
    for (const b of backups) io.out(`  backup: ${b}\n`);
    io.out("The vault and your pointer were left in place" + (flags.purge ? " (pointer removed: --purge)." : ".") + "\n");
  }
  return 0;
}
