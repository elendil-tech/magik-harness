// Diagram views: Mermaid generated from the model. Every id and label goes
// through util.mjs so user text cannot break the diagram syntax.
import { q, mid, table, asList, isObj, maturityClassDefs } from "./util.mjs";

const fence = (body) => "```mermaid\n" + body.trimEnd() + "\n```\n";

// ----------------------------------------------------------------------- flow

export function flowMermaid(V, el) {
  const steps = V.stepsOf(el);
  if (!steps.length) return null;
  const ids = new Set(steps.map((s) => s.id));
  const lines = ["flowchart TD"];
  const lanes = new Map();
  for (const s of steps) {
    const k = s.actor || "_";
    if (!lanes.has(k)) lanes.set(k, []);
    lanes.get(k).push(s);
  }
  const node = (s) => {
    const id = mid("s_", s.id);
    const label = q(s.name || s.does || s.id, 30);
    if ("decide" in s) return `${id}{"${label}"}`;
    if ("end" in s) return `${id}(["${label}"])`;
    if (typeof s.call === "string") return `${id}[["${label}<br/>${q(V.title(s.call), 30)}"]]`;
    return `${id}["${label}"]`;
  };
  const laned = lanes.size > 1 || !lanes.has("_");
  for (const [actor, list] of lanes) {
    if (laned) lines.push(`  subgraph ${mid("lane_", actor)} ["${q(actor === "_" ? "No actor named" : V.title(actor))}"]`);
    for (const s of list) lines.push(`    ${node(s)}`);
    if (laned) lines.push("  end");
  }
  const entry = isObj(V.blockData(el, "pds-flow")) ? V.blockData(el, "pds-flow").entry : undefined;
  if (ids.has(entry)) {
    const trigger = V.field(el, "trigger");
    lines.push(`  ${mid("t_", el.id)}(["${q(trigger || "Start", 30)}"])`);
    lines.push(`  ${mid("t_", el.id)} --> ${mid("s_", entry)}`);
  }
  const ends = { success: [], failure: [], abort: [] };
  for (const s of steps) {
    const from = mid("s_", s.id);
    if (typeof s.next === "string" && ids.has(s.next)) lines.push(`  ${from} --> ${mid("s_", s.next)}`);
    for (const d of asList(s.decide)) if (isObj(d) && ids.has(d.next)) lines.push(`  ${from} -->|"${q(d.when, 24)}"| ${mid("s_", d.next)}`);
    if (s.end in ends) ends[s.end].push(from);
  }
  lines.push("  classDef success fill:#d4f4dd,stroke:#2e7d32;", "  classDef failure fill:#f8d7da,stroke:#c62828;", "  classDef abort fill:#fff3cd,stroke:#b8860b;", "  classDef decision fill:#e7f0fe,stroke:#3b6fb6;");
  for (const [k, list] of Object.entries(ends)) if (list.length) lines.push(`  class ${list.join(",")} ${k};`);
  const decisions = steps.filter((s) => "decide" in s).map((s) => mid("s_", s.id));
  if (decisions.length) lines.push(`  class ${decisions.join(",")} decision;`);
  return lines.join("\n");
}

function flowTable(V, el) {
  const rows = V.stepsOf(el).map((s) => [
    `\`${s.id}\``,
    s.actor ? V.title(s.actor) : "",
    s.name || s.does || "",
    s.at ? V.title(s.at) : "",
    asList(s.uses).map((u) => V.title(u)).join(", "),
    isObj(s.accesses) ? Object.entries(s.accesses).map(([e, ops]) => `${V.title(e)} (${asList(ops).join("")})`).join(", ") : "",
    asList(s.emits).map((e) => V.title(e)).join(", "),
    "end" in s ? `end: ${s.end}` : "decide" in s ? `decide: ${asList(s.decide).map((d) => d.when).join(" / ")}` : typeof s.next === "string" ? `→ \`${s.next}\`` : "",
  ]);
  return table(["Step", "Actor", "What happens", "Where", "Uses", "Data", "Emits", "Then"], rows);
}

