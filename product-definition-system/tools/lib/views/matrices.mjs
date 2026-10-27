// Table views: matrices and inventories. They answer "which X relates to
// which Y" at a glance, and list what is missing from the grid.
import { table, asList } from "./util.mjs";

const live = (V, type) => V.model.all(type).filter((e) => !V.model.isRetired(e.id)).sort((a, b) => a.title.localeCompare(b.title));
const names = (V, ids) => [...new Set(ids)].map((i) => V.title(i)).join(", ");
const uniq = (list) => [...new Set(list)];

/** The spine element a piece of the definition belongs to: the element itself if it is a feature or capability, else the nearest one above. */
function owner(V, id) {
  const el = V.get(id);
  if (!el) return id;
  if (el.type === "FEAT" || el.type === "CAP") return id;
  return V.model.ancestors(id).find((a) => a.type === "FEAT" || a.type === "CAP")?.id ?? id;
}

export function renderPermissions(V) {
  const { model } = V;
  const roles = live(V, "ROLE");
  const perms = live(V, "PERM");
  const out = ["# Permission matrix\n"];
  const grant = (r, p) => model.out(r.id, "grants").find((e) => e.to === p.id);
  out.push(table(["Permission", "Scope", "Sensitive", ...roles.map((r) => r.title)], perms.map((p) => [`${V.title(p.id)}`, V.field(p, "scope") || "", V.field(p, "sensitive") ? "yes" : "", ...roles.map((r) => { const g = grant(r, p); return g ? (g.attrs.condition ? `yes: ${g.attrs.condition}` : "yes") : ""; })])));
  out.push("## Who holds which role\n", table(["Actor", "Kind", "Roles"], live(V, "ACT").map((a) => [V.ref(a.id), V.field(a, "kind") || "", names(V, model.out(a.id, "holds").map((e) => e.to))])));
  out.push("## What each permission guards\n", table(["Permission", "Guards", "Granted by"], perms.map((p) => [V.ref(p.id), names(V, model.in(p.id, "requires").map((e) => e.from)), names(V, model.in(p.id, "grants").map((e) => e.from))])));
  const gaps = [];
  for (const p of perms) {
    if (!model.in(p.id, "grants").length) gaps.push(`${V.code(p.id)} is granted by no role.`);
    if (!model.in(p.id, "requires").length) gaps.push(`${V.code(p.id)} guards nothing.`);
  }
  for (const r of roles) if (!model.out(r.id, "grants").length) gaps.push(`${V.code(r.id)} grants no permission.`);
  for (const f of live(V, "FEAT")) {
    const kind = V.field(f, "kind");
    if (!["user_facing", "admin"].includes(kind) || model.facets(f.id).effective.public) continue;
    if (!V.scopeOut(f.id, "requires").length) gaps.push(`${V.code(f.id)} states no permission needed to use it.`);
  }
  out.push("## Gaps\n", gaps.length ? gaps.map((g) => `- ${g}`).join("\n") + "\n" : "_None._\n");
  return out.join("\n");
}

export function renderCrud(V) {
  const { model } = V;
  const ents = live(V, "ENT");
  const out = ["# CRUD matrix\n"];
  if (!ents.length) return out.join("\n") + "\n_No entities yet._\n";
  const cell = new Map(); // ent -> owner -> Set(ops)
  for (const e of model.edges) {
    if (e.rel !== "accesses" || !model.has(e.to) || !model.has(e.from)) continue;
    const o = owner(V, e.from);
    if (!cell.has(e.to)) cell.set(e.to, new Map());
    const m = cell.get(e.to);
    if (!m.has(o)) m.set(o, new Set());
    for (const op of asList(e.attrs.ops)) m.get(o).add(op);
  }
  const cols = uniq([...cell.values()].flatMap((m) => [...m.keys()])).sort();
  const letter = { create: "C", read: "R", update: "U", delete: "D" };
  const fmt = (set) => ["create", "read", "update", "delete"].filter((o) => set?.has(o)).map((o) => letter[o]).join("");
  if (cols.length && cols.length <= 12) {
    out.push(table(["Entity", ...cols.map((c) => V.title(c))], ents.map((en) => [V.ref(en.id), ...cols.map((c) => fmt(cell.get(en.id)?.get(c)))])));
  }
  const by = (en, op) => names(V, [...(cell.get(en.id) || new Map())].filter(([, set]) => set.has(op)).map(([o]) => o));
  out.push("## By entity\n", table(["Entity", "Created by", "Read by", "Updated by", "Deleted by"], ents.map((en) => [V.ref(en.id), by(en, "create"), by(en, "read"), by(en, "update"), by(en, "delete")])));
  const gaps = [];
  for (const en of ents) {
    if (!by(en, "create")) gaps.push(`${V.code(en.id)} is never created by anything.`);
    if (!by(en, "delete") && V.field(en, "retention")) gaps.push(`${V.code(en.id)} states a retention (“${V.field(en, "retention")}”) but nothing deletes or archives it.`);
  }
  out.push("## Gaps\n", gaps.length ? gaps.map((g) => `- ${g}`).join("\n") + "\n" : "_None._\n");
  return out.join("\n");
}

