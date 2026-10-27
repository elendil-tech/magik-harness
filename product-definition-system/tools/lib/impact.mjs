// Impact analysis: what has to be reviewed when an element changes.
//
// Every relation says how strongly each end is affected when the other changes
// (relation-types.yaml `impacts`), and the spine says the same for the anchor
// chain (`impact.anchor`). The walk is breadth first. A strong edge keeps
// propagating up to `strong_hops` from the change; a weak edge stops at
// `weak_hops`. The strength of a path is its weakest edge, so "strongly
// affected" always means a chain of must-review links.

const RANK = { none: 0, weak: 1, strong: 2 };
const NAME = ["none", "weak", "strong"];

/**
 * One step away from an element: who is affected, how strongly, and why.
 *
 * `container` says whether the element is itself what changed, or was reached only by
 * walking down the anchor chain from it. Then what it contains changes with it, and
 * the anchor's `down` strength applies. An element reached through any other relation
 * is only a neighbour: that a rule governs a feature does not make every risk, metric
 * and screen inside the feature a must-review, so what it contains is at most weak.
 */
function neighbours(model, id, container) {
  const { meta } = model;
  const anchor = meta.impactConfig.anchor || { down: "strong", up: "weak" };
  const out = [];
  for (const e of model.out(id)) out.push({ id: e.to, strength: meta.relations.get(e.rel)?.impacts.to ?? "none", rel: e.rel, dir: "out" });
  for (const e of model.in(id)) out.push({ id: e.from, strength: meta.relations.get(e.rel)?.impacts.from ?? "none", rel: e.rel, dir: "in" });
  const el = model.get(id);
  if (el?.anchor && model.has(el.anchor)) out.push({ id: el.anchor, strength: anchor.up, rel: "anchor", dir: "up" });
  const down = container || RANK[anchor.down] <= RANK.weak ? anchor.down : "weak";
  for (const k of model.children(id)) out.push({ id: k.id, strength: down, rel: "anchor", dir: "down" });
  return out.sort((a, b) => a.id.localeCompare(b.id) || a.rel.localeCompare(b.rel));
}

/**
 * @param {import("./graph.mjs").Model} model
 * @param {string} id the element that changes
 * @param {{strongHops?: number, weakHops?: number}} [opts]
 * @returns {{start: object, reached: object[], owners: object[]}}
 */
export function impactOf(model, id, opts = {}) {
  const { meta } = model;
  const strongHops = opts.strongHops ?? meta.impactConfig.strong_hops;
  const weakHops = opts.weakHops ?? meta.impactConfig.weak_hops;
  const start = model.get(id);
  if (!start) throw new Error(`no element ${id}`);

  const best = new Map([[id, { rank: RANK.strong, hops: 0, path: [] }]]);
  let frontier = [id];
  for (let hop = 1; hop <= Math.max(strongHops, weakHops) && frontier.length; hop++) {
    const next = new Set();
    for (const from of frontier.sort()) {
      const cur = best.get(from);
      const container = cur.path.every((s) => s.rel === "anchor" && s.dir === "down");
      for (const n of neighbours(model, from, container)) {
        const r = RANK[n.strength];
        if (!r) continue;
        const rank = Math.min(cur.rank, r); // a path is as strong as its weakest edge, and goes as far as that strength allows
        if (hop > (rank === RANK.strong ? strongHops : weakHops)) continue;
        if (!model.has(n.id) || model.isRetired(n.id)) continue;
        const seen = best.get(n.id);
        if (seen && seen.rank >= rank) continue;
        best.set(n.id, { rank, hops: hop, path: [...cur.path, { from, to: n.id, rel: n.rel, dir: n.dir }] });
        next.add(n.id);
      }
    }
    frontier = [...next];
  }

  const reached = [...best]
    .filter(([k]) => k !== id)
    .map(([k, v]) => {
      const el = model.get(k);
      return { id: k, type: el.type, title: el.title, strength: NAME[v.rank], hops: v.hops, path: v.path };
    })
    .sort((a, b) => RANK[b.strength] - RANK[a.strength] || a.hops - b.hops || a.type.localeCompare(b.type) || a.id.localeCompare(b.id));

  // the features and capabilities that own what was reached: the blast radius a person can reason about
  const owners = new Map();
  for (const r of [{ id, strength: "strong" }, ...reached]) {
    const el = model.get(r.id);
    const owner = el.type === "FEAT" || el.type === "CAP" ? el : model.ancestors(r.id).find((a) => a.type === "FEAT" || a.type === "CAP");
    if (!owner || owner.id === id) continue;
    const have = owners.get(owner.id);
    if (!have || RANK[r.strength] > RANK[have.strength]) owners.set(owner.id, { id: owner.id, type: owner.type, title: owner.title, strength: r.strength });
  }
  return { start: { id, type: start.type, title: start.title }, reached, owners: [...owners.values()].sort((a, b) => RANK[b.strength] - RANK[a.strength] || a.id.localeCompare(b.id)) };
}

/** A path as one readable line: `FEAT-a —accesses→ ENT-b ←emits— FLW-c`. */
export function describePath(path) {
  if (!path.length) return "";
  const arrow = (s) => (s.rel === "anchor" ? (s.dir === "down" ? " contains " : " is part of ") : s.dir === "out" ? ` —${s.rel}→ ` : ` ←${s.rel}— `);
  let text = path[0].from;
  for (const step of path) text += arrow(step) + step.to;
  return text;
}