export function renderFlow(V, target) {
  const root = target ? V.get(target) : V.model.all("PROD")[0];
  const flows = root?.type === "FLW" ? [root] : V.inScope(root?.id).filter((e) => e.type === "FLW" && !V.model.isRetired(e.id));
  if (!flows.length) return `# Flow diagram\n\n_${root ? root.title + " has" : "The product has"} no flow._\n`;
  const out = [];
  for (const f of flows) {
    out.push(`## ${f.title}\n`, `${V.code(f.id)} · ${V.maturity(f.id)}${f.front.summary ? " · " + f.front.summary : ""}\n`);
    const d = flowMermaid(V, f);
    out.push(d ? fence(d) : "_The flow has no structured steps yet._\n", flowTable(V, f));
  }
  return `# Flow diagram${root ? ": " + root.title : ""}\n\n` + out.join("\n");
}

// ---------------------------------------------------------------------- state

export function stateMermaid(V, el) {
  const d = V.blockData(el, "pds-states");
  if (!d) return null;
  const states = asList(d.states).filter(isObj);
  const lines = ["stateDiagram-v2"];
  for (const s of states) lines.push(`  state "${q(s.label || s.id)}" as ${mid("st_", s.id)}`);
  const init = states.find((s) => s.kind === "initial");
  if (init) lines.push(`  [*] --> ${mid("st_", init.id)}`);
  const clean = (t) => String(t ?? "").replace(/[:;{}]/g, " ").replace(/\s+/g, " ").trim();
  for (const t of asList(d.transitions).filter(isObj)) {
    const label = [clean(t.on), t.by && t.by !== "system" ? `by ${clean(V.title(t.by))}` : ""].filter(Boolean).join(" · ");
    lines.push(`  ${mid("st_", t.from)} --> ${mid("st_", t.to)}${label ? ": " + label : ""}`);
  }
  for (const s of states) if (s.kind === "terminal") lines.push(`  ${mid("st_", s.id)} --> [*]`);
  return lines.join("\n");
}

export function renderState(V, target) {
  const root = target ? V.get(target) : V.model.all("PROD")[0];
  const list = root?.type === "STM" ? [root] : V.inScope(root?.id).filter((e) => e.type === "STM" && !V.model.isRetired(e.id));
  if (!list.length) return `# State diagram\n\n_${root ? root.title + " has" : "The product has"} no state machine._\n`;
  const out = [`# State diagram${root ? ": " + root.title : ""}\n`];
  for (const s of list) {
    const d = V.blockData(s, "pds-states");
    out.push(`## ${s.title}\n`, `${V.code(s.id)} · ${V.maturity(s.id)} · describes ${V.outTitles(s.id, "lifecycle_of").join(", ") || "no entity yet"}\n`);
    const m = stateMermaid(V, s);
    out.push(m ? fence(m) : "_No structured states yet._\n");
    if (d) {
      out.push("**States**\n", table(["State", "Kind", "Meaning"], asList(d.states).filter(isObj).map((x) => [`\`${x.id}\``, x.kind || "normal", [x.label, x.note].filter(Boolean).join(": ")])));
      out.push("**Transitions**\n", table(["From", "To", "Caused by", "Who", "Guard", "Emits"], asList(d.transitions).filter(isObj).map((t) => [`\`${t.from}\``, `\`${t.to}\``, t.on || "", t.by ? (t.by === "system" ? "system" : V.title(t.by)) : "", asList(t.guard).map((g) => (V.get(g) ? V.title(g) : g)).join(", "), asList(t.emits).map((e) => V.title(e)).join(", ")])));
    }
  }
  return out.join("\n");
}

// ------------------------------------------------------------------------- er

const entName = (id) => id.replace(/^[A-Z]+-/, "").replace(/[^A-Za-z0-9]+/g, "_").toUpperCase();
const CARD = { one_to_one: "||--||", one_to_many: "||--o{", many_to_one: "}o--||", many_to_many: "}o--o{" };

