// The command line: argument parsing, the context every command runs in, help,
// and the exit-code convention.
//
//   0  done, nothing wrong
//   1  the work ran and found problems (lint errors, a refused approval)
//   2  the command was used wrongly
//   3  something unexpected broke
import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { loadMeta, DEFAULT_META_DIR } from "./metamodel.mjs";
import { readProject, CONFIG_FILE } from "./project.mjs";
import { analyse, today as realToday } from "./lint.mjs";
import { isDate } from "./shapes.mjs";
import { wrap, columns } from "./format.mjs";
import { UsageError, Failure, closest } from "./errors.mjs";
import { COMMANDS, GROUPS } from "./commands/index.mjs";

export { UsageError, Failure, closest };

export const PDS_VERSION = "0.1.0";

const COMMON_FLAGS = {
  root: { type: "string", doc: "The project folder (the one with pds.yaml). Default: the nearest one above the current folder." },
  meta: { type: "string", doc: "Use a different meta-model folder." },
  today: { type: "string", doc: "Treat this date (YYYY-MM-DD) as today, for repeatable review-age checks." },
  help: { type: "bool", doc: "Show this help." },
};

/**
 * @param {string[]} argv
 * @param {Record<string, {type: "bool"|"string"|"int"|"list", doc: string}>} spec
 */
export function parseArgs(argv, spec) {
  const flags = {};
  const args = [];
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--") {
      args.push(...argv.slice(i + 1));
      break;
    }
    if (arg === "-h") {
      flags.help = true;
      continue;
    }
    if (!arg.startsWith("--")) {
      args.push(arg);
      continue;
    }
    const eq = arg.indexOf("=");
    const name = eq < 0 ? arg.slice(2) : arg.slice(2, eq);
    const inline = eq < 0 ? undefined : arg.slice(eq + 1);
    const def = spec[name];
    if (!def) {
      const near = closest(name, Object.keys(spec));
      throw new UsageError(`unknown option --${name}${near ? `; did you mean --${near}?` : `; valid options: ${Object.keys(spec).map((k) => "--" + k).join(", ")}`}`);
    }
    if (def.type === "bool") {
      flags[name] = inline === undefined ? true : inline !== "false";
      continue;
    }
    const value = inline ?? argv[++i];
    if (value === undefined || (inline === undefined && value.startsWith("--"))) throw new UsageError(`--${name} needs a value`);
    if (def.type === "int") {
      if (!/^\d+$/.test(value)) throw new UsageError(`--${name} needs a whole number, not "${value}"`);
      flags[name] = Number(value);
    } else if (def.type === "list") flags[name] = value.split(",").map((s) => s.trim()).filter(Boolean);
    else flags[name] = value;
  }
  return { args, flags };
}

/** What a command can see and do. Project, analysis and meta-model load on first use. */
export class Context {
  constructor({ command, args, flags, io, env, cwd }) {
    Object.assign(this, { command, args, flags, io, env, cwd });
    this.today = flags.today ?? env.PDS_TODAY ?? realToday();
    if (!isDate(this.today)) throw new UsageError(`--today needs a date like 2026-10-27, not "${this.today}"`);
    this._meta = null;
    this._root = null;
    this._project = null;
    this._analysis = null;
  }

  out(text = "") {
    this.io.out(text.endsWith("\n") ? text : text + "\n");
  }
  err(text = "") {
    this.io.err(text.endsWith("\n") ? text : text + "\n");
  }

  get meta() {
    if (!this._meta) {
      try {
        this._meta = loadMeta(this.flags.meta ? resolve(this.cwd, this.flags.meta) : DEFAULT_META_DIR);
      } catch (e) {
        throw new Failure(`cannot load the meta-model: ${e.message}`, 3);
      }
    }
    return this._meta;
  }

