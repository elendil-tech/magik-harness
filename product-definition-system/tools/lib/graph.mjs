// The model: elements, the spine (anchors) and the typed relation graph.
//
// Hierarchy lives only in `anchor`. Relations are authored once, under `rel`,
// and in the structured blocks and reference fields that imply them; this
// module reads all of those and builds one edge list, so every consumer (the
// rules, the views, the impact walk) sees the same graph.
import { readRecord, ID_RE } from "./records.mjs";

const isObj = (v) => v && typeof v === "object" && !Array.isArray(v);
const asList = (v) => (v === undefined || v === null ? [] : Array.isArray(v) ? v : [v]);
const isId = (v) => typeof v === "string" && ID_RE.test(v);

export class Model {
  constructor(meta, config) {
    this.meta = meta;
    this.config = config;
    this.records = [];
    this.elements = new Map();
    this.edges = [];
    this.out_ = new Map();
    this.in_ = new Map();
    this.kids = new Map();
    this.duplicates = [];
    this.facetCache = new Map();
    this.tierCache = new Map();
  }

  // ---- lookup
  get(id) {
    return this.elements.get(id);
  }
  has(id) {
    return this.elements.has(id);
  }
  all(type) {
    const list = [...this.elements.values()];
    return type ? list.filter((e) => [].concat(type).includes(e.type)) : list;
  }
  children(id, type) {
    const list = (this.kids.get(id) || []).map((k) => this.elements.get(k));
    return type ? list.filter((e) => [].concat(type).includes(e.type)) : list;
  }
  descendants(id) {
    const out = [];
    const stack = [...this.children(id)];
    const seen = new Set([id]);
    while (stack.length) {
      const e = stack.pop();
      if (seen.has(e.id)) continue;
      seen.add(e.id);
      out.push(e);
      stack.push(...this.children(e.id));
    }
    return out;
  }
  ancestors(id) {
    const out = [];
    const seen = new Set([id]);
    let cur = this.elements.get(id);
    while (cur && cur.anchor && !seen.has(cur.anchor)) {
      const a = this.elements.get(cur.anchor);
      if (!a) break;
      out.push(a);
      seen.add(a.id);
      cur = a;
    }
    return out;
  }
  out(id, rel) {
    const m = this.out_.get(id);
    if (!m) return [];
    return rel ? m.get(rel) || [] : [...m.values()].flat();
  }
  in(id, rel) {
    const m = this.in_.get(id);
    if (!m) return [];
    return rel ? m.get(rel) || [] : [...m.values()].flat();
  }
  /** The element and what is anchored directly under it, or the whole subtree. */
  scope(id, include = "self") {
    const self = this.elements.get(id);
    if (!self) return [];
    if (include === "children") return [self, ...this.children(id)];
    if (include === "descendants") return [self, ...this.descendants(id)];
    return [self];
  }

  // ---- derived properties
  tierOf(id) {
    if (this.tierCache.has(id)) return this.tierCache.get(id);
    let tier = 2;
    for (const e of [this.elements.get(id), ...this.ancestors(id)]) {
      if (!e) continue;
      const t = Number(e.front.tier);
      if ([1, 2, 3].includes(t)) {
        tier = t;
        break;
      }
    }
    this.tierCache.set(id, tier);
    return tier;
  }
  lifecycleOf(id) {
    return this.elements.get(id)?.front.lifecycle || "active";
  }
  isRetired(id) {
    return this.lifecycleOf(id) === "retired";
  }
  /** Facets of a feature: derived from the graph, plus what is declared true. */
  facets(id) {
    if (this.facetCache.has(id)) return this.facetCache.get(id);
    const el = this.elements.get(id);
    const result = { derived: {}, declared: {}, effective: {} };
    if (el && el.type === "FEAT") {
      const declared = isObj(el.front.facets) ? el.front.facets : {};
      const scope = this.scope(id, "children");
      for (const [name, spec] of Object.entries(this.meta.facets)) {
        let derived = false;
        if (Array.isArray(spec.derived)) derived = spec.derived.some((c) => this.clause(c, scope));
        result.derived[name] = derived;
        if (name in declared) result.declared[name] = declared[name] === true;
        result.effective[name] = derived || declared[name] === true;
      }
    }
    this.facetCache.set(id, result);
    return result;
  }
  clause(c, scope) {
    if (c.satellite) return scope.some((e) => c.satellite.includes(e.type));
    if (c.out) {
      for (const e of scope) {
        for (const edge of this.out(e.id, c.out)) {
          const target = this.elements.get(edge.to);
          if (c.to && !(target && c.to.includes(target.type))) continue;
          if (c.ops_any && !asList(edge.attrs.ops).some((o) => c.ops_any.includes(o))) continue;
          if (c.target_field) {
            if (!target) continue;
            const ok = Object.entries(c.target_field).every(([f, v]) => this.meta.field(target, f) === v);
            if (!ok) continue;
          }
          return true;
        }
      }
    }
    return false;
  }
}

/**
 * Read every record and build the model. Records that cannot be read, or that
 * repeat an id, are kept in `model.records` with a problem and left out of the
 * graph; the checks report them.
 */
