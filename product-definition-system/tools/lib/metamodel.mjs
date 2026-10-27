// The meta-model, loaded from meta-model/*.yaml. Everything the tool knows
// about element types, relations, rules, probes and views comes through here;
// nothing in the tool hard-codes a type, a relation or a rule.
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { parseYaml } from "./yaml.mjs";
import { validatePatterns } from "./seed.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
export const DEFAULT_META_DIR = join(HERE, "..", "..", "meta-model");

export const FIELD_TYPES = ["string", "text", "int", "number", "bool", "date", "enum", "ref", "refs", "strings", "any", "shape"];
export const SHAPES = ["price", "examples", "entitlements", "links", "facets", "probes", "approval", "rel"];
export const CHECK_CLASSES = ["SCH", "REF", "COH", "QLT", "GOV", "PRB"];
export const SEVERITIES = ["error", "warn", "info"];
const IMPACT = ["strong", "weak", "none"];
export const BLOCK_NAMES = ["pds-flow", "pds-states", "pds-attributes", "pds-journey", "pds-payload", "gherkin"];

function readYaml(dir, file) {
  const path = join(dir, file);
  try {
    return parseYaml(readFileSync(path, "utf8"));
  } catch (e) {
    throw new Error(`${file}: ${e.message}`);
  }
}

export function loadMeta(dir = DEFAULT_META_DIR) {
  const model = readYaml(dir, "model.yaml");
  const element = readYaml(dir, "element-types.yaml");
  const relation = readYaml(dir, "relation-types.yaml");
  const rules = readYaml(dir, "rules.yaml");
  const probes = readYaml(dir, "probes.yaml");
  const views = readYaml(dir, "views.yaml");
  const profiles = {};
  const pdir = join(dir, "profiles");
  if (existsSync(pdir)) {
    for (const f of readdirSync(pdir).sort()) {
      if (!f.endsWith(".yaml") || f.endsWith(".patterns.yaml")) continue;
      const p = readYaml(dir, join("profiles", f));
      profiles[p.id] = p;
    }
  }
  return new Meta({ dir, model, element, relation, rules, probes, views, profiles });
}

export class Meta {
  constructor({ dir, model, element, relation, rules, probes, views, profiles }) {
    this.dir = dir;
    this.model = model;
    this.envelope = element.envelope || {};
    this.types = new Map();
    for (const [code, spec] of Object.entries(element.types || {})) {
      this.types.set(code, {
        code,
        anchors: [],
        fields: {},
        sections: [],
        blocks: {},
        singleton: false,
        ...spec,
      });
    }
    this.relations = new Map(Object.entries(relation.relations || {}).map(([name, spec]) => [name, { name, ...spec }]));
    this.impactConfig = relation.impact || { strong_hops: 2, weak_hops: 1 };
    this.inverseNames = new Map([...this.relations.values()].map((r) => [r.inverse, r.name]));
    this.rules = rules.rules || [];
    this.checks = rules.checks || [];
    this.gates = rules.gates || [];
    this.probes = probes.probes || [];
    this.views = new Map(Object.entries(views.views || {}));
    this.profiles = profiles;
    this.ladder = model.maturity.ladder;
    this.families = model.families;
    this.modules = model.modules;
    this.facets = model.facets;
    this.tiers = model.tiers;
    this.spine = model.spine;
    this._implicit = null;
  }

  // ---- types and ids
  typeOfId(id) {
    if (typeof id !== "string") return null;
    const i = id.indexOf("-");
    if (i < 2) return null;
    const code = id.slice(0, i);
    return this.types.has(code) ? code : null;
  }
  spec(type) {
    return this.types.get(type);
  }
  familyOf(type) {
    return this.types.get(type)?.family;
  }
  isSpine(type) {
    return this.spine.some((s) => s.type === type);
  }
  spineIndex(type) {
    return this.spine.findIndex((s) => s.type === type);
  }
  fieldSpec(type, name) {
    return this.types.get(type)?.fields?.[name] ?? this.envelope[name];
  }
  allowedKeys(type) {
    return new Set([...Object.keys(this.envelope), ...Object.keys(this.types.get(type)?.fields || {})]);
  }
  /** Field value with the type's default applied. */
  field(el, name) {
    const v = el.front?.[name];
    if (v !== undefined && v !== null) return v;
    return this.fieldSpec(el.type, name)?.default;
  }