  /** The project folder: --root, PDS_ROOT, or the nearest folder above here with a pds.yaml. */
  get root() {
    if (this._root) return this._root;
    const given = this.flags.root ?? this.env.PDS_ROOT;
    if (given) {
      const dir = resolve(this.cwd, given);
      if (!existsSync(join(dir, CONFIG_FILE))) throw new Failure(`no ${CONFIG_FILE} in ${dir}`);
      return (this._root = dir);
    }
    for (let dir = resolve(this.cwd); ; dir = dirname(dir)) {
      if (existsSync(join(dir, CONFIG_FILE))) return (this._root = dir);
      if (dirname(dir) === dir) break;
    }
    throw new Failure(`no ${CONFIG_FILE} found from ${this.cwd} upwards. Start one with: pds init`);
  }

  get project() {
    if (!this._project) {
      try {
        this._project = readProject(this.meta, this.root);
      } catch (e) {
        if (e instanceof Failure) throw e;
        throw new Failure(`cannot read the project: ${e.message}`);
      }
    }
    return this._project;
  }

  get analysis() {
    if (!this._analysis) this._analysis = analyse({ meta: this.meta, project: this.project, today: this.today });
    return this._analysis;
  }

  /** Forget what was read, after a command has written files. */
  invalidate() {
    this._project = null;
    this._analysis = null;
  }
}

function commandHelp(name, cmd) {
  const flags = { ...cmd.flags, ...COMMON_FLAGS };
  const rows = Object.entries(flags).map(([k, v]) => [`  --${k}${v.type === "bool" ? "" : v.type === "int" ? " N" : v.type === "list" ? " a,b" : " VALUE"}`, v.doc]);
  return [`pds ${name} — ${cmd.summary}`, "", `Usage: pds ${cmd.usage}`, "", ...(cmd.help ? [...wrap(cmd.help, 92), ""] : []), "Options:", ...columns(rows), ""].join("\n");
}

function overview() {
  const lines = [`pds ${PDS_VERSION} — define a product completely, at every level, and keep the definition honest.`, "", "Usage: pds <command> [options]", ""];
  for (const [title, names] of GROUPS) {
    lines.push(title);
    lines.push(...columns(names.map((n) => [`  ${n}`, COMMANDS[n].summary])), "");
  }
  lines.push("Run `pds <command> --help` for a command's options.", "A project is a folder with a pds.yaml and a definition/ folder of Markdown records.", "");
  return lines.join("\n");
}

/**
 * Run the command line. Returns the exit code instead of exiting, so tests can
 * call it directly.
 * @param {string[]} argv
 * @param {{out?: Function, err?: Function, env?: object, cwd?: string}} [io]
 */
export async function main(argv, io = {}) {
  const out = io.out ?? ((s) => process.stdout.write(s));
  const err = io.err ?? ((s) => process.stderr.write(s));
  const env = io.env ?? process.env;
  const cwd = io.cwd ?? process.cwd();
  try {
    const [name, ...rest] = argv;
    if (!name || name === "help" || name === "--help" || name === "-h") {
      const target = rest[0];
      if (target && COMMANDS[target]) out(commandHelp(target, COMMANDS[target]));
      else out(overview());
      return 0;
    }
    if (name === "--version" || name === "version") {
      out(`pds ${PDS_VERSION}\n`);
      return 0;
    }
    const cmd = COMMANDS[name];
    if (!cmd) {
      const near = closest(name, Object.keys(COMMANDS));
      throw new UsageError(`unknown command ${name}${near ? `; did you mean ${near}?` : "; run `pds help` for the list"}`);
    }
    const { args, flags } = parseArgs(rest, { ...cmd.flags, ...COMMON_FLAGS });
    if (flags.help) {
      out(commandHelp(name, cmd));
      return 0;
    }
    const ctx = new Context({ command: name, args, flags, io: { out, err }, env, cwd });
    return (await cmd.run(ctx)) ?? 0;
  } catch (e) {
    if (e instanceof UsageError) {
      err(`pds: ${e.message}\n`);
      return 2;
    }
    if (e instanceof Failure) {
      if (e.message) err(`pds: ${e.message}\n`);
      return e.code;
    }
    err(`pds: unexpected error: ${env.PDS_DEBUG ? e.stack : e.message}\n`);
    return 3;
  }
}
