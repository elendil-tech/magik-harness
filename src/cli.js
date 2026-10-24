// @ts-check
/**
 * cli.js — command dispatch. Exit codes: 0 ok, 1 a check failed or an install
 * had a problem, 2 usage error.
 */

import { homedir } from "node:os";

import { runDoctor } from "./commands/doctor.js";
import { runInit } from "./commands/init.js";
import { runInstall } from "./commands/install.js";
import { runList, runPrimer, runResolve, runStatus } from "./commands/info.js";
import { runUninstall } from "./commands/uninstall.js";
import { UsageError } from "./lib/args.js";
import { VERSION } from "./version.js";

export const HELP = `magik-harness ${VERSION}
A repo, a vault, and a few rules the agent follows. Works with any coding agent
that reads AGENTS.md and Agent Skills; has first-class adapters for Cursor,
Claude Code and Codex.

Usage: magik-harness <command> [options]

Commands
  install     Set up the harness in this project, or on this machine (--scope global)
  upgrade     Re-apply the install with newer content (keeps your edits)
  doctor      Check that it is installed and working (read-only)
  status      Show installs and what resolves for this project
  resolve     Show where this project's knowledge base and memory live, and why
  init        Create the vault folders for this project
  uninstall   Remove what install added (your vault is never touched)
  list        Show profiles, skills, packs and tool adapters
  primer      Print the primer text (for tools without a primer file)

Quick start
  magik-harness install --vault ~/vaults/my-project     # project scope
  magik-harness install --scope global --vault ~/vault  # whole machine
  magik-harness install --profile minimal               # no vault at all
  magik-harness doctor

Not on your PATH? There is no npm package; run it straight from GitHub:
  npx github:elendil-tech/magik-harness <command>

Run \`magik-harness <command> --help\` for the options of one command.
`;

/** @typedef {import("./commands/install.js").IO} IO */

/** @type {Record<string, (argv: string[], io: IO) => Promise<number>>} */
const COMMANDS = {
  install: (argv, io) => runInstall(argv, io, "install"),
  upgrade: (argv, io) => runInstall(argv, io, "upgrade"),
  uninstall: runUninstall,
  doctor: runDoctor,
  status: runStatus,
  resolve: runResolve,
  init: runInit,
  list: runList,
  primer: runPrimer,
};

/**
 * @param {string[]} [argv]
 * @param {Partial<IO>} [overrides]
 * @returns {Promise<number>}
 */
export async function main(argv = process.argv.slice(2), overrides = {}) {
  const env = overrides.env ?? process.env;
  /** @type {IO} */
  const io = {
    cwd: overrides.cwd ?? process.cwd(),
    env,
    out: overrides.out ?? ((s) => void process.stdout.write(s)),
    err: overrides.err ?? ((s) => void process.stderr.write(s)),
    interactive: overrides.interactive ?? Boolean(process.stdin.isTTY && process.stdout.isTTY),
    home: overrides.home ?? env.HOME ?? env.USERPROFILE ?? homedir(),
  };

  const [first, ...rest] = argv;
  try {
    if (!first || first === "-h" || first === "--help") {
      io.out(HELP);
      return first ? 0 : 2;
    }
    if (first === "-v" || first === "--version" || first === "version") {
      io.out(`${VERSION}\n`);
      return 0;
    }
    if (first === "help") {
      const target = rest[0];
      if (!target) {
        io.out(HELP);
        return 0;
      }
      if (!COMMANDS[target]) throw new UsageError(`unknown command "${target}"`);
      return await COMMANDS[target](["--help"], io);
    }
    const cmd = COMMANDS[first];
    if (!cmd) throw new UsageError(`unknown command "${first}"`);
    return await cmd(rest, io);
  } catch (e) {
    const err = /** @type {Error} */ (e);
    if (err instanceof UsageError) {
      io.err(`magik-harness: ${err.message}\nRun \`magik-harness ${first && COMMANDS[first] ? first + " " : ""}--help\` for usage.\n`);
      return 2;
    }
    io.err(`magik-harness: error: ${err.message}\n`);
    if (env.MAGIK_DEBUG) io.err(`${err.stack}\n`);
    return 1;
  }
}
