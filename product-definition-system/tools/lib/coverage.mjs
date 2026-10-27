// Coverage: which rules apply to an element, whether each holds, and from
// that, how far up the maturity ladder the definition really reaches.
//
// A rule atom is three-valued. true and false are what they say. null means
// "inactive": the atom only talks about element types this project has not
// enabled, so it cannot be asked. Inactive atoms are ignored in all/any/not,
// and a rule whose whole requirement is inactive does not apply at all. That
// is how one rule set serves every adoption level.

const isObj = (v) => v && typeof v === "object" && !Array.isArray(v);
const asList = (v) => (v === undefined || v === null ? [] : Array.isArray(v) ? v : [v]);

export const MIN_SECTION_WORDS = 3;

export function present(v) {
  if (v === undefined || v === null) return false;
  if (typeof v === "string") return v.trim().length > 0;
  if (Array.isArray(v)) return v.length > 0;
  if (isObj(v)) return Object.keys(v).length > 0;
  return true;
}

/** Field conditions: {field: value | [values] | {not: value | [values]}}, using defaults. */
export function matches(cond, el, meta) {
  for (const [k, want] of Object.entries(cond || {})) {
    const have = String(meta.field(el, k));
    if (isObj(want) && "not" in want) {
      if (asList(want.not).map(String).includes(have)) return false;
    } else if (!asList(want).map(String).includes(have)) return false;
  }
  return true;
}

function attrMatches(edge, want) {
  if (!want) return true;
  return Object.entries(want).every(([k, v]) => {
    const have = asList(edge.attrs[k]).map(String);
    return asList(v).map(String).some((x) => have.includes(x));
  });
}

export function applies(rule, el, model) {
  const { meta, config } = model;
  const a = rule.applies;
  const types = asList(a.type);
  if (!types.includes("*") && !types.includes(el.type)) return false;
  if (a.module && !config.modules.has(a.module)) return false;
  if (a.tiers && !a.tiers.includes(model.tierOf(el.id))) return false;
  if (a.where && !matches(a.where, el, meta)) return false;
  if (a.unless && matches(a.unless, el, meta)) return false;
  if (a.facet || a.not_facet) {
    if (el.type !== "FEAT") return false;
    const f = model.facets(el.id).effective;
    if (!asList(a.facet).every((n) => f[n])) return false;
    if (asList(a.not_facet).some((n) => f[n])) return false;
  }
  if (a.anchor) {
    const anc = model.get(el.anchor);
    if (!anc || !a.anchor.includes(anc.type)) return false;
  }
  return true;
}

export function evalAtom(a, el, model) {
  const { meta, config } = model;
  const enabled = config.enabledTypes;
  const live = (id) => {
    const t = model.get(id);
    return t && !model.isRetired(id) ? t : null;
  };

  if (a.all || a.any) {
    const results = (a.all || a.any).map((x) => evalAtom(x, el, model)).filter((r) => r !== null);
    if (!results.length) return null;
    return a.all ? results.every(Boolean) : results.some(Boolean);
  }
  if (a.not) {
    const r = evalAtom(a.not, el, model);
    return r === null ? null : !r;
  }
  if (a.field) {
    const v = meta.field(el, a.field);
    if (!present(v)) return false;
    if ("equals" in a && String(v) !== String(a.equals)) return false;
    if (a.one_of && !a.one_of.map(String).includes(String(v))) return false;
    if (a.min_items && !(Array.isArray(v) && v.length >= a.min_items)) return false;
    return true;
  }
  if (a.section) {
    const want = a.section.trim().toLowerCase();
    return el.rec.sections.some((s) => s.heading.trim().toLowerCase() === want && s.words >= MIN_SECTION_WORDS);
  }
  if (a.block) {
    const b = el.rec.blocks.find((x) => x.name === a.block);
    if (!b) return false;
    return a.block.startsWith("pds-") ? Boolean(b.data) && !b.error : b.text.trim().length > 0;
  }
  if (a.facet) return Boolean(model.facets(el.id).effective[a.facet]);

  if (a.out || a.in) {
    const dir = a.out ? "out" : "in";
    const s = a[dir];
    const ends = dir === "out" ? s.to : s.from;
    const types = ends ? ends.filter((t) => enabled.has(t)) : null;
    if (ends && types.length === 0) return null;
    const ids = new Set();
    for (const member of model.scope(el.id, s.include || "self")) {
      for (const edge of dir === "out" ? model.out(member.id, s.rel) : model.in(member.id, s.rel)) {
        const other = live(dir === "out" ? edge.to : edge.from);
        if (!other) continue;
        if (types && !types.includes(other.type)) continue;
        if (!attrMatches(edge, s.attr)) continue;
        if (s.where && !matches(s.where, other, meta)) continue;
        ids.add(other.id);
      }
    }
    const min = s.min ?? 1;
    return ids.size >= min && (s.max === undefined || ids.size <= s.max);
  }
  if (a.children) {
    const types = asList(a.children.type).filter((t) => enabled.has(t));
    if (types.length === 0) return null;
    const kids = model.children(el.id, types).filter((k) => !model.isRetired(k.id) && (!a.children.where || matches(a.children.where, k, meta)));
    const min = a.children.min ?? 1;
    return kids.length >= min && (a.children.max === undefined || kids.length <= a.children.max);
  }
  throw new Error(`unknown atom ${JSON.stringify(a)}`);
}

