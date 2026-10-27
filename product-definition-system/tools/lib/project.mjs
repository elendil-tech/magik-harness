// A project: pds.yaml and the definition folder it points at.
import { readFileSync, readdirSync, realpathSync, statSync, existsSync } from "node:fs";
import { basename, dirname, isAbsolute, join, posix, relative, resolve, sep } from "node:path";
import { parseYaml } from "./yaml.mjs";

export const CONFIG_FILE = "pds.yaml";
const KNOWN_KEYS = ["pds", "name", "profile", "adoption", "modules", "definition_dir", "views_dir", "approvers", "rules", "probes", "policy"];

/** Whether two project-relative folders are the same, or one is inside the other. */
export const overlap = (a, b) => a === b || a.startsWith(b + "/") || b.startsWith(a + "/");

/** Whether `child` is `parent`, or somewhere inside it. */
export function isWithin(parent, child) {
  const r = relative(parent, child);
  return r === "" || (r !== ".." && !r.startsWith(".." + sep) && !isAbsolute(r));
}

/**
 * Where a path really is: the part of it that exists, resolved through links and
 * through capital letters on a system that ignores case, with the rest added on.
 * `Views` and `views`, or a link called views, are then seen for what they are.
 */
export function realLocation(path) {
  const rest = [];
  let here = resolve(path);
  for (;;) {
    try {
      return join(realpathSync.native(here), ...rest);
    } catch {
      const up = dirname(here);
      if (up === here) return resolve(path);
      rest.unshift(basename(here));
      here = up;
    }
  }
}

/**
 * Turn the raw pds.yaml mapping into a resolved configuration. Anything the
 * project leaves out comes from its profile. Returns problems instead of
 * throwing, so the linter can report them.
 */
export function resolveConfig(meta, raw) {
  const problems = [];
  const bad = (msg, key) => problems.push({ id: "SCH-project", msg, key });
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    bad("pds.yaml must be a mapping");
    raw = {};
  }
  for (const k of Object.keys(raw)) if (!KNOWN_KEYS.includes(k)) bad(`unknown key ${k}`);
  if (raw.pds !== 1) bad("pds: 1 is required (the format version)");
  if (typeof raw.name !== "string" || !raw.name.trim()) bad("name is required");

  const profile = raw.profile === undefined ? undefined : meta.profile(raw.profile);
  if (raw.profile !== undefined && !profile) bad(`unknown profile ${raw.profile}; known: ${Object.keys(meta.profiles).join(", ") || "none"} (leave the key out to use no profile)`);
  const defaults = profile?.defaults || {};

  const adoption = raw.adoption ?? defaults.adoption ?? "standard";
  if (!meta.model.adoption.ladder.includes(adoption)) bad(`adoption must be one of ${meta.model.adoption.ladder.join(", ")}`);

  const modules = new Set(["core", ...(raw.modules ?? defaults.modules ?? [])]);
  for (const m of modules) if (!meta.modules[m]) bad(`unknown module ${m}`);

  const approvers = raw.approvers ?? [];
  if (!Array.isArray(approvers) || approvers.some((a) => typeof a !== "string")) bad("approvers must be a list of names");

  const disabled = (key, known, refused = new Map()) => {
    const out = new Map();
    for (const item of raw[key]?.disable ?? []) {
      if (!item || typeof item.id !== "string") {
        bad(`${key}.disable entries need an id`);
        continue;
      }
      if (refused.has(item.id)) bad(`${key}.disable: ${item.id} ${refused.get(item.id)}`);
      else if (!known.has(item.id)) bad(`${key}.disable: unknown id ${item.id}`);
      if (typeof item.reason !== "string" || item.reason.trim().length < 8) bad(`${key}.disable ${item.id}: give a reason (at least a short sentence)`);
      out.set(item.id, item.reason);
    }
    return out;
  };
  // A project may waive a coverage rule or an advisory check, with a reason. It may not waive an
  // error-level check: those are what keep a definition consistent and honest.
  const ruleIds = new Set([...meta.rules, ...meta.implicitRules].map((r) => r.id));
  const waivable = new Set(meta.checks.filter((c) => c.sev !== "error").map((c) => c.id));
  for (const id of waivable) ruleIds.add(id);
  const unwaivable = new Map(meta.checks.filter((c) => c.sev === "error").map((c) => [c.id, "is an error-level check and cannot be switched off: it keeps the definition consistent (only warnings and coverage rules can be waived)"]));
  const probeIds = new Set(meta.probes.map((p) => p.id));

  // Approval policy: which tiers need a person's sign-off, from which rung, and which element types
  // are approval units (an approval of one covers everything anchored beneath it).
  const own = raw.policy?.approval ?? {};
  if (raw.policy !== undefined) {
    if (!raw.policy || typeof raw.policy !== "object" || Array.isArray(raw.policy)) bad("policy must be a mapping");
    else for (const k of Object.keys(raw.policy)) if (k !== "approval") bad(`policy: unknown key ${k}`);
  }
  if (own && typeof own === "object") for (const k of Object.keys(own)) if (!["required_for_tiers", "from", "units"].includes(k)) bad(`policy.approval: unknown key ${k}`);
  if (own.required_for_tiers !== undefined && !(Array.isArray(own.required_for_tiers) && own.required_for_tiers.every((t) => [1, 2, 3].includes(t)))) bad("policy.approval.required_for_tiers must be a list of tiers: 1, 2 or 3");
  if (own.from !== undefined && !meta.ladder.includes(own.from)) bad(`policy.approval.from must be one of ${meta.ladder.join(", ")}`);
  if (own.units !== undefined && !(Array.isArray(own.units) && own.units.every((t) => meta.types.has(t)))) bad(`policy.approval.units must be a list of element types (${[...meta.types.keys()].join(", ")})`);
  const approvalPolicy = { required_for_tiers: [1], from: "specified", units: ["CAP", "FEAT"], ...(profile?.policy?.approval || {}) };
  for (const k of ["required_for_tiers", "from", "units"]) if (own[k] !== undefined && !problems.some((p) => p.msg.startsWith(`policy.approval.${k}`))) approvalPolicy[k] = own[k];

  // Where the records and the generated views live: folders inside the project, apart from each other.
  // Anything else is reported and the usual folder is used, so no command ever reaches outside the project.
  const folder = (key, usual) => {
    const given = raw[key];
    if (given === undefined) return usual;
    if (typeof given !== "string" || !given.trim()) {
      bad(`${key} must be the name of a folder`, key);
      return usual;
    }
    const clean = posix.normalize(given.trim().replace(/\\/g, "/")).replace(/\/$/, "");
    if (clean === "." || clean === ".." || clean.startsWith("../") || isAbsolute(clean) || /^[A-Za-z]:/.test(clean)) {
      bad(`${key} must be a folder inside the project, not ${given}`, key);
      return usual;
    }
    return clean;
  };
  const definitionDir = folder("definition_dir", "definition");
  let viewsDir = folder("views_dir", "views");
  if (overlap(viewsDir, definitionDir)) {
    bad(`views_dir (${viewsDir}) and definition_dir (${definitionDir}) must be separate folders, neither inside the other: the views are generated, and everything under the definition folder is read as a record`, "views_dir");
    viewsDir = ["views", "generated-views", "pds-generated-views"].find((v) => !overlap(v, definitionDir));
  }

  const config = {
    pds: 1,
    name: typeof raw.name === "string" ? raw.name : "Unnamed product",
    profile: raw.profile,
    adoption: meta.model.adoption.ladder.includes(adoption) ? adoption : "standard",
    modules,
    definitionDir,
    viewsDir,
    approvers: Array.isArray(approvers) ? approvers : [],
    disabledRules: disabled("rules", ruleIds, unwaivable),
    disabledProbes: disabled("probes", probeIds),
    policy: { approval: approvalPolicy },
  };
  config.enabledTypes = meta.enabledTypes(config.adoption);
  return { config, problems };
}

