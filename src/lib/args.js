// @ts-check
/**
 * args.js — a tiny flag parser (zero dependencies).
 *
 *   --key value | --key=value | --flag | --no-flag | -h
 *
 * Each command declares the flags it accepts, so a typo is an error instead of
 * a silent no-op.
 */

export class UsageError extends Error {}

/**
 * @typedef {Object} FlagSpec
 * @property {string[]} [boolean]
 * @property {string[]} [string]
 * @property {Record<string,string>} [alias]   short -> long
 */

/**
 * @param {string[]} argv
 * @param {FlagSpec} spec
 * @returns {{ positional: string[], flags: Record<string, string|boolean|undefined> }}
 */
export function parseFlags(argv, spec) {
  const bools = new Set(spec.boolean ?? []);
  const strs = new Set(spec.string ?? []);
  const alias = spec.alias ?? {};
  /** @type {string[]} */
  const positional = [];
  /** @type {Record<string, string|boolean|undefined>} */
  const flags = {};

  for (let i = 0; i < argv.length; i++) {
    let a = argv[i];
    if (a === "--") {
      positional.push(...argv.slice(i + 1));
      break;
    }
    if (!a.startsWith("-") || a === "-") {
      positional.push(a);
      continue;
    }
    /** @type {string|undefined} */
    let inline;
    if (a.startsWith("--")) {
      const eq = a.indexOf("=");
      if (eq >= 0) {
        inline = a.slice(eq + 1);
        a = a.slice(0, eq);
      }
      a = a.slice(2);
    } else {
      a = alias[a.slice(1)] ?? a.slice(1);
    }
    const negated = a.startsWith("no-") && bools.has(a.slice(3));
    const name = negated ? a.slice(3) : a;
    if (bools.has(name)) {
      flags[name] = inline !== undefined ? inline !== "false" : !negated;
    } else if (strs.has(name)) {
      const value = inline ?? argv[++i];
      if (value === undefined || (inline === undefined && value.startsWith("--"))) {
        throw new UsageError(`--${name} needs a value`);
      }
      flags[name] = value;
    } else {
      throw new UsageError(`unknown option --${name}`);
    }
  }
  return { positional, flags };
}

/** Split a comma list; empty/undefined -> []. @param {string|boolean|undefined} v */
export function toList(v) {
  if (typeof v !== "string") return [];
  return v
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}