// ---------------------------------------------------------------- probes

/** The probes that apply to a feature, given its tier, kind and facets. */
export function applicableProbes(model, el) {
  if (el.type !== "FEAT") return [];
  const { meta, config } = model;
  const tier = model.tierOf(el.id);
  const f = model.facets(el.id).effective;
  const kind = meta.field(el, "kind");
  return meta.probes.filter((p) => {
    if (config.disabledProbes.has(p.id)) return false;
    if (!config.modules.has(p.module || "core")) return false;
    const a = p.applies || {};
    if (!(a.tiers || [1, 2]).includes(tier)) return false;
    if (a.kind && !a.kind.includes(kind)) return false;
    if (a.facet && !a.facet.every((n) => f[n])) return false;
    if (a.any_facet && !a.any_facet.some((n) => f[n])) return false;
    if (a.not_facet && a.not_facet.some((n) => f[n])) return false;
    return true;
  });
}

/** A well-formed disposition for a probe on a feature, or null. */
export function dispositionOf(el, probeId) {
  const d = isObj(el.front.probes) ? el.front.probes[probeId] : undefined;
  if (!isObj(d)) return null;
  const kinds = ["addressed", "na", "deferred"].filter((k) => k in d);
  if (kinds.length !== 1) return null;
  const kind = kinds[0];
  if (kind === "addressed") return Array.isArray(d.addressed) && d.addressed.length ? { kind, by: d.addressed } : null;
  if (typeof d[kind] !== "string" || !d[kind].trim()) return null;
  if (kind === "deferred" && !present(d.until)) return null;
  return { kind, reason: d[kind], until: d.until };
}

// ---------------------------------------------------------------- gates

/** Open blocking questions that concern this element or anything anchored under it. */
export function blockingQuestions(model, el) {
  const out = [];
  for (const q of model.all("QST")) {
    if (model.isRetired(q.id)) continue;
    if (model.meta.field(q, "status") !== "open" || model.meta.field(q, "blocking") !== true) continue;
    const targets = model.out(q.id, "concerns").map((e) => e.to);
    const hit = targets.some((t) => t === el.id || model.ancestors(t).some((a) => a.id === el.id));
    if (hit) out.push(q.id);
  }
  return out;
}

// ---------------------------------------------------------------- evaluation

/** Every rule result for one element: declarative, generated and probe rules. */
export function evaluateElement(model, el) {
  const { meta, config } = model;
  const results = [];
  for (const rule of [...meta.rules, ...meta.implicitRules]) {
    if (config.disabledRules.has(rule.id)) continue;
    if (!applies(rule, el, model)) continue;
    const pass = evalAtom(rule.require, el, model);
    if (pass === null) continue;
    results.push({ rule: rule.id, from: rule.applies.from, sev: rule.sev || "error", pass, msg: rule.msg, ask: rule.ask, kind: rule.implicit ? "generated" : "rule" });
  }
  for (const p of applicableProbes(model, el)) {
    results.push({
      rule: `PRB-${p.id}`,
      from: "specified",
      sev: "error",
      pass: dispositionOf(el, p.id) !== null,
      msg: `has no disposition for the "${p.title}" probe`,
      ask: p.ask,
      kind: "probe",
      probe: p.id,
    });
  }
  return results;
}

/**
 * Maturity as the definition supports it. The computed rung is the highest
 * one for which every error-severity rule from that rung down holds, capped by
 * the gates. The declared rung is the author's claim.
 */
export function computeMaturity(model, el, results) {
  const { meta } = model;
  const ladder = meta.ladder;
  const failing = results.filter((r) => !r.pass);
  const errorsAt = (rung) => failing.filter((r) => r.sev === "error" && meta.rung(r.from) === rung);

  let byRules = 0;
  for (let r = 1; r < ladder.length; r++) {
    if (errorsAt(r).length) break;
    byRules = r;
  }

  const caps = [];
  const blockers = blockingQuestions(model, el);
  if (blockers.length) caps.push({ gate: "GATE-blocking-question", rung: "outlined", by: blockers });
  if (meta.field(el, "origin") === "skeleton") caps.push({ gate: "GATE-skeleton", rung: "outlined", by: [] });
  let computed = byRules;
  for (const c of caps) computed = Math.min(computed, meta.rung(c.rung));

  const declared = ladder.includes(el.declared) ? meta.rung(el.declared) : 0;
  return {
    id: el.id,
    declared: ladder[declared],
    byRules: ladder[byRules],
    computed: ladder[computed],
    caps,
    results,
    // what stands between this element and its next rung
    next: computed + 1 < ladder.length ? ladder[computed + 1] : null,
  };
}

/** Evaluate every non-retired element. Returns Map id -> maturity record. */
export function evaluateAll(model) {
  const out = new Map();
  for (const el of model.elements.values()) {
    if (model.isRetired(el.id)) continue;
    out.set(el.id, computeMaturity(model, el, evaluateElement(model, el)));
  }
  return out;
}