  // ---- adoption and maturity
  adoptionIndex(level) {
    return this.model.adoption.ladder.indexOf(level);
  }
  enabledTypes(adoption) {
    const max = this.adoptionIndex(adoption);
    return new Set([...this.types.values()].filter((t) => this.adoptionIndex(t.adoption) <= max).map((t) => t.code));
  }
  rung(name) {
    return this.ladder.indexOf(name);
  }

  // ---- generated rules
  /** Rules implied by `required_at` in element-types.yaml: fields, sections and blocks. */
  get implicitRules() {
    if (this._implicit) return this._implicit;
    const out = [];
    for (const [name, spec] of Object.entries(this.envelope)) {
      if (!spec.required_at || spec.required_at === "stub") continue;
      out.push({
        id: `FLD-ALL-${name}`,
        implicit: true,
        applies: { type: "*", from: spec.required_at },
        require: { field: name },
        sev: "error",
        msg: `has no ${name}`,
        ask: spec.doc,
      });
    }
    for (const t of this.types.values()) {
      for (const [name, spec] of Object.entries(t.fields)) {
        if (!spec.required_at) continue;
        out.push({
          id: `FLD-${t.code}-${name}`,
          implicit: true,
          applies: { type: t.code, from: spec.required_at },
          require: { field: name },
          sev: "error",
          msg: `has no ${name}`,
          ask: spec.doc,
        });
      }
      for (const s of t.sections) {
        if (!s.required_at) continue;
        const slug = s.heading.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
        const applies = { type: t.code, from: s.required_at };
        if (s.tiers) applies.tiers = s.tiers;
        out.push({
          id: `SEC-${t.code}-${slug}`,
          implicit: true,
          applies,
          require: { section: s.heading },
          sev: "error",
          msg: `has no "${s.heading}" section`,
          ask: s.ask,
        });
      }
      for (const [name, spec] of Object.entries(t.blocks)) {
        if (!spec.required_at) continue;
        const applies = { type: t.code, from: spec.required_at };
        if (spec.unless) applies.unless = spec.unless;
        out.push({
          id: `BLK-${t.code}-${name}`,
          implicit: true,
          applies,
          require: { block: name },
          sev: "error",
          msg: `has no ${name} block`,
          ask: spec.doc,
        });
      }
    }
    this._implicit = out;
    return out;
  }

  profile(id) {
    return this.profiles[id];
  }

  /** The skeleton seeds a profile starts a project with, or null when it has none. */
  patterns(id) {
    const file = this.profiles[id]?.patterns;
    if (!file) return null;
    this._patterns ||= new Map();
    if (!this._patterns.has(id)) this._patterns.set(id, readYaml(this.dir, join("profiles", file)));
    return this._patterns.get(id);
  }
}

// ----------------------------------------------------------------- validation

function* atoms(a) {
  if (!a || typeof a !== "object") return;
  yield a;
  for (const k of ["all", "any"]) if (Array.isArray(a[k])) for (const x of a[k]) yield* atoms(x);
  if (a.not) yield* atoms(a.not);
}

const ATOM_KEYS = ["all", "any", "not", "field", "section", "block", "out", "in", "children", "facet"];

/** Which relations and types an atom or rule mentions: used by validation and the docs generator. */
export function atomRefs(a) {
  const rels = new Set();
  const types = new Set();
  for (const x of atoms(a)) {
    if (x.out?.rel) rels.add(x.out.rel);
    if (x.in?.rel) rels.add(x.in.rel);
    for (const k of ["out", "in"]) for (const t of x[k]?.to || x[k]?.from || []) types.add(t);
    if (x.children) for (const t of [].concat(x.children.type)) types.add(t);
  }
  return { rels, types };
}

/**
 * Check the meta-model against itself. Returns a list of problems; empty
 * means it is consistent. `impl` carries what the code provides so the
 * declared checks and views can be compared with what exists.
 */