/** One entity as ER lines: its real attributes, or just its name when none are defined (nothing is invented). */
function entityLines(V, e) {
  const d = V.blockData(e, "pds-attributes");
  const attrs = d ? asList(d.attributes).filter(isObj) : [];
  if (!attrs.length) return [`  ${entName(e.id)}`];
  const lines = [`  ${entName(e.id)} {`];
  for (const a of attrs) {
    const type = String(a.type || "string").split(/[\s(<]/)[0].replace(/[^A-Za-z0-9_]/g, "") || "string";
    const name = String(a.name).replace(/[^A-Za-z0-9_]/g, "_");
    lines.push(`    ${type} ${name}${a.name === "id" ? " PK" : a.unique ? " UK" : ""}`);
  }
  lines.push("  }");
  return lines;
}

export function erMermaid(V, ents) {
  const ids = new Set(ents.map((e) => e.id));
  const lines = ["erDiagram"];
  const extra = new Set(); // entities that are related to but outside the scope shown
  const rels = [];
  for (const e of ents) {
    for (const edge of V.model.out(e.id, "associates")) {
      if (!V.get(edge.to)) continue;
      if (!ids.has(edge.to)) extra.add(edge.to);
      rels.push(`  ${entName(e.id)} ${CARD[edge.attrs.kind] || "}o--o{"} ${entName(edge.to)} : "${q(edge.attrs.label || "relates to")}"`);
    }
  }
  for (const e of ents) lines.push(...entityLines(V, e));
  for (const id of extra) lines.push(...entityLines(V, V.get(id)));
  return [...lines, ...new Set(rels)].join("\n");
}

export function renderEr(V, target) {
  const root = target ? V.get(target) : V.model.all("PROD")[0];
  const ents = V.inScope(root?.id).filter((e) => e.type === "ENT" && !V.model.isRetired(e.id));
  const out = [`# Entity relationships${root ? ": " + root.title : ""}\n`];
  if (!ents.length) return out.join("\n") + "\n_No entities yet._\n";
  out.push(fence(erMermaid(V, ents)));
  for (const e of ents) {
    const d = V.blockData(e, "pds-attributes");
    out.push(`## ${e.title}\n`, `${V.code(e.id)} · ${V.maturity(e.id)}${V.field(e, "pii") ? " · personal data" : ""}${V.field(e, "monetary") ? " · money" : ""}${V.field(e, "classification") ? " · " + V.field(e, "classification") : ""}\n`);
    out.push(d ? table(["Attribute", "Type", "Required", "Unique", "Personal", "Note"], asList(d.attributes).filter(isObj).map((a) => [a.name, a.type || "", a.required ? "yes" : "", a.unique ? "yes" : "", a.pii ? "yes" : "", a.note || ""])) : "_No attributes defined yet._\n");
  }
  return out.join("\n");
}

// -------------------------------------------------------------------- context

export function renderContext(V) {
  const prod = V.model.all("PROD")[0];
  if (!prod) return "# System context\n\n_There is no product record._\n";
  const lines = ["flowchart LR", `  P["${q(prod.title)}"]:::product`];
  const actors = V.model.all("ACT").filter((a) => !V.model.isRetired(a.id));
  const staff = actors.filter((a) => V.field(a, "internal") === true);
  const people = actors.filter((a) => V.field(a, "internal") !== true && V.field(a, "kind") === "human");
  const outsiders = actors.filter((a) => V.field(a, "internal") !== true && V.field(a, "kind") !== "human");
  for (const a of people) lines.push(`  ${mid("a_", a.id)}(["${q(a.title)}"]) --> P`);
  if (staff.length) {
    lines.push('  subgraph staff ["Staff"]');
    for (const a of staff) lines.push(`    ${mid("a_", a.id)}(["${q(a.title)}"])`);
    lines.push("  end");
    for (const a of staff) lines.push(`  ${mid("a_", a.id)} --> P`);
  }
  for (const a of outsiders) lines.push(`  ${mid("a_", a.id)}{{"${q(a.title)}"}} <--> P`);
  const exts = V.model.all("EXT").filter((e) => !V.model.isRetired(e.id));
  for (const x of exts) {
    const ints = V.model.in(x.id, "integrates_with").map((e) => V.get(e.from)).filter(Boolean);
    lines.push(`  ${mid("x_", x.id)}[["${q(x.title)}"]]:::external`);
    if (!ints.length) lines.push(`  P -.- ${mid("x_", x.id)}`);
    for (const i of ints) {
      const dir = V.field(i, "direction");
      const arrow = dir === "inbound" ? `${mid("x_", x.id)} -->|"${q(i.title, 24)}"| P` : dir === "outbound" ? `P -->|"${q(i.title, 24)}"| ${mid("x_", x.id)}` : `P <-->|"${q(i.title, 24)}"| ${mid("x_", x.id)}`;
      lines.push("  " + arrow);
    }
  }
  lines.push("  classDef product fill:#d6e9ff,stroke:#2b6cb0,stroke-width:2px;", "  classDef external fill:#f5f5f5,stroke:#777,stroke-dasharray:4 3;");
  const needers = (x) => [...new Set(V.model.in(x.id, "depends_on").map((e) => {
    const el = V.get(e.from);
    return el && ["FEAT", "CAP"].includes(el.type) ? el.id : V.model.ancestors(e.from).find((p) => ["FEAT", "CAP"].includes(p.type))?.id;
  }).filter(Boolean))];
  const rows = exts.map((x) => [V.ref(x.id), V.field(x, "kind") || "", V.field(x, "criticality") || "", V.model.in(x.id, "integrates_with").map((e) => V.title(e.from)).join(", "), needers(x).map((i) => V.title(i)).join(", ")]);
  const reach = (a) => new Set(V.model.in(a.id, "audience").map((e) => {
    const el = V.get(e.from);
    return el && ["FEAT", "CAP"].includes(el.type) ? el.id : V.model.ancestors(e.from).find((p) => ["FEAT", "CAP"].includes(p.type))?.id;
  }).filter(Boolean));
  const who = actors.map((a) => [V.ref(a.id), V.field(a, "kind") || "", V.field(a, "internal") === true ? "staff" : "customer side", reach(a).size || "**none**"]);
  return `# System context: ${prod.title}\n\n` + fence(lines.join("\n")) + "\n## Who uses it\n\n" + table(["Actor", "Kind", "Side", "Features and capabilities for them"], who) + "\n## External systems\n\n" + table(["System", "Kind", "Criticality", "Integrations", "Needed by"], rows);
}

// -------------------------------------------------------------------- journey

export function renderJourney(V, target) {
  const list = target ? [V.get(target)] : V.model.all("JRN");
  if (!list.length || !list[0]) return "# Journey map\n\n_No journeys yet._\n";
  const out = [];
  for (const j of list) {
    const d = V.blockData(j, "pds-journey");
    const persona = V.field(j, "persona");
    const who = persona ? V.title(persona) : "Person";
    out.push(`# Journey: ${j.title}\n`, `${V.code(j.id)} · ${V.maturity(j.id)}${V.field(j, "outcome") ? " · outcome: " + V.field(j, "outcome") : ""}\n`);
    if (!d) {
      out.push("_No structured stages yet._\n");
      continue;
    }
    const stages = asList(d.stages).filter(isObj);
    const clean = (t) => String(t ?? "").replace(/[:;#]/g, " ").replace(/\s+/g, " ").trim();
    // Mermaid separates a task's actors with commas, so a persona titled "Mara, freelance designer"
    // would become two actors; the diagram uses the name before the comma and the table has the rest.
    const actor = clean(who.split(",")[0]) || "Person";
    const lines = ["journey", `  title ${clean(j.title)}`];
    for (const s of stages) {
      lines.push(`  section ${clean(s.name)}`);
      const acts = asList(s.actions).length ? asList(s.actions) : [s.goal || s.name];
      for (const a of acts) lines.push(`    ${clean(a)}: ${Number.isInteger(s.feeling) ? s.feeling : 3}: ${actor}`);
    }
    out.push(fence(lines.join("\n")));
    out.push(table(["Stage", "Goal", "Touchpoints", "Flows", "Feeling", "Pain", "Opportunity"], stages.map((s) => [s.name, s.goal || "", asList(s.touchpoints).map((t) => V.title(t)).join(", "), asList(s.flows).map((t) => V.title(t)).join(", "), s.feeling ?? "", s.pain || "", s.opportunity || ""])));
  }
  return out.join("\n");
}

// -------------------------------------------------------------------- screens

export function renderScreens(V, target) {
  const root = target ? V.get(target) : V.model.all("PROD")[0];
  const screens = V.inScope(root?.id).filter((e) => e.type === "SCR" && !V.model.isRetired(e.id));
  const out = [`# Screen map${root ? ": " + root.title : ""}\n`];
  if (!screens.length) return out.join("\n") + "\n_No screens yet._\n";
  const ids = new Set(screens.map((s) => s.id));
  const lines = ["flowchart LR"];
  const bySurface = new Map();
  for (const s of screens) {
    const surf = V.model.out(s.id, "on_surface")[0]?.to || "_";
    if (!bySurface.has(surf)) bySurface.set(surf, []);
    bySurface.get(surf).push(s);
  }
  for (const [surf, list] of bySurface) {
    const wrap = surf !== "_";
    if (wrap) lines.push(`  subgraph ${mid("srf_", surf)} ["${q(V.title(surf))}"]`);
    for (const s of list) lines.push(`    ${mid("c_", s.id)}["${q(s.title, 26)}"]:::${V.computed(s.id) || "stub"}`);
    if (wrap) lines.push("  end");
  }
  const seen = new Set();
  for (const s of screens) {
    for (const e of V.model.out(s.id, "navigates_to")) {
      if (!ids.has(e.to)) continue;
      const label = [e.attrs.on, e.attrs.when].filter(Boolean).join(", ");
      lines.push(`  ${mid("c_", s.id)} -->${label ? `|"${q(label, 22)}"|` : ""} ${mid("c_", e.to)}`);
      seen.add(`${s.id}>${e.to}`);
    }
  }
  for (const f of V.inScope(root?.id).filter((e) => e.type === "FLW")) {
    const steps = V.stepsOf(f);
    const byId = new Map(steps.map((s) => [s.id, s]));
    const move = (a, b) => {
      if (a?.at && b?.at && a.at !== b.at && ids.has(a.at) && ids.has(b.at) && !seen.has(`${a.at}>${b.at}`)) {
        seen.add(`${a.at}>${b.at}`);
        lines.push(`  ${mid("c_", a.at)} -.->|"${q(f.title, 20)}"| ${mid("c_", b.at)}`);
      }
    };
    for (const s of steps) {
      if (typeof s.next === "string") move(s, byId.get(s.next));
      for (const d of asList(s.decide)) if (isObj(d)) move(s, byId.get(d.next));
    }
  }
  lines.push(maturityClassDefs());
  out.push(fence(lines.join("\n")), "Solid arrows are navigation stated on the screen; dotted arrows are movement implied by a flow.\n");
  return out.join("\n");
}

// ----------------------------------------------------------------------- deps

export function renderDeps(V, target) {
  const { model } = V;
  const owner = (id) => {
    const el = model.get(id);
    if (!el) return id;
    if (["CAP", "FEAT", "EXT", "INT", "API", "SYS"].includes(el.type)) return id;
    return model.ancestors(id).find((a) => ["FEAT", "CAP"].includes(a.type))?.id ?? id;
  };
  const pairs = new Map();
  for (const e of model.edges) {
    if (e.rel !== "depends_on" || !model.has(e.to) || !model.has(e.from)) continue;
    const from = owner(e.from);
    const to = owner(e.to);
    if (from === to) continue;
    const k = `${from}>${to}`;
    const hard = e.attrs.kind !== "soft";
    if (!pairs.has(k) || hard) pairs.set(k, { from, to, hard });
  }
  let list = [...pairs.values()];
  let focus = null;
  if (target) {
    focus = V.get(target);
    const reach = new Set([target]);
    let grew = true;
    while (grew) {
      grew = false;
      for (const p of list) {
        if (reach.has(p.to) && !reach.has(p.from)) (reach.add(p.from), (grew = true));
        if (reach.has(p.from) && !reach.has(p.to)) (reach.add(p.to), (grew = true));
      }
    }
    list = list.filter((p) => reach.has(p.from) && reach.has(p.to));
  }
  const out = [`# Dependency graph${focus ? ": " + focus.title : ""}\n`];
  if (!list.length) out.push("_No dependencies recorded._\n");
  else {
    const nodes = new Set(list.flatMap((p) => [p.from, p.to]));
    const lines = ["flowchart LR"];
    for (const n of nodes) {
      const el = model.get(n);
      const shape = ["EXT", "INT"].includes(el.type) ? `[["${q(el.title, 24)}"]]` : `["${q(el.title, 24)}"]`;
      lines.push(`  ${mid("n_", n)}${shape}${["EXT", "INT"].includes(el.type) ? "" : ":::" + (V.computed(n) || "stub")}`);
    }
    for (const p of list) lines.push(`  ${mid("n_", p.from)} ${p.hard ? "-->" : "-.->"} ${mid("n_", p.to)}`);
    lines.push(maturityClassDefs());
    out.push(fence(lines.join("\n")), "An arrow points from the element to what it depends on. Dotted arrows are soft dependencies.\n");
  }
  const sup = model.edges.filter((e) => e.rel === "supersedes" && model.has(e.from) && model.has(e.to));
  out.push("## Supersession\n", table(["Newer", "Replaces", "Replaced element is"], sup.map((e) => [V.ref(e.from), V.ref(e.to), model.lifecycleOf(e.to)])));
  return out.join("\n");
}
