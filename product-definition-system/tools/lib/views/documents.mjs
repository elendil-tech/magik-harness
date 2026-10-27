// Document views: the product map, element cards, the assembled feature
// specification, traceability, registers, release scope and the coverage report.
import { table, asList, isObj, q, mid, maturityClassDefs } from "./util.mjs";
import { flowMermaid } from "./diagrams.mjs";
import { stateMermaid, erMermaid } from "./diagrams.mjs";
import { applicableProbes, dispositionOf } from "../coverage.mjs";
import { approvalUnits, approvalHash, covered } from "../approval.mjs";

const fence = (body) => "```mermaid\n" + body.trimEnd() + "\n```\n";
const live = (V, type) => V.model.all(type).filter((e) => !V.model.isRetired(e.id)).sort((a, b) => a.title.localeCompare(b.title));
const names = (V, ids) => [...new Set(ids)].map((i) => V.title(i)).join(", ");
const demote = (md) => md.replace(/^(#{1,5}) /gm, "$1# ");

/** Body text of a named section, with its [[ID]] references as links, or "" when absent. */
function section(V, el, heading) {
  const s = el.rec.sections.find((x) => x.heading.toLowerCase() === heading.toLowerCase());
  return s && s.prose.trim() ? V.link(s.prose.trim()) : "";
}

function counts(V, id) {
  const spine = new Set(V.meta.spine.map((s) => s.type));
  const c = {};
  for (const k of V.model.children(id)) if (!spine.has(k.type) && !V.model.isRetired(k.id)) c[k.type] = (c[k.type] || 0) + 1;
  return Object.entries(c).map(([t, n]) => `${n} ${V.meta.spec(t).name.toLowerCase()}${n > 1 ? "s" : ""}`).join(", ");
}

// ---------------------------------------------------------------- product map


/** An element's approval in words: who, when, what it covers, and whether it still holds. */
function approvalText(V, el) {
  const ap = el.front.approval;
  if (!ap || ap.state !== "approved") return ap?.state || "draft";
  const { model, a } = V;
  const stale = ap.hash !== approvalHash(model, a.config, el);
  const beneath = covered(model, a.config, el).length - 1;
  return `${stale ? "stale: edited since it was approved by " : "approved by "}${ap.by ?? "nobody named"}${ap.at ? ` on ${ap.at}` : ""}${beneath ? `, covering the ${beneath} elements beneath it` : ""}`;
}

export function renderProductMap(V, target) {
  const { model, meta } = V;
  const root = target ? V.get(target) : model.all("PROD")[0];
  if (!root) return "# Product map\n\n_There is no product record._\n";
  const spineTypes = new Set(meta.spine.map((s) => s.type));
  const kids = (id) => model.children(id).filter((k) => spineTypes.has(k.type) && !model.isRetired(k.id));
  const outline = [];
  const walk = (el, depth) => {
    const extra = counts(V, el.id);
    outline.push(`${"  ".repeat(depth)}- ${V.ref(el.id)} · **${V.maturity(el.id)}**${el.front.tier ? ` · tier ${el.front.tier}` : ""}${extra ? ` · ${extra}` : ""}`);
    for (const k of kids(el.id)) walk(k, depth + 1);
  };
  walk(root, 0);
  const all = [root, ...model.descendants(root.id).filter((e) => spineTypes.has(e.type) && !model.isRetired(e.id))];
  const limited = all.length > 120;
  const shown = limited ? all.filter((e) => e.type !== "FEAT") : all;
  // left to right: a tree grows downward by the number of leaves, which a page has room for, instead of sideways, which it does not
  const lines = ["flowchart LR"];
  for (const e of shown) lines.push(`  ${mid("n_", e.id)}["${q(e.title, 24)}<br/>${e.type} · ${V.computed(e.id) || "retired"}"]:::${V.computed(e.id) || "stub"}`);
  const ids = new Set(shown.map((e) => e.id));
  for (const e of shown) if (e.anchor && ids.has(e.anchor) && e.id !== root.id) lines.push(`  ${mid("n_", e.anchor)} --> ${mid("n_", e.id)}`);
  lines.push(maturityClassDefs());
  const levels = meta.spine.map((s) => `${s.type} = zoom ${s.zoom}`).join(", ") + `, everything anchored on a feature = zoom ${meta.model.satellite_zoom}`;
  return [
    `# Product map: ${root.title}\n`,
    `${levels}. The colour is the maturity the definition supports, not the one claimed.\n`,
    fence(lines.join("\n")),
    limited ? "_The diagram stops at capabilities because the product has more than 120 spine elements; the outline below is complete._\n" : "",
    "## Outline\n",
    outline.join("\n") + "\n",
  ].join("\n");
}

// ----------------------------------------------------------------------- card

export function renderCard(V, target) {
  const { model, meta, a } = V;
  const el = V.get(target);
  const m = a.maturity.get(el.id);
  const out = [`# ${el.title}\n`, `${V.code(el.id)} · ${meta.spec(el.type).name}${el.front.summary ? "\n\n> " + el.front.summary : ""}\n`];
  const rows = [["Where", V.path(el.id) || "(root)"], ["Maturity", m ? `${m.declared} claimed · ${m.computed} supported` : "retired"], ["Tier", `${model.tierOf(el.id)}${el.front.tier ? "" : " (inherited)"}`], ["Approval", approvalText(V, el)], ["Lifecycle", el.front.lifecycle || "active"], ["Origin", V.field(el, "origin") || "human"], ["Owner", el.front.owner || ""], ["Reviewed", el.front.reviewed || ""], ["File", `\`${el.path}\``]];
  out.push(table(["", ""], rows.filter(([, v]) => v)));

  const skip = new Set(["id", "title", "summary", "anchor", "maturity", "tier", "approval", "lifecycle", "origin", "owner", "reviewed", "rel", "links", "tags", "aliases"]);
  const fields = Object.entries(el.front).filter(([k]) => !skip.has(k));
  if (fields.length) out.push("## Fields\n", table(["Field", "Value"], fields.map(([k, v]) => [k, typeof v === "object" ? JSON.stringify(v) : v])));

  const outgoing = [...new Set(model.out(el.id).filter((e) => e.rel !== "mentions").map((e) => e.rel))];
  const incoming = [...new Set(model.in(el.id).filter((e) => e.rel !== "mentions").map((e) => e.rel))];
  const rel = [];
  for (const r of outgoing) rel.push([r.replace(/_/g, " "), [...new Set(model.out(el.id, r).map((e) => e.to))].map((t) => V.ref(t)).join("<br>")]);
  for (const r of incoming) rel.push([meta.relations.get(r).inverse.replace(/_/g, " "), [...new Set(model.in(el.id, r).map((e) => e.from))].map((t) => V.ref(t)).join("<br>")]);
  const mentionedBy = [...new Set(model.in(el.id, "mentions").map((e) => e.from))];
  if (mentionedBy.length) rel.push(["mentioned by", mentionedBy.map((t) => V.ref(t)).join("<br>")]);
  out.push("## Relations\n", table(["Relation", "Elements"], rel));

  const kids = model.children(el.id).filter((k) => !model.isRetired(k.id));
  if (kids.length) {
    const byType = new Map();
    for (const k of kids) (byType.get(k.type) || byType.set(k.type, []).get(k.type)).push(k);
    out.push("## Anchored here\n", table(["Type", "Elements"], [...byType].map(([t, list]) => [meta.spec(t).name, list.map((k) => `${V.ref(k.id)} (${V.computed(k.id)})`).join("<br>")])));
  }

  if (m) {
    const failing = m.results.filter((r) => !r.pass);
    const next = failing.filter((r) => r.sev === "error" && r.from === m.next);
    const later = failing.filter((r) => r.sev === "error" && r.from !== m.next);
    out.push("## What is missing\n");
    if (m.caps.length) out.push(...m.caps.map((c) => `- **${c.gate}**: ${c.gate === "GATE-blocking-question" ? "blocked by " + c.by.join(", ") : "a skeleton nobody has confirmed"}`), "");
    out.push(next.length ? `To reach **${m.next}**:\n\n${next.map((r) => `- ${r.msg} (\`${r.rule}\`): ${r.ask}`).join("\n")}\n` : m.next ? "_Nothing blocks the next rung._\n" : "_At the top rung._\n");
    if (later.length) out.push(`Later: ${later.length} further requirement${later.length > 1 ? "s" : ""} at higher rungs.\n`);
  }
  const mine = a.findings.filter((f) => f.element === el.id);
  if (mine.length) out.push("## Findings\n", mine.map((f) => `- ${f.sev}: \`${f.id}\` ${f.msg}`).join("\n") + "\n");
  const body = el.rec.sections.filter((s) => s.prose.trim());
  if (body.length) out.push("## Content\n", body.map((s) => (s.heading ? `### ${s.heading}\n\n` : "") + V.link(s.prose.trim())).join("\n\n") + "\n");
  return out.join("\n");
}

// ----------------------------------------------------------------------- spec

function specFeature(V, f) {
  const { model, meta, a } = V;
  const kids = model.children(f.id).filter((k) => !model.isRetired(k.id));
  const of = (t) => kids.filter((k) => k.type === t);
  const m = a.maturity.get(f.id);
  const out = [`# Feature specification: ${f.title}\n`];
  if (f.front.summary) out.push(`> ${f.front.summary}\n`);
  out.push(table(["", ""], [["Id", V.code(f.id)], ["Belongs to", V.path(f.id)], ["Kind", V.field(f, "kind") || ""], ["Tier", model.tierOf(f.id)], ["Owner", f.front.owner || ""], ["Maturity", m ? `${m.computed} supported · ${m.declared} claimed` : ""], ["Approval", approvalText(V, f)], ["Reviewed", f.front.reviewed || ""]].filter(([, v]) => v !== "")));

  const serves = [...new Set([...model.out(f.id, "serves"), ...model.out(f.anchor, "serves")].map((e) => e.to))];
  out.push("## 1. Purpose and value\n", section(V, f, "Purpose and value") || "_Not written yet._", "");
  out.push(`**Serves:** ${serves.length ? serves.map((s) => V.ref(s)).join("; ") : "_nothing recorded_"}\n`);
  const aud = [...new Set([...model.out(f.id, "audience"), ...kids.flatMap((k) => model.out(k.id, "audience"))].map((e) => e.to))];
  out.push(`**For:** ${aud.length ? aud.map((s) => V.title(s)).join(", ") : "_not stated_"}\n`);

  out.push("## 2. Entry and access\n", section(V, f, "Entry conditions") || "_Entry conditions not written yet._", "");
  const reqs = [...new Set(V.scopeOut(f.id, "requires").map((e) => e.to))];
  out.push("**Permissions needed**\n", table(["Permission", "Roles that hold it"], reqs.map((p) => [V.ref(p), names(V, model.in(p, "grants").map((e) => e.from))])));
  const gates = [...new Set(V.scopeOut(f.id, "gated_by").map((e) => e.to))];
  out.push("**Plan gating**\n", gates.length ? table(["Entitlement", "Kind", "Plans and values"], gates.map((g) => [V.ref(g), V.field(V.get(g), "kind") || "", model.in(g, "grants").map((e) => `${V.title(e.from)}: ${e.attrs.value}`).join("; ")])) : "_Not gated by plan._\n");

  out.push("## 3. Flows\n");
  const flows = of("FLW");
  if (!flows.length) out.push("_No flow yet._\n");
  for (const fl of flows) {
    const d = flowMermaid(V, fl);
    out.push(`### ${fl.title}\n`, fl.front.summary ? fl.front.summary + "\n" : "", d ? fence(d) : "_No structured steps yet._\n", section(V, fl, "Notes"), "");
  }

  out.push("## 4. Screens and messages\n");
  const scr = of("SCR");
  out.push("**Screens**\n", table(["Screen", "Kind", "Surface", "States"], scr.map((s) => [V.ref(s.id), V.field(s, "kind") || "", names(V, model.out(s.id, "on_surface").map((e) => e.to)), asList(s.front.states).join(", ")])));
  out.push("**Messages**\n", table(["Message", "Channel", "Class", "Sent when", "To"], of("MSG").map((s) => [V.ref(s.id), V.field(s, "channel") || "", V.field(s, "class") || "", V.field(s, "trigger_event") ? V.title(V.field(s, "trigger_event")) : "", V.field(s, "audience") ? V.title(V.field(s, "audience")) : ""])));

  out.push("## 5. Business rules\n");
  const rules = [...of("RULE"), ...new Set(V.scopeOut(f.id, "governed_by").map((e) => e.to))].map((r) => (typeof r === "string" ? V.get(r) : r)).filter(Boolean);
  if (!rules.length) out.push("_No rules yet._\n");
  for (const r of [...new Map(rules.map((x) => [x.id, x])).values()]) {
    out.push(`### ${r.title}\n`, `${V.code(r.id)}${r.anchor !== f.id ? ` · shared, lives under ${V.title(r.anchor)}` : ""}\n`, `${V.field(r, "statement") || "_No statement yet._"}\n`);
    const ex = asList(r.front.examples).filter(isObj);
    if (ex.length) out.push(table(["Case", "Given", "Then"], ex.map((x) => [x.case, x.given, x.then])));
  }

  out.push("## 6. State\n");
  const stms = new Map();
  for (const s of of("STM")) stms.set(s.id, s);
  for (const e of V.scopeOut(f.id, "accesses")) for (const l of model.in(e.to, "lifecycle_of")) if (model.get(l.from)) stms.set(l.from, model.get(l.from));
  if (!stms.size) out.push("_No state machine involved._\n");
  for (const s of stms.values()) {
    const d = stateMermaid(V, s);
    out.push(`### ${s.title}\n`, d ? fence(d) : "_No structured states yet._\n");
  }

  out.push("## 7. Data\n");
  const acc = new Map();
  for (const e of V.scopeOut(f.id, "accesses")) {
    if (!acc.has(e.to)) acc.set(e.to, new Set());
    for (const op of asList(e.attrs.ops)) acc.get(e.to).add(op);
  }
  out.push(table(["Entity", "Operations", "Personal data", "Classification", "Retention"], [...acc].map(([id, ops]) => [V.ref(id), [...ops].join(", "), V.get(id) && V.field(V.get(id), "pii") ? "yes" : "", V.get(id) ? V.field(V.get(id), "classification") || "" : "", V.get(id) ? V.field(V.get(id), "retention") || "" : ""])));
  const ents = [...acc.keys()].map((i) => V.get(i)).filter(Boolean);
  if (ents.length) out.push(fence(erMermaid(V, ents)));

  out.push("## 8. Events and integrations\n");
  const events = new Map(); // "emits|EVT-x" -> who emits or consumes it, within this feature
  for (const dir of ["emits", "consumes"]) {
    for (const e of V.scopeOut(f.id, dir)) {
      const key = `${dir}|${e.to}`;
      events.set(key, [...(events.get(key) || []), e.from]);
    }
  }
  out.push(table(["Direction", "Event", "By"], [...events].map(([key, by]) => { const [dir, ev] = key.split("|"); return [dir, V.ref(ev), V.refs(by)]; })));
  const deps = [...new Set(V.scopeOut(f.id, "depends_on").map((e) => e.to))];
  out.push("**Depends on**\n", table(["Element", "Type"], deps.map((d) => [V.ref(d), V.get(d)?.type || ""])));
  const exposed = [...new Set(V.scopeOut(f.id, "exposed_via").map((e) => e.to))];
  if (exposed.length) out.push("**Exposed through**\n", table(["API", "Audience"], exposed.map((x) => [V.ref(x), V.get(x) ? V.field(V.get(x), "audience") || "" : ""])));

  out.push("## 9. Requirements\n", table(["Requirement", "Kind", "Priority", "Verification", "Statement"], of("REQ").map((r) => [V.refs([r.id]), V.field(r, "kind") === "quality" ? `quality: ${V.field(r, "attribute") || ""}` : V.field(r, "kind") || "", V.field(r, "priority") || "", V.field(r, "verification") || "", V.field(r, "statement") || ""])));

  out.push("## 10. Concerns\n");
  const probes = applicableProbes(model, f);
  out.push(table(["Probe", "Disposition", "Detail"], probes.map((p) => { const d = dispositionOf(f, p.id); return [p.title, d ? d.kind : "**not answered**", d ? (d.kind === "addressed" ? V.refs(d.by) : d.reason + (d.until ? ` (until ${V.model.has(String(d.until)) ? V.refs([String(d.until)]) : d.until})` : "")) : p.ask]; })));

  out.push("## 11. Verification\n");
  const tests = [...new Set([...of("TST"), ...[f, ...kids].flatMap((k) => model.in(k.id, "verifies").map((e) => V.get(e.from)))].filter(Boolean))];
  out.push(table(["Test", "Kind", "Level", "Automation", "Result", "Verifies"], tests.map((t) => [V.ref(t.id), V.field(t, "kind") || "", V.field(t, "level") || "", V.field(t, "automation") || "", V.field(t, "result") || "", V.refs(model.out(t.id, "verifies").map((e) => e.to))])));

  out.push("## 12. Decisions, assumptions, questions and risks\n");
  // Found from the feature's own incoming edges. Scanning every element for each feature is
  // quadratic in the size of the definition, and this runs once per feature.
  const concerning = new Map();
  for (const target of [f, ...kids]) {
    for (const edge of model.in(target.id, "concerns")) {
      const x = model.get(edge.from);
      if (x && ["DEC", "ASM", "QST", "RISK"].includes(x.type) && !model.isRetired(x.id)) concerning.set(x.id, x);
    }
  }
  const reg = [...concerning.values()].sort((a, b) => a.title.localeCompare(b.title) || a.seq - b.seq);
  out.push(table(["Type", "Entry", "Status"], reg.map((r) => [r.type, V.ref(r.id), V.field(r, "status") || (r.type === "RISK" ? "" : "")])));

  out.push("## 13. Release and maintenance\n", section(V, f, "Release and maintenance") || "_Not written yet._", "");
  const rls = model.in(f.id, "includes").map((e) => e.from);
  out.push(`**Planned in:** ${rls.length ? rls.map((r) => V.ref(r)).join("; ") : "_no release_"}\n`);

  if (m) {
    const next = m.results.filter((r) => !r.pass && r.sev === "error" && r.from === m.next);
    out.push("## Completeness\n", m.next ? (next.length ? `To reach **${m.next}**, still missing:\n\n${next.map((r) => `- ${r.msg}`).join("\n")}\n` : `Nothing blocks **${m.next}**.\n`) : "At the top rung.\n");
  }
  return out.join("\n");
}

export function renderSpec(V, target) {
  const el = V.get(target);
  if (el.type === "FEAT") return specFeature(V, el);
  if (el.type === "CAP") {
    const feats = V.model.children(el.id, "FEAT").filter((f) => !V.model.isRetired(f.id));
    const out = [`# Capability specification: ${el.title}\n`, el.front.summary ? `> ${el.front.summary}\n` : "", "## Purpose and outcome\n", section(V, el, "Purpose and outcome") || "_Not written yet._", "", "## Features\n", table(["Feature", "Kind", "Tier", "Maturity"], feats.map((f) => [V.ref(f.id), V.field(f, "kind") || "", V.model.tierOf(f.id), V.maturity(f.id)]))];
    for (const f of feats) out.push(demote(specFeature(V, f)));
    return out.join("\n");
  }
  return `# Specification\n\n_${el.id} is a ${el.type}. A specification is assembled for a feature or a capability. Use the product map or the element card for this one._\n`;
}

// ---------------------------------------------------------------------- trace

export function renderTrace(V, target) {
  const { model } = V;
  const scope = V.inScope(target);
  const inScope = new Set(scope.map((e) => e.id));
  const has = (t) => (e) => e.type === t && !model.isRetired(e.id) && inScope.has(e.id);
  const out = ["# Traceability\n", "From the reason a thing exists, down to the proof that it works.\n", "## Objectives to what serves them\n"];
  const rows = [];
  for (const o of live(V, "OBJ").filter((e) => inScope.has(e.id))) {
    const servers = [...new Set(model.in(o.id, "serves").map((e) => e.from))].filter((i) => model.has(i));
    const measured = names(V, model.out(o.id, "measured_by").map((e) => e.to)) || "**no metric**";
    if (!servers.length) rows.push([V.ref(o.id), measured, "_nothing serves it_", "", "", "", ""]);
    for (const s of servers) {
      const sub = [model.get(s), ...model.descendants(s)];
      const n = (t) => sub.filter((e) => e.type === t && !model.isRetired(e.id)).length;
      const tested = sub.filter((e) => ["REQ", "RULE", "FLW"].includes(e.type) && model.in(e.id, "verifies").length).length;
      const total = n("REQ") + n("RULE") + n("FLW");
      rows.push([V.ref(o.id), measured, V.ref(s), n("FEAT") || "", `${n("REQ")} req · ${n("RULE")} rules · ${n("FLW")} flows`, total ? `${tested}/${total} verified` : "", V.maturity(s)]);
    }
  }
  out.push(table(["Objective", "Measured by", "Served by", "Features", "Defined", "Verified", "Maturity"], rows));

  out.push("## Requirements to their proof\n");
  out.push(table(["Requirement", "Under", "Comes from", "Satisfies", "Verified by", "Result"], scope.filter(has("REQ")).map((r) => {
    const tests = model.in(r.id, "verifies").map((e) => e.from);
    return [V.ref(r.id), V.title(r.anchor), names(V, model.out(r.id, "derives_from").map((e) => e.to)), names(V, model.out(r.id, "satisfies").map((e) => e.to)), tests.length ? names(V, tests) : V.field(r, "verification") === "test" ? "**no test**" : V.field(r, "verification"), tests.map((t) => V.field(V.get(t), "result")).join(", ")];
  })));

  out.push("## Evidence behind decisions and assumptions\n");
  out.push(table(["Element", "Evidenced by"], scope.filter((e) => !model.isRetired(e.id) && model.out(e.id, "evidenced_by").length).map((e) => [V.ref(e.id), names(V, model.out(e.id, "evidenced_by").map((x) => x.to))])));

  const orphans = [];
  for (const o of scope.filter(has("OBJ"))) if (!model.in(o.id, "serves").length) orphans.push(`Objective ${V.code(o.id)} is served by nothing.`);
  for (const c of scope.filter(has("CAP"))) if (model.tierOf(c.id) <= 2 && !model.scope(c.id, "descendants").some((e) => model.out(e.id, "serves").length)) orphans.push(`Capability ${V.code(c.id)} traces to no objective or opportunity.`);
  for (const r of scope.filter(has("REQ"))) if (V.field(r, "verification") === "test" && !model.in(r.id, "verifies").length) orphans.push(`Requirement ${V.code(r.id)} has no test.`);
  for (const o of scope.filter(has("OBL"))) if (!model.in(o.id, "satisfies").length) orphans.push(`Obligation ${V.code(o.id)} is met by nothing.`);
  for (const t of scope.filter(has("TST"))) if (!model.out(t.id, "verifies").length) orphans.push(`Test ${V.code(t.id)} verifies nothing.`);
  out.push("## Breaks in the chain\n", orphans.length ? orphans.map((o) => `- ${o}`).join("\n") + "\n" : "_None._\n");
  return out.join("\n");
}

// ------------------------------------------------------------------ registers

export function renderRegisters(V, target) {
  const { model } = V;
  const scope = new Set(V.inScope(target).map((e) => e.id));
  const concerns = (e) => model.out(e.id, "concerns").map((c) => c.to);
  const inside = (e) => !target || scope.has(e.id) || concerns(e).some((c) => scope.has(c));
  const score = { low: 1, medium: 2, high: 3, critical: 4 };
  const out = [`# Registers${target ? ": " + V.title(target) : ""}\n`];
  const q_ = live(V, "QST").filter(inside).sort((a, b) => (V.field(b, "blocking") ? 1 : 0) - (V.field(a, "blocking") ? 1 : 0));
  out.push("## Questions\n", table(["Question", "Status", "Blocking", "Concerns", "Asked of", "Due", "Resolved by"], q_.map((e) => [V.ref(e.id), V.field(e, "status") || "", V.field(e, "blocking") ? "**yes**" : "", names(V, concerns(e)), V.field(e, "asked_of") || "", e.front.due || "", names(V, model.out(e.id, "resolved_by").map((x) => x.to))])));
  const asm = live(V, "ASM").filter(inside);
  out.push("## Assumptions\n", table(["Assumption", "Status", "Confidence", "If wrong", "Validate by", "Before"], asm.map((e) => [V.ref(e.id), V.field(e, "status") || "", V.field(e, "confidence") || "", V.field(e, "if_wrong") || "", V.field(e, "validate_by") || "", e.front.validate_before || ""])));
  const risk = live(V, "RISK").filter(inside).sort((a, b) => score[V.field(b, "impact")] * score[V.field(b, "likelihood")] - score[V.field(a, "impact")] * score[V.field(a, "likelihood")] || 0);
  out.push("## Risks\n", table(["Risk", "Likelihood", "Impact", "Status", "Response", "Owner", "Mitigated by"], risk.map((e) => [V.ref(e.id), V.field(e, "likelihood") || "", V.field(e, "impact") || "", V.field(e, "status") || "", V.field(e, "response") || "", V.field(e, "owner") || "", names(V, model.in(e.id, "mitigates").map((x) => x.from))])));
  const dec = live(V, "DEC").filter(inside).sort((a, b) => String(V.field(b, "date")).localeCompare(String(V.field(a, "date"))));
  out.push("## Decisions\n", table(["Decision", "Status", "Date", "Deciders", "Concerns"], dec.map((e) => [V.ref(e.id), V.field(e, "status") || "", V.field(e, "date") || "", asList(e.front.deciders).join(", "), names(V, concerns(e))])));
  return out.join("\n");
}

export function renderGlossary(V, target) {
  const scope = new Set(V.inScope(target).map((e) => e.id));
  const terms = live(V, "TERM").filter((t) => !target || scope.has(t.id));
  return "# Glossary\n\n" + table(["Term", "Definition", "Also called", "Do not say", "Applies in"], terms.map((t) => [`**${t.title}**`, V.field(t, "definition") || "", asList(t.front.aliases).join(", "), asList(t.front.avoid).join(", "), V.title(t.anchor)]));
}

export function renderObligations(V) {
  const { model } = V;
  return "# Obligation map\n\nEvery duty the product has to meet, what meets it and what proves it.\n\n" + table(["Obligation", "Source", "Reference", "Applies when", "Met by", "Proved by", "Maturity"], live(V, "OBL").map((o) => {
    const meets = model.in(o.id, "satisfies").map((e) => e.from);
    const proofs = [...model.in(o.id, "verifies").map((e) => e.from), ...meets.flatMap((m) => model.in(m, "verifies").map((e) => e.from))];
    return [V.ref(o.id), V.field(o, "source") || "", V.field(o, "reference") || "", V.field(o, "applies_when") || "", names(V, meets) || "**nothing**", names(V, proofs) || "**nothing**", V.maturity(o.id)];
  }));
}

export function renderRelease(V, target) {
  const { model, meta, a } = V;
  const list = target ? [V.get(target)] : live(V, "RLS");
  if (!list.length || !list[0]) return "# Release scope\n\n_No releases yet._\n";
  const out = [];
  for (const r of list) {
    const items = [...new Set(model.out(r.id, "includes").map((e) => e.to))].map((i) => model.get(i)).filter(Boolean);
    out.push(`# Release: ${r.title}\n`, `${V.code(r.id)} · ${V.field(r, "stage") || ""}${V.field(r, "target") ? " · target " + V.field(r, "target") : ""}\n`);
    const dist = Object.fromEntries(meta.ladder.map((l) => [l, 0]));
    const rows = items.map((e) => {
      const m = a.maturity.get(e.id);
      if (m) dist[m.computed]++;
      const errors = a.findings.filter((f) => f.element === e.id && f.sev === "error").length;
      return [V.ref(e.id), e.type, m?.computed ?? "retired", e.front.approval?.state || "draft", errors || "", m?.caps.map((c) => c.gate.replace("GATE-", "")).join(", ") || ""];
    });
    out.push(table(["Element", "Type", "Supported maturity", "Approval", "Errors", "Held back by"], rows));
    const behind = items.filter((e) => meta.rung(a.maturity.get(e.id)?.computed ?? "stub") < meta.rung("specified")).length;
    out.push(`**Readiness:** ${items.length} elements · ${meta.ladder.map((l) => `${dist[l]} ${l}`).join(" · ")}\n`);
    out.push(behind ? `Not ready to build: ${behind} element${behind > 1 ? "s are" : " is"} below specified.\n` : items.length ? "Everything in scope is specified or better.\n" : "_The scope is empty._\n");
    const exit = section(V, r, "Exit criteria");
    if (exit) out.push("## Exit criteria\n", exit, "");
  }
  return out.join("\n");
}

// ------------------------------------------------------------------- coverage

/** Numbers behind the coverage report and `pds status`. */
export function computeStats(a) {
  const { model, meta, maturity } = a;
  const ladder = meta.ladder;
  const blank = () => Object.fromEntries(ladder.map((l) => [l, 0]));
  const byType = {};
  const byFamily = {};
  const byTier = {};
  let skeleton = 0;
  let over = 0;
  for (const [id, m] of maturity) {
    const el = model.get(id);
    (byType[el.type] ||= blank())[m.computed]++;
    (byFamily[el.family] ||= blank())[m.computed]++;
    (byTier[model.tierOf(id)] ||= blank())[m.computed]++;
    if (meta.field(el, "origin") === "skeleton") skeleton++;
    if (meta.rung(m.declared) > meta.rung(m.byRules)) over++;
  }
  const score = (d) => {
    const n = Object.values(d).reduce((x, y) => x + y, 0);
    return n ? Object.entries(d).reduce((s, [k, v]) => s + v * meta.rung(k), 0) / (n * (ladder.length - 1)) : 0;
  };
  let probes = 0;
  let answered = 0;
  const outstanding = new Map();
  for (const f of model.all("FEAT")) {
    if (model.isRetired(f.id)) continue;
    for (const p of applicableProbes(model, f)) {
      probes++;
      if (dispositionOf(f, p.id)) answered++;
      else outstanding.set(p.id, (outstanding.get(p.id) || 0) + 1);
    }
  }
  // who needs a person's approval is policy: the tiers that require it, from the rung where it starts to bind
  const { required_for_tiers: tiers, from } = a.config.policy.approval;
  const units = approvalUnits(a);
  // present everything in the model's own order, not in the order files happen to load
  const inOrder = (obj, order) => Object.fromEntries(order.filter((k) => obj[k]).map((k) => [k, obj[k]]));
  const orderedFamilies = inOrder(byFamily, Object.keys(meta.families));
  const orderedTypes = inOrder(byType, [...meta.types.keys()]);
  const orderedTiers = inOrder(byTier, Object.keys(meta.tiers));
  return {
    elements: maturity.size,
    retired: model.elements.size - maturity.size,
    byType: orderedTypes,
    byFamily: orderedFamilies,
    byTier: orderedTiers,
    score: Object.fromEntries(Object.entries(orderedFamilies).map(([k, v]) => [k, score(v)])),
    tierScore: Object.fromEntries(Object.entries(orderedTiers).map(([k, v]) => [k, score(v)])),
    overall: score(Object.values(byType).reduce((s, d) => Object.fromEntries(ladder.map((l) => [l, (s[l] || 0) + d[l]])), {})),
    skeleton,
    over,
    probes: { applicable: probes, answered, outstanding: [...outstanding].sort((x, y) => y[1] - x[1]) },
    approvals: { tiers, from, needed: units.length, current: units.filter((u) => u.approved && !u.stale).length, stale: units.filter((u) => u.stale).length, pending: units.filter((u) => !u.approved).length },
    errors: a.counts.error,
    warnings: a.counts.warn,
    gaps: a.gaps.length,
  };
}

const bar = (x, w = 12) => "█".repeat(Math.round(x * w)) + "░".repeat(w - Math.round(x * w));

export function renderCoverage(V) {
  const { model, meta, a } = V;
  const s = computeStats(a);
  const ladder = meta.ladder;
  const prod = model.all("PROD")[0];
  const out = [`# Coverage report${prod ? ": " + prod.title : ""}\n`];
  // No date here: a view that names today would be out of date tomorrow, and `pds views --check` would fail on the calendar alone.
  out.push(`Profile ${a.config.profile || "none"} · adoption ${a.config.adoption} · modules ${[...a.config.modules].join(", ")}\n`);
  out.push(table(["", ""], [["Elements", `${s.elements}${s.retired ? ` (+${s.retired} retired)` : ""}`], ["Overall depth", `${Math.round(s.overall * 100)}% ${bar(s.overall)}`], ["Errors / warnings", `${s.errors} / ${s.warnings}`], ["Claims above what the definition supports", s.over], ["Unconfirmed skeleton elements", s.skeleton], ["Gaps to the next rung", s.gaps], [`Approvals asked for (tier ${s.approvals.tiers.join(", ")} claiming ${s.approvals.from} or better)`, `${s.approvals.needed}: ${s.approvals.current} current · ${s.approvals.stale} stale · ${s.approvals.pending} not yet given`]]));
  out.push("Depth is how far up the ladder what exists has climbed. It says nothing about what has not been written at all: see _Blind spots_ below.\n");

  out.push("## Depth by family\n", table(["Family", ...ladder, "Depth"], Object.entries(s.byFamily).map(([f, d]) => [meta.families[f].title, ...ladder.map((l) => d[l]), `${Math.round(s.score[f] * 100)}% ${bar(s.score[f], 8)}`])));
  out.push("## Depth by tier\n", "Critical work is where a gap costs most, so it is the row to read first.\n", table(["Tier", ...ladder, "Depth"], Object.entries(s.byTier).map(([t, d]) => [`${t} · ${meta.tiers[t].name}`, ...ladder.map((l) => d[l]), `${Math.round(s.tierScore[t] * 100)}% ${bar(s.tierScore[t], 8)}`])));
  out.push("## Depth by element type\n", table(["Type", ...ladder], Object.entries(s.byType).map(([t, d]) => [`${t} · ${meta.spec(t).name}`, ...ladder.map((l) => d[l])])));

  out.push("## The spine\n");
  const rows = [];
  for (const e of model.all(["DOM", "CAP"]).filter((x) => !model.isRetired(x.id)).sort((x, y) => V.path(x.id).localeCompare(V.path(y.id)) || x.title.localeCompare(y.title))) {
    const feats = model.descendants(e.id).filter((d) => d.type === "FEAT" && !model.isRetired(d.id));
    const ready = feats.filter((f) => meta.rung(V.computed(f.id)) >= meta.rung("specified")).length;
    rows.push([`${e.type} ${V.ref(e.id)}`, V.computed(e.id), feats.length ? `${ready} of ${feats.length} features specified or better` : "no features yet"]);
  }
  out.push(table(["Element", "Supported", "Features"], rows));

  out.push("## Concern probes\n");
  out.push(`${s.probes.answered} of ${s.probes.applicable} applicable probes have a disposition.\n`);
  if (s.probes.outstanding.length) out.push(table(["Probe", "Features without a disposition"], s.probes.outstanding.map(([id, n]) => [meta.probes.find((p) => p.id === id)?.title || id, n])));

  out.push("## What to write next\n");
  const top = a.gaps.slice(0, 15);
  out.push(top.length ? table(["Rung", "Element", "Missing", "Ask"], top.map((g) => [g.rung, V.ref(g.element), g.msg, g.ask])) : "_Nothing is missing at the next rung of any element._\n");

  out.push("## Blind spots\n");
  const blind = [];
  if (s.skeleton) blind.push(`${s.skeleton} element${s.skeleton > 1 ? "s are" : " is"} an unconfirmed skeleton: a prompt, not a decision. They are capped at outlined until a person confirms them.`);
  const stubs = [...a.maturity].filter(([, m]) => m.computed === "stub").length;
  if (stubs) blind.push(`${stubs} element${stubs > 1 ? "s are" : " is"} still a stub.`);
  for (const g of a.gaps.filter((x) => ["PROD", "DOM"].includes(x.type) && x.rung === "outlined").slice(0, 8)) blind.push(`${g.type} ${V.code(g.element)} ${g.msg}.`);
  out.push(blind.length ? blind.map((b) => `- ${b}`).join("\n") + "\n" : "_None found by the rules. The rules cannot see what nobody thought to model._\n");
  return out.join("\n");
}