export function validateMeta(meta, impl = {}) {
  const P = [];
  const add = (where, msg) => P.push(`${where}: ${msg}`);
  const types = meta.types;
  const typeIdOk = (t) => t === "*" || types.has(t);
  const ladder = meta.ladder;

  // model
  if (!ladder.includes("stub")) add("model", "maturity ladder must start at stub");
  for (const r of ladder) if (!meta.model.maturity.rungs?.[r]) add("model", `no description for maturity rung ${r}`);
  for (const t of ["1", "2", "3"]) if (!meta.tiers[t]) add("model", `tier ${t} missing`);
  for (const s of meta.spine) if (!types.has(s.type)) add("model.spine", `unknown type ${s.type}`);
  for (const [f, spec] of Object.entries(meta.facets)) {
    if (spec.derived === false) continue;
    if (!Array.isArray(spec.derived)) add(`facet ${f}`, "derived must be false or a list of clauses");
    for (const c of spec.derived || []) {
      if (c.out && !meta.relations.has(c.out)) add(`facet ${f}`, `unknown relation ${c.out}`);
      for (const t of [...(c.satellite || []), ...(c.to || [])]) if (!types.has(t)) add(`facet ${f}`, `unknown type ${t}`);
    }
  }

  // families and types
  const familyUse = new Map(Object.keys(meta.families).map((f) => [f, 0]));
  for (const t of types.values()) {
    const w = `type ${t.code}`;
    if (!meta.families[t.family]) add(w, `unknown family ${t.family}`);
    else familyUse.set(t.family, familyUse.get(t.family) + 1);
    if (!meta.model.adoption.ladder.includes(t.adoption)) add(w, `unknown adoption ${t.adoption}`);
    if (!t.name || !t.summary) add(w, "needs a name and a summary");
    if (!/^[A-Z]{2,5}$/.test(t.code)) add(w, "code must be 2-5 capital letters");
    for (const a of t.anchors) if (!types.has(a)) add(w, `anchor type ${a} unknown`);
    if (t.code !== "PROD" && t.anchors.length === 0) add(w, "has no allowed anchor");
    const all = { ...meta.envelope, ...t.fields };
    for (const [fname, f] of Object.entries(t.fields)) fieldProblems(`${w}.${fname}`, f);
    for (const s of t.sections) {
      if (!s.heading || !s.ask) add(w, `section needs heading and ask: ${JSON.stringify(s)}`);
      if (s.required_at && !ladder.includes(s.required_at)) add(w, `section ${s.heading}: bad required_at`);
    }
    for (const [b, spec] of Object.entries(t.blocks)) {
      if (!BLOCK_NAMES.includes(b)) add(w, `unknown block ${b}`);
      if (spec.required_at && !ladder.includes(spec.required_at)) add(w, `block ${b}: bad required_at`);
    }
    if (t.sections.length === 0 && !Object.values(all).some((f) => f.required_at && f.required_at !== "stub") && Object.keys(t.blocks).length === 0) {
      add(w, "has nothing to say about itself: no required field, section or block");
    }
  }
  for (const [f, n] of familyUse) if (n === 0) add(`family ${f}`, "has no element type");
  for (const [fname, f] of Object.entries(meta.envelope)) fieldProblems(`envelope.${fname}`, f);

  function fieldProblems(w, f) {
    if (!FIELD_TYPES.includes(f.type)) add(w, `unknown field type ${f.type}`);
    if (f.type === "enum" && !Array.isArray(f.values)) add(w, "enum needs values");
    if (f.type === "shape" && !SHAPES.includes(f.shape)) add(w, `unknown shape ${f.shape}`);
    if ((f.type === "ref" || f.type === "refs")) {
      for (const t of f.types || []) if (!typeIdOk(t)) add(w, `unknown type ${t}`);
      if (!f.edge) add(w, "a reference field must declare the relation it produces (edge), or edge: none");
      else if (f.edge !== "none" && f.edge !== "anchor" && !meta.relations.has(f.edge)) add(w, `unknown edge relation ${f.edge}`);
    }
    if (f.required_at && !ladder.includes(f.required_at)) add(w, `bad required_at ${f.required_at}`);
    if (!f.doc && !w.startsWith("envelope")) add(w, "needs a doc");
  }

  // relations
  const names = new Set(meta.relations.keys());
  const seenInv = new Set();
  for (const r of meta.relations.values()) {
    const w = `relation ${r.name}`;
    if (!r.inverse) add(w, "needs an inverse name");
    else {
      if (names.has(r.inverse)) add(w, `inverse ${r.inverse} collides with a relation`);
      if (seenInv.has(r.inverse)) add(w, `inverse ${r.inverse} used twice`);
      seenInv.add(r.inverse);
    }
    if (!r.doc) add(w, "needs a doc");
    if (!r.allow?.length) add(w, "needs allowed pairs");
    for (const a of r.allow || []) for (const t of [...a.from, ...a.to]) if (!typeIdOk(t)) add(w, `unknown type ${t}`);
    for (const k of ["to", "from"]) if (!IMPACT.includes(r.impacts?.[k])) add(w, `impacts.${k} must be ${IMPACT.join("/")}`);
    for (const [an, a] of Object.entries(r.attrs || {})) if (!FIELD_TYPES.includes(a.type)) add(w, `attr ${an} has unknown type ${a.type}`);
  }

  const ic = meta.impactConfig;
  for (const k of ["strong_hops", "weak_hops"]) if (!Number.isInteger(ic[k]) || ic[k] < 1) add("impact", `${k} must be a whole number of at least 1`);
  if (ic.weak_hops > ic.strong_hops) add("impact", "weak_hops cannot exceed strong_hops: a weak edge reaches no further than a strong one");
  for (const k of ["down", "up"]) if (!IMPACT.includes(ic.anchor?.[k])) add("impact", `anchor.${k} must be ${IMPACT.join("/")}`);

  // rules
  const ruleIds = new Set();
  const consumed = new Set();
  const enabledModules = Object.keys(meta.modules);
  const checkAtom = (w, a) => {
    for (const x of atoms(a)) {
      const keys = Object.keys(x).filter((k) => ATOM_KEYS.includes(k));
      if (keys.length !== 1) add(w, `atom must have exactly one of ${ATOM_KEYS.join(", ")}: ${JSON.stringify(x)}`);
      for (const k of ["out", "in"]) {
        if (!x[k]) continue;
        if (!meta.relations.has(x[k].rel)) add(w, `unknown relation ${x[k].rel}`);
        else consumed.add(x[k].rel);
        for (const t of x[k].to || x[k].from || []) if (!types.has(t)) add(w, `unknown type ${t}`);
        if (x[k].include && !["self", "children", "descendants"].includes(x[k].include)) add(w, `bad include ${x[k].include}`);
      }
      if (x.children) for (const t of [].concat(x.children.type)) if (!types.has(t)) add(w, `unknown type ${t}`);
      if (x.facet && !meta.facets[x.facet]) add(w, `unknown facet ${x.facet}`);
    }
  };
  for (const r of [...meta.rules, ...meta.implicitRules]) {
    const w = `rule ${r.id}`;
    if (ruleIds.has(r.id)) add(w, "duplicate id");
    ruleIds.add(r.id);
    if (!r.msg || !r.ask) add(w, "needs msg and ask");
    if (r.sev && !SEVERITIES.includes(r.sev)) add(w, `bad severity ${r.sev}`);
    const a = r.applies || {};
    for (const t of [].concat(a.type)) if (!typeIdOk(t)) add(w, `unknown type ${t}`);
    if (!ladder.includes(a.from) || a.from === "stub") add(w, `bad from ${a.from}`);
    if (a.module && !enabledModules.includes(a.module)) add(w, `unknown module ${a.module}`);
    for (const f of [].concat(a.facet || [], a.not_facet || [])) if (!meta.facets[f]) add(w, `unknown facet ${f}`);
    for (const t of a.anchor || []) if (!types.has(t)) add(w, `unknown anchor type ${t}`);
    checkAtom(w, r.require);
    // an atom on the element's own edges must be satisfiable by some allowed pair
    for (const x of atoms(r.require)) {
      for (const dir of ["out", "in"]) {
        const spec = x[dir];
        if (!spec || (spec.include && spec.include !== "self") || !meta.relations.has(spec.rel)) continue;
        const rel = meta.relations.get(spec.rel);
        const here = dir === "out" ? "from" : "to";
        const there = dir === "out" ? "to" : "from";
        const wanted = spec.to || spec.from || [];
        for (const t of [].concat(a.type)) {
          if (t === "*") continue;
          const ok = rel.allow.some((p) => (p[here].includes(t) || p[here].includes("*")) && (!wanted.length || p[there].includes("*") || wanted.some((u) => p[there].includes(u))));
          if (!ok) add(w, `${dir}: ${spec.rel}${wanted.length ? " [" + wanted.join(",") + "]" : ""} can never be satisfied for ${t}: no allowed pair`);
        }
      }
    }
    // where/unless keys must be fields of the type
    for (const [k, list] of [["where", a.where], ["unless", a.unless]]) {
      if (!list) continue;
      for (const f of Object.keys(list)) {
        for (const t of [].concat(a.type)) {
          if (t !== "*" && types.has(t) && !meta.fieldSpec(t, f)) add(w, `${k}.${f} is not a field of ${t}`);
        }
      }
    }
  }

  // checks
  const checkIds = new Set();
  for (const c of meta.checks) {
    const w = `check ${c.id}`;
    if (checkIds.has(c.id)) add(w, "duplicate id");
    checkIds.add(c.id);
    if (!CHECK_CLASSES.includes(c.class)) add(w, `bad class ${c.class}`);
    if (!c.id.startsWith(c.class + "-")) add(w, "id must start with its class");
    if (!SEVERITIES.includes(c.sev)) add(w, `bad severity ${c.sev}`);
    if (c.from && !ladder.includes(c.from)) add(w, `bad from ${c.from}`);
    if (!c.doc) add(w, "needs a doc");
    for (const rel of c.uses || []) {
      if (!meta.relations.has(rel)) add(w, `unknown relation ${rel}`);
      else consumed.add(rel);
    }
  }
  if (impl.checks) {
    for (const id of impl.checks) if (!checkIds.has(id)) add("checks", `${id} is implemented but not declared in rules.yaml`);
    for (const id of checkIds) if (!impl.checks.includes(id)) add("checks", `${id} is declared in rules.yaml but not implemented`);
  }

  // probes
  const probeIds = new Set();
  for (const p of meta.probes) {
    const w = `probe ${p.id}`;
    if (probeIds.has(p.id)) add(w, "duplicate id");
    probeIds.add(p.id);
    if (p.module && !meta.modules[p.module]) add(w, `unknown module ${p.module}`);
    if (!p.ask || !p.title) add(w, "needs a title and an ask");
    for (const t of p.addressed_by || []) if (!types.has(t)) add(w, `unknown type ${t}`);
    if (!(p.addressed_by || []).length) add(w, "needs addressed_by");
    const a = p.applies || {};
    for (const f of [...(a.facet || []), ...(a.any_facet || []), ...(a.not_facet || [])]) if (!meta.facets[f]) add(w, `unknown facet ${f}`);
    const kinds = meta.fieldSpec("FEAT", "kind")?.values || [];
    for (const k of a.kind || []) if (!kinds.includes(k)) add(w, `unknown feature kind ${k}`);
    for (const t of a.tiers || []) if (!meta.tiers[String(t)]) add(w, `unknown tier ${t}`);
  }

  // views
  for (const [id, v] of meta.views) {
    const w = `view ${id}`;
    if (!v.title || !v.answers) add(w, "needs a title and the question it answers");
    if (!["implemented", "planned"].includes(v.status)) add(w, `bad status ${v.status}`);
    for (const rel of v.uses || []) {
      if (rel === "anchor") continue;
      if (!meta.relations.has(rel)) add(w, `unknown relation ${rel}`);
      else consumed.add(rel);
    }
  }
  if (impl.views) {
    for (const [id, v] of meta.views) {
      if (v.status === "implemented" && !impl.views.includes(id)) add(`view ${id}`, "is marked implemented but has no renderer");
      if (v.status !== "implemented" && impl.views.includes(id)) add(`view ${id}`, "has a renderer but is not marked implemented");
    }
    for (const id of impl.views) if (!meta.views.has(id)) add(`view ${id}`, "has a renderer but is not declared in views.yaml");
  }

  // the principle: no relation without a consumer
  for (const name of meta.relations.keys()) {
    if (name === "mentions") continue; // consumed by REF-mention through `uses`, checked below
    if (!consumed.has(name)) add(`relation ${name}`, "nothing reads it: no rule, check or view uses it");
  }
  if (!consumed.has("mentions")) add("relation mentions", "nothing reads it");

  // profiles
  for (const p of Object.values(meta.profiles)) {
    const w = `profile ${p.id}`;
    if (!meta.model.adoption.ladder.includes(p.defaults?.adoption)) add(w, "bad default adoption");
    for (const m of p.defaults?.modules || []) if (!meta.modules[m]) add(w, `unknown module ${m}`);
    const ap = p.policy?.approval;
    if (ap) {
      if (ap.required_for_tiers !== undefined && !(Array.isArray(ap.required_for_tiers) && ap.required_for_tiers.every((t) => [1, 2, 3].includes(t)))) add(w, "policy.approval.required_for_tiers must be a list of tiers 1, 2 or 3");
      if (ap.from !== undefined && !meta.ladder.includes(ap.from)) add(w, `policy.approval.from is not a rung: ${ap.from}`);
      for (const t of ap.units || []) if (!meta.types.has(t)) add(w, `policy.approval.units: unknown element type ${t}`);
    }
    if (p.patterns) {
      let patterns = null;
      try {
        patterns = meta.patterns(p.id);
      } catch (e) {
        add(w, `cannot read ${p.patterns}: ${e.message}`);
      }
      if (patterns) for (const msg of validatePatterns(meta, patterns)) add(w, msg);
    }
  }

  return P;
}
