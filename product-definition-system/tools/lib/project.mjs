// A project: pds.yaml and the definition folder it points at.
import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { parseYaml } from "./yaml.mjs";

export const CONFIG_FILE = "pds.yaml";
const KNOWN_KEYS = ["pds", "name", "profile", "adoption", "modules", "definition_dir", "views_dir", "approvers", "rules", "probes", "policy"];

/**
 * Turn the raw pds.yaml mapping into a resolved configuration. Anything the
 * project leaves out comes from its profile. Returns problems instead of
 * throwing, so the linter can report them.
 */
export function resolveConfig(meta, raw) {
  const problems = [];
  const bad = (msg) => problems.push({ id: "SCH-project", msg });
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    bad("pds.yaml must be a mapping");
    raw = {};
  }
  for (const k of Object.keys(raw)) if (!KNOWN_KEYS.includes(k)) bad(`unknown key ${k}`);
  if (raw.pds !== 1) bad("pds: 1 is required (the format version)");
  if (typeof raw.name !== "string" || !raw.name.trim()) bad("name is required");

  const profile = raw.profile === undefined ? undefined : meta.profile(raw.profile);
  if (raw.profile !== undefined && !profile) bad(`unknown profile ${raw.profile}; known: ${Object.keys(meta.profiles).join(", ") || "none"}`);
  const defaults = profile?.defaults || {};

  const adoption = raw.adoption ?? defaults.adoption ?? "standard";
  if (!meta.model.adoption.ladder.includes(adoption)) bad(`adoption must be one of ${meta.model.adoption.ladder.join(", ")}`);

  const modules = new Set(["core", ...(raw.modules ?? defaults.modules ?? [])]);
  for (const m of modules) if (!meta.modules[m]) bad(`unknown module ${m}`);

  const approvers = raw.approvers ?? [];
  if (!Array.isArray(approvers) || approvers.some((a) => typeof a !== "string")) bad("approvers must be a list of names");

  const disabled = (key, known) => {
    const out = new Map();
    for (const item of raw[key]?.disable ?? []) {
      if (!item || typeof item.id !== "string") {
        bad(`${key}.disable entries need an id`);
        continue;
      }
      if (!known.has(item.id)) bad(`${key}.disable: unknown id ${item.id}`);
      if (typeof item.reason !== "string" || item.reason.trim().length < 8) bad(`${key}.disable ${item.id}: give a reason (at least a short sentence)`);
      out.set(item.id, item.reason);
    }
    return out;
  };
  const ruleIds = new Set([...meta.rules, ...meta.implicitRules].map((r) => r.id));
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

  const config = {
    pds: 1,
    name: typeof raw.name === "string" ? raw.name : "Unnamed product",
    profile: raw.profile,
    adoption: meta.model.adoption.ladder.includes(adoption) ? adoption : "standard",
    modules,
    definitionDir: raw.definition_dir ?? "definition",
    viewsDir: raw.views_dir ?? "views",
    approvers: Array.isArray(approvers) ? approvers : [],
    disabledRules: disabled("rules", ruleIds),
    disabledProbes: disabled("probes", probeIds),
    policy: { approval: approvalPolicy },
  };
  config.enabledTypes = meta.enabledTypes(config.adoption);
  return { config, problems };
}

function walk(dir, out = []) {
  for (const name of readdirSync(dir).sort()) {
    const full = join(dir, name);
    const st = statSync(full);
    if (st.isDirectory()) walk(full, out);
    else if (name.endsWith(".md") && name.toLowerCase() !== "readme.md" && !name.startsWith("_")) out.push(full);
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
  const dir = join(root, config.definitionDir);
  if (existsSync(dir)) {
    for (const full of walk(dir)) files.set(relative(root, full).split(sep).join("/"), readFileSync(full, "utf8"));
  }
  return { root, config, files, problems };
}