export function renderEntitlements(V) {
  const { model } = V;
  const plans = live(V, "PLAN");
  const entls = live(V, "ENTL");
  const out = ["# Entitlement matrix\n"];
  const price = (p) => {
    const x = p.front.price;
    if (!x) return V.field(p, "visibility") === "custom" ? "custom" : "";
    return x.model === "free" ? "free" : [x.amount, x.currency, x.interval && "/ " + x.interval].filter((v) => v !== undefined && v !== "").join(" ");
  };
  const value = (p, en) => {
    const g = model.out(p.id, "grants").find((e) => e.to === en.id);
    if (!g) return "";
    return g.attrs.value === true ? "yes" : g.attrs.value === false ? "no" : String(g.attrs.value);
  };
  out.push(table(["Entitlement", "Kind", "Unit", "Enforcement", ...plans.map((p) => `${p.title} (${price(p) || "no price"})`), "Gates"], entls.map((en) => [V.ref(en.id), V.field(en, "kind") || "", V.field(en, "unit") || "", V.field(en, "enforcement") || "", ...plans.map((p) => value(p, en)), names(V, model.in(en.id, "gated_by").map((e) => e.from))])));
  const gaps = [];
  for (const en of entls) {
    if (!model.in(en.id, "gated_by").length) gaps.push(`${V.code(en.id)} gates nothing.`);
    if (!model.in(en.id, "grants").length) gaps.push(`${V.code(en.id)} is granted by no plan.`);
  }
  out.push("## Gaps\n", gaps.length ? gaps.map((g) => `- ${g}`).join("\n") + "\n" : "_None._\n");
  return out.join("\n");
}

export function renderEvents(V) {
  const { model } = V;
  const evts = live(V, "EVT");
  const out = ["# Event catalogue\n"];
  out.push(
    table(
      ["Event", "Kind", "Emitted by", "Consumed by", "Counted by metrics", "Personal data", "Delivery"],
      evts.map((ev) => [V.ref(ev.id), V.field(ev, "kind") || "", names(V, model.in(ev.id, "emits").map((e) => owner(V, e.from))), names(V, model.in(ev.id, "consumes").map((e) => owner(V, e.from))), names(V, model.in(ev.id, "sourced_from").map((e) => e.from)), V.field(ev, "pii") ? "yes" : "", V.field(ev, "delivery") || ""]),
    ),
  );
  const gaps = [];
  for (const ev of evts) {
    if (!model.in(ev.id, "emits").length) gaps.push(`${V.code(ev.id)} is emitted by nothing.`);
    if (!model.in(ev.id, "consumes").length && !model.in(ev.id, "sourced_from").length) gaps.push(`${V.code(ev.id)} is used by nothing.`);
  }
  out.push("## Gaps\n", gaps.length ? gaps.map((g) => `- ${g}`).join("\n") + "\n" : "_None._\n");
  return out.join("\n");
}

export function renderTouchpoints(V) {
  const { model } = V;
  const types = ["SRF", "SCR", "MSG", "API", "EXT"];
  const rows = [];
  for (const t of types) {
    for (const el of live(V, t)) {
      const touchers = model.in(el.id, "touches");
      const flows = touchers.map((e) => e.from).filter((id) => V.get(id)?.type === "FLW");
      const journeys = touchers.filter((e) => V.get(e.from)?.type === "JRN");
      const actors = [
        ...flows.flatMap((f) => model.out(f, "audience").map((e) => e.to)),
        ...(t === "MSG" || t === "SRF" || t === "API" ? model.out(el.id, "audience").map((e) => e.to) : []),
      ];
      const surface = t === "SCR" || t === "MSG" ? names(V, model.out(el.id, "on_surface").map((e) => e.to)) : "";
      rows.push([t, V.ref(el.id), surface, names(V, flows), names(V, actors), journeys.map((e) => `${V.title(e.from)}${e.attrs.stage ? " / " + e.attrs.stage : ""}`).join(", "), V.maturity(el.id)]);
    }
  }
  return "# Touchpoint inventory\n\nEvery place the product meets a person or another system. A touchpoint no flow uses is either undocumented or not needed.\n\n" + table(["Type", "Touchpoint", "Surface", "Used by flows", "Actors", "Journey stages", "Maturity"], rows);
}