export function buildModel(meta, config, files) {
  const model = new Model(meta, config);
  const paths = [...files.keys()].sort();
  for (const path of paths) {
    const rec = readRecord(path, files.get(path));
    model.records.push(rec);
    if (!rec.ok || !rec.id) continue;
    const type = meta.typeOfId(rec.id);
    if (!type) continue;
    if (model.elements.has(rec.id)) {
      model.duplicates.push({ id: rec.id, path, first: model.elements.get(rec.id).path });
      continue;
    }
    const front = rec.front;
    model.elements.set(rec.id, {
      id: rec.id,
      type,
      family: meta.familyOf(type),
      path,
      rec,
      front,
      title: typeof front.title === "string" ? front.title : rec.id,
      anchor: typeof front.anchor === "string" ? front.anchor : undefined,
      declared: typeof front.maturity === "string" ? front.maturity : undefined,
    });
  }
  for (const e of model.elements.values()) {
    if (!e.anchor) continue;
    if (!model.kids.has(e.anchor)) model.kids.set(e.anchor, []);
    model.kids.get(e.anchor).push(e.id);
  }
  for (const list of model.kids.values()) list.sort();
  for (const e of model.elements.values()) readEdges(model, e);
  for (const edge of model.edges) {
    if (!model.out_.has(edge.from)) model.out_.set(edge.from, new Map());
    const o = model.out_.get(edge.from);
    if (!o.has(edge.rel)) o.set(edge.rel, []);
    o.get(edge.rel).push(edge);
    if (!model.in_.has(edge.to)) model.in_.set(edge.to, new Map());
    const i = model.in_.get(edge.to);
    if (!i.has(edge.rel)) i.set(edge.rel, []);
    i.get(edge.rel).push(edge);
  }
  return model;
}

function readEdges(model, el) {
  const { meta } = model;
  const edge = (rel, to, attrs = {}, via = "rel", line) => {
    if (!isId(to) || !meta.relations.has(rel)) return;
    model.edges.push({ from: el.id, to, rel, attrs, via, line });
  };

  // authored relations
  const rel = el.front.rel;
  if (isObj(rel)) {
    for (const [name, value] of Object.entries(rel)) {
      for (const item of asList(value)) {
        if (typeof item === "string") edge(name, item);
        else if (isObj(item) && typeof item.to === "string") {
          const { to, ...attrs } = item;
          edge(name, to, attrs);
        }
      }
    }
  }

  // reference fields that produce an edge
  const specs = { ...meta.spec(el.type).fields };
  for (const [name, spec] of Object.entries(specs)) {
    if ((spec.type !== "ref" && spec.type !== "refs") || !spec.edge || spec.edge === "none") continue;
    for (const to of asList(el.front[name])) edge(spec.edge, to, { ...(spec.edge_attrs || {}) }, `field:${name}`);
  }

  // plan entitlements are grants
  if (el.type === "PLAN") {
    for (const item of asList(el.front.entitlements)) {
      if (isObj(item)) edge("grants", item.entl, { value: item.value }, "field:entitlements");
    }
  }

  // structured blocks
  for (const b of el.rec.blocks) {
    if (!b.data || !isObj(b.data)) continue;
    const via = `block:${b.name}`;
    const line = b.line;
    if (b.name === "pds-flow" && el.type === "FLW") {
      for (const s of asList(b.data.steps)) {
        if (!isObj(s)) continue;
        const stage = s.id;
        edge("audience", s.actor, { step: stage }, via, line);
        edge("touches", s.at, { step: stage }, via, line);
        for (const u of asList(s.uses)) {
          const t = meta.typeOfId(u);
          if (t === "RULE") edge("governed_by", u, { step: stage }, via, line);
          else if (t === "EXT" || t === "INT" || t === "API") edge("depends_on", u, { step: stage, kind: "hard" }, via, line);
        }
        if (isObj(s.accesses)) {
          for (const [ent, ops] of Object.entries(s.accesses)) edge("accesses", ent, { ops: asList(ops), step: stage }, via, line);
        }
        for (const ev of asList(s.emits)) edge("emits", ev, { step: stage }, via, line);
        if (isObj(s.moves)) {
          for (const [stm, tr] of Object.entries(s.moves)) edge("drives", stm, { transitions: asList(tr), step: stage }, via, line);
        }
        edge("depends_on", s.call, { kind: "hard", note: "calls", step: stage }, via, line);
      }
    } else if (b.name === "pds-states" && el.type === "STM") {
      for (const t of asList(b.data.transitions)) {
        if (!isObj(t)) continue;
        for (const g of asList(t.guard)) if (meta.typeOfId(g) === "RULE") edge("governed_by", g, {}, via, line);
        for (const ev of asList(t.emits)) edge("emits", ev, { on: t.on }, via, line);
      }
    } else if (b.name === "pds-attributes" && el.type === "ENT") {
      for (const a of asList(b.data.associations)) {
        if (!isObj(a)) continue;
        const { to, ...attrs } = a;
        edge("associates", to, attrs, via, line);
      }
    } else if (b.name === "pds-journey" && el.type === "JRN") {
      for (const st of asList(b.data.stages)) {
        if (!isObj(st)) continue;
        for (const f of asList(st.flows)) edge("spans", f, { stage: st.id }, via, line);
        for (const t of asList(st.touchpoints)) edge("touches", t, { stage: st.id }, via, line);
      }
    }
  }

  // register entries concern their anchor unless they say otherwise
  const concernsTypes = meta.relations.get("concerns").allow[0].from;
  if (concernsTypes.includes(el.type) && el.anchor && !model.edges.some((e) => e.from === el.id && e.rel === "concerns")) {
    edge("concerns", el.anchor, {}, "implicit");
  }

  // prose mentions
  const seen = new Set();
  for (const m of el.rec.mentions) {
    if (m.id === el.id || seen.has(m.id)) continue;
    seen.add(m.id);
    edge("mentions", m.id, {}, "prose", m.line);
  }
}