/**
 * Every record file under `dir`, in a fixed order. A link is followed only when
 * it leads somewhere inside the project: a definition is what is in its folder,
 * and a command that rewrites records must not reach files outside it. Only
 * regular files are read (a pipe called FEAT-x.md would wait forever).
 */
function walk(dir, { root, inside }, out = []) {
  const shown = (path) => relative(root, path).split(sep).join("/");
  for (const entry of readdirSync(dir, { withFileTypes: true }).sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0))) {
    const full = join(dir, entry.name);
    let isDir = entry.isDirectory();
    let isFile = entry.isFile();
    if (entry.isSymbolicLink()) {
      let real;
      try {
        real = realpathSync(full);
      } catch {
        throw new Error(`${shown(full)} is a link that leads nowhere (it is broken, or it loops back on itself)`);
      }
      if (!inside(real)) throw new Error(`${shown(full)} is a link to ${real}, outside the project. Records must live inside the project folder: move them in, or point definition_dir at the folder that holds them.`);
      const st = statSync(real);
      isDir = st.isDirectory();
      isFile = st.isFile();
    }
    if (isDir) walk(full, { root, inside }, out);
    else if (isFile && entry.name.endsWith(".md") && entry.name.toLowerCase() !== "readme.md" && !entry.name.startsWith("_")) out.push(full);
  }
  return out;
}

/** Read pds.yaml and every record under the definition folder. Paths are relative to `root`, with `/` separators. */
export function readProject(meta, root) {
  const cfgPath = join(root, CONFIG_FILE);
  if (!existsSync(cfgPath)) throw new Error(`no ${CONFIG_FILE} in ${root}`);
  const raw = parseYaml(readFileSync(cfgPath, "utf8"));
  const { config, problems } = resolveConfig(meta, raw);
  const files = new Map();
  const real = realpathSync(root);
  // The views folder is checked against where things really are: a link, or a capital letter on a
  // system that ignores case, can lead it out of the project or into the folder the records are in.
  if (!problems.some((p) => p.key === "views_dir")) {
    const views = realLocation(join(root, config.viewsDir));
    const records = realLocation(join(root, config.definitionDir));
    const bad = (msg) => problems.push({ id: "SCH-project", msg, key: "views_dir" });
    if (!isWithin(real, views)) bad(`views_dir (${config.viewsDir}) leads outside the project, to ${views}`);
    else if (isWithin(records, views) || isWithin(views, records)) bad(`views_dir (${config.viewsDir}) and definition_dir (${config.definitionDir}) are one folder, or one is inside the other, once links and capital letters are looked through: the views are generated, and everything under the definition folder is read as a record`);
  }
  const dir = join(root, config.definitionDir);
  if (existsSync(dir)) {
    const inside = (path) => path === real || path.startsWith(real + sep);
    const there = realpathSync(dir);
    if (!inside(there)) throw new Error(`${config.definitionDir} is a link to ${there}, outside the project. Records must live inside the project folder.`);
    for (const full of walk(dir, { root, inside })) files.set(relative(root, full).split(sep).join("/"), readFileSync(full, "utf8"));
  }
  return { root, config, files, problems };
}
