// Shared helpers for views: markdown tables, Mermaid-safe text and ids, and
// small accessors over the analysis.

export const asList = (v) => (v === undefined || v === null ? [] : Array.isArray(v) ? v : [v]);
export const isObj = (v) => v && typeof v === "object" && !Array.isArray(v);

/** A table, or an italic "none" when there are no rows. Cells are escaped. */
export function table(headers, rows) {
  if (!rows.length) return "_None._\n";
  const esc = (c) =>
    String(c ?? "")
      .replace(/\|/g, "\\|")
      .replace(/\r?\n/g, " ");
  return [`| ${headers.join(" | ")} |`, `| ${headers.map(() => "---").join(" | ")} |`, ...rows.map((r) => `| ${r.map(esc).join(" | ")} |`)].join("\n") + "\n";
}

export function wrapWords(text, width) {
  const out = [];
  let line = "";
  for (const w of String(text).split(/\s+/)) {
    if (line && (line + " " + w).length > width) (out.push(line), (line = w));
    else line = line ? line + " " + w : w;
  }
  if (line) out.push(line);
  return out;
}

/** Text safe inside a double-quoted Mermaid label. `wrap` breaks long labels. */
export function q(s, wrap = 0) {
  let t = String(s ?? "").replace(/\s+/g, " ").trim().replace(/&/g, "#amp;").replace(/"/g, "#quot;").replace(/</g, "#lt;").replace(/>/g, "#gt;");
  if (wrap && t.length > wrap) t = wrapWords(t, wrap).join("<br/>");
  return t;
}

/** A Mermaid node id. The prefix keeps user ids (end, class, graph...) from colliding with keywords. */
export const mid = (prefix, id) => prefix + String(id).replace(/[^A-Za-z0-9]/g, "_");

export const MATURITY_STYLE = {
  stub: "fill:#eeeeee,stroke:#9e9e9e,color:#333",
  outlined: "fill:#d6e9ff,stroke:#5b9bd5,color:#123",
  specified: "fill:#d4f0d4,stroke:#5aa65a,color:#123",
  verifiable: "fill:#9fd89f,stroke:#2e7d32,color:#012",
};
export const maturityClassDefs = () => Object.entries(MATURITY_STYLE).map(([k, v]) => `  classDef ${k} ${v};`).join("\n");

/**
 * Helpers bound to one analysis. `up` is what a link needs in front of a record's path to
 * reach it from where the output will live (the views folder, unless the caller says otherwise).
 */
export function bind(a, upFrom) {
  const { model, meta, config } = a;
  const depth = config.viewsDir.split("/").filter(Boolean).length;
  const up = upFrom ?? "../".repeat(depth);
  const V = {
    a,
    model,
    meta,
    get: (id) => model.get(id),
    title: (id) => model.get(id)?.title ?? id,
    /** `ID` title, as a link to the record. */
    ref(id) {
      const el = model.get(id);
      return el ? `[\`${id}\`](${up}${el.path}) ${el.title}` : `\`${id}\` _(missing)_`;
    },
    code: (id) => `\`${id}\``,
    /** Compact links to several records, by id only: `ID`, `ID`. Titles repeat across types, ids never do. */
    refs(ids) {
      return [...new Set(ids)].map((id) => {
        const el = model.get(id);
        return el ? `[\`${id}\`](${up}${el.path})` : `\`${id}\``;
      }).join(", ");
    },
    /** Prose with each [[ID]] turned into a link to its record; an unknown id is left as written. */
    link(text) {
      return String(text).replace(/\[\[([A-Z]{2,5}-[a-z0-9]+(?:-[a-z0-9]+)*)\]\]/g, (whole, id) => {
        const el = model.get(id);
        return el ? `[\`${id}\`](${up}${el.path})` : whole;
      });
    },
    maturity(id) {
      const m = a.maturity.get(id);
      if (!m) return model.has(id) ? "retired" : "";
      return m.declared === m.computed ? m.computed : `${m.computed} (claims ${m.declared})`;
    },
    computed: (id) => a.maturity.get(id)?.computed,
    /** The chain of anchors above an element, product first. */
    path(id) {
      return [...model.ancestors(id)].reverse().map((e) => e.title).join(" › ");
    },
    /** Titles of the targets of an element's outgoing relation. */
    outTitles(id, rel) {
      return [...new Set(model.out(id, rel).map((e) => e.to))].map((t) => V.title(t));
    },
    /** Edges of a relation from the element and what is anchored directly on it. */
    scopeOut(id, rel) {
      return model.scope(id, "children").flatMap((e) => model.out(e.id, rel));
    },
    table,
    q,
    mid,
    asList,
    isObj,
    inScope(rootId) {
      return rootId ? [model.get(rootId), ...model.descendants(rootId)].filter(Boolean) : model.all();
    },
    /** The entities a scope works with: anchored under it, or accessed by anything under it. */
    entitiesIn(rootId) {
      const scope = V.inScope(rootId);
      const ids = new Set(scope.filter((e) => e.type === "ENT").map((e) => e.id));
      for (const el of scope) for (const e of model.out(el.id, "accesses")) if (model.get(e.to)?.type === "ENT") ids.add(e.to);
      return [...ids].map((id) => model.get(id)).filter((e) => e && !model.isRetired(e.id));
    },
    /** The state machines of a scope: anchored under it, or describing an entity it works with. */
    statesIn(rootId) {
      const ids = new Set(V.inScope(rootId).filter((e) => e.type === "STM").map((e) => e.id));
      for (const ent of V.entitiesIn(rootId)) for (const l of model.in(ent.id, "lifecycle_of")) ids.add(l.from);
      return [...ids].map((id) => model.get(id)).filter((e) => e && e.type === "STM" && !model.isRetired(e.id));
    },
    stepsOf(el) {
      const b = el.rec.blocks.find((x) => x.name === "pds-flow" && x.data && !x.error);
      return b ? asList(b.data.steps).filter(isObj) : [];
    },
    blockData(el, name) {
      const b = el.rec.blocks.find((x) => x.name === name && x.data && !x.error);
      return b && isObj(b.data) ? b.data : null;
    },
    field: (el, name) => meta.field(el, name),
  };
  return V;
}
