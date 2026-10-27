// REF: every reference points at something real.
const asList = (v) => (v === undefined || v === null ? [] : Array.isArray(v) ? v : [v]);

function distance(a, b) {
  const m = [...Array(b.length + 1).keys()];
  for (let i = 1; i <= a.length; i++) {
    let prev = m[0];
    m[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const tmp = m[j];
      m[j] = Math.min(m[j] + 1, m[j - 1] + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1));
      prev = tmp;
    }
  }
  return m[b.length];
}

/** The closest real id to a mistyped one, when it is close enough to be a typo. */
export function suggest(model, id) {
  const prefix = id.split("-")[0];
  let best = null;
  for (const other of model.elements.keys()) {
    const same = other.startsWith(prefix + "-");
    const d = distance(id, other);
    if (d <= (same ? 4 : 2) && (!best || d < best.d)) best = { id: other, d };
  }
  return best?.id;
}

const HISTORY = new Set(["supersedes", "concerns", "evidenced_by", "mentions", "resolved_by"]);

export const checks = {
  "REF-target"(ctx) {
    const { model, meta } = ctx;
    const unknown = (id) => {
      const s = suggest(model, id);
      return s ? `did you mean ${s}?` : undefined;
    };
    ctx.each(null, (el) => {
      if (typeof el.anchor === "string" && meta.typeOfId(el.anchor) && !model.has(el.anchor)) {
        ctx.report({ element: el.id, path: el.path, msg: `anchor ${el.anchor} does not exist`, hint: unknown(el.anchor) });
      }
      for (const [name, spec] of Object.entries(meta.spec(el.type).fields)) {
        if ((spec.type !== "ref" && spec.type !== "refs") || spec.edge !== "none") continue;
        for (const id of asList(el.front[name])) {
          if (typeof id === "string" && meta.typeOfId(id) && !model.has(id)) ctx.report({ element: el.id, path: el.path, msg: `${name}: ${id} does not exist`, hint: unknown(id) });
        }
      }
    });
    for (const e of model.edges) {
      if (e.via === "prose" || model.has(e.to)) continue;
      const from = model.get(e.from);
      if (!from) continue;
      const how = e.via === "rel" || e.via === "implicit" ? "" : ` (in ${e.via.replace("block:", "the ").replace("field:", "the field ")}${e.attrs.step ? `, step ${e.attrs.step}` : ""})`;
      ctx.report({ element: e.from, path: from.path, line: e.line, msg: `${e.rel} ${e.to}${how}: no such element`, hint: unknown(e.to) });
    }
  },

  "REF-mention"(ctx) {
    const { model } = ctx;
    for (const e of model.edges) {
      if (e.rel !== "mentions" || model.has(e.to)) continue;
      const from = model.get(e.from);
      if (!from) continue;
      const s = suggest(model, e.to);
      ctx.report({ element: e.from, path: from.path, line: e.line, msg: `[[${e.to}]] names no element`, hint: s ? `did you mean ${s}?` : undefined });
    }
  },

  "REF-anchor-cycle"(ctx) {
    const reported = new Set();
    for (const el of ctx.model.all()) {
      const chain = [el.id];
      let cur = el;
      while (cur && cur.anchor) {
        const next = ctx.model.get(cur.anchor);
        if (!next) break;
        const at = chain.indexOf(next.id);
        if (at >= 0) {
          const loop = chain.slice(at);
          const key = [...loop].sort()[0];
          if (!reported.has(key)) {
            reported.add(key);
            ctx.report({ element: key, path: ctx.model.get(key).path, msg: `anchors form a loop: ${[...loop, next.id].join(" -> ")}` });
          }
          break;
        }
        chain.push(next.id);
        cur = next;
      }
    }
  },

  "REF-retired"(ctx) {
    const { model } = ctx;
    ctx.each(null, (el) => {
      if (model.isRetired(el.id)) return;
      if (el.anchor && model.has(el.anchor) && model.isRetired(el.anchor)) ctx.report({ element: el.id, path: el.path, msg: `is anchored under ${el.anchor}, which is retired`, hint: "re-anchor it or retire it too" });
    });
    for (const e of model.edges) {
      if (HISTORY.has(e.rel) || !model.has(e.to) || !model.has(e.from)) continue;
      if (model.isRetired(e.from) || !model.isRetired(e.to)) continue;
      ctx.report({ element: e.from, path: model.get(e.from).path, line: e.line, msg: `${e.rel} ${e.to}, which is retired` });
    }
  },

  "REF-depth"(ctx) {
    const { model } = ctx;
    ctx.each(["DOM", "CAP"], (el) => {
      const depth = 1 + model.ancestors(el.id).filter((a) => a.type === el.type).length;
      if (depth > 3) ctx.report({ element: el.id, path: el.path, msg: `${el.type} is nested ${depth} levels deep; keep it to three`, hint: "a deeper tree usually means a missing level of abstraction, or a feature mistaken for a capability" });
    });
  },
};
