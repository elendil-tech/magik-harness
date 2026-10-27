// Commands that tell you where the definition stands and what to do next.
import { Failure, UsageError, closest } from "../errors.mjs";
import { formatFindings, formatGaps, plural, bar, wrap, columns, maturityPhrase } from "../format.mjs";
import { computeStats } from "../views/index.mjs";
import { atomRefs } from "../metamodel.mjs";
import { describeProbeApplies } from "../refdocs.mjs";
import { ID_RE } from "../records.mjs";
import { stringifyYaml } from "../yaml.mjs";

const distribution = (a) => {
  const d = Object.fromEntries(a.meta.ladder.map((l) => [l, 0]));
  for (const m of a.maturity.values()) d[m.computed]++;
  return d;
};

// ----------------------------------------------------------------------- lint

export const lint = {
  summary: "Check the definition: schema, references, integrity, quality, governance",
  usage: "lint [--json] [--verbose] [--strict] [--element ID]",
  help: "Exits 1 when there is any error, or, with --strict, any warning. Notes (info) are hidden unless --verbose.",
  flags: {
    json: { type: "bool", doc: "Machine-readable output." },
    verbose: { type: "bool", doc: "Include notes and not just errors and warnings." },
    strict: { type: "bool", doc: "Treat warnings as failures." },
    element: { type: "string", doc: "Only findings about this element." },
  },
  run(ctx) {
    const a = ctx.analysis;
    const { flags } = ctx;
    let findings = a.findings;
    if (flags.element) {
      if (!a.model.has(flags.element)) throw new UsageError(`no element ${flags.element}`);
      findings = findings.filter((f) => f.element === flags.element);
    }
    const count = (sev) => findings.filter((f) => f.sev === sev).length;
    const errors = count("error");
    const warnings = count("warn");
    const notes = count("info");
    const failed = errors > 0 || (flags.strict && warnings > 0);
    if (flags.json) {
      ctx.out(JSON.stringify({ ok: !failed, errors, warnings, notes, findings, maturity: distribution(a), gaps: a.gaps.length }, null, 2));
      return failed ? 1 : 0;
    }
    const lines = formatFindings(findings, { verbose: flags.verbose });
    const hidden = !flags.verbose && notes ? ` (${plural(notes, "note")} hidden: --verbose shows them)` : flags.verbose && notes ? `, ${plural(notes, "note")}` : "";
    lines.push(`${plural(errors, "error")}, ${plural(warnings, "warning")}${hidden}`);
    const d = distribution(a);
    lines.push(`${plural(a.maturity.size, "element")}: ${a.meta.ladder.map((l) => `${d[l]} ${l}`).join(" · ")}`);
    ctx.out(lines.join("\n"));
    return failed ? 1 : 0;
  },
};

// --------------------------------------------------------------------- status

export const status = {
  summary: "Where the definition stands: depth, what needs attention, what is next",
  usage: "status [--json]",
  flags: { json: { type: "bool", doc: "Machine-readable output." } },
  run(ctx) {
    const a = ctx.analysis;
    const { config, meta, model } = a;
    const s = computeStats(a);
    const blocking = model.all("QST").filter((q) => !model.isRetired(q.id) && meta.field(q, "status") === "open" && meta.field(q, "blocking") === true);
    if (ctx.flags.json) {
      ctx.out(JSON.stringify({ name: config.name, profile: config.profile, adoption: config.adoption, ...s, blockingQuestions: blocking.map((q) => q.id) }, null, 2));
      return 0;
    }
    const d = distribution(a);
    const lines = [`${config.name} · ${config.profile ?? "no profile"} · ${config.adoption} adoption`, `modules: ${[...config.modules].join(", ")}`, ""];
    lines.push(`${plural(s.elements, "element")}${s.retired ? ` (${s.retired} retired)` : ""} · depth ${Math.round(s.overall * 100)}% ${bar(s.overall)}`);
    lines.push(`  ${meta.ladder.map((l) => `${l} ${d[l]}`).join(" · ")}`, "");
    lines.push(...columns(Object.entries(s.byFamily).map(([f, dist]) => [`  ${meta.families[f].title}`, Object.values(dist).reduce((x, y) => x + y, 0), `${Math.round(s.score[f] * 100)}% ${bar(s.score[f], 8)}`])), "");
    lines.push(...columns(Object.entries(s.byTier).map(([t, dist]) => [`  Tier ${t} · ${meta.tiers[t].name}`, Object.values(dist).reduce((x, y) => x + y, 0), `${Math.round(s.tierScore[t] * 100)}% ${bar(s.tierScore[t], 8)}`])), "");
    lines.push(`Findings: ${plural(s.errors, "error")}, ${plural(s.warnings, "warning")}`);
    const attention = [];
    if (s.skeleton) attention.push(`${plural(s.skeleton, "unconfirmed skeleton element")}: prompts nobody has confirmed yet`);
    if (s.over) attention.push(`${plural(s.over, "element")} claim${s.over === 1 ? "s" : ""} more than the definition supports`);
    if (blocking.length) attention.push(`${plural(blocking.length, "blocking question")} open: ${blocking.slice(0, 3).map((q) => q.id).join(", ")}${blocking.length > 3 ? ", ..." : ""}`);
    if (s.approvals.pending) attention.push(`${plural(s.approvals.pending, "approval")} not yet given: critical work that claims ${s.approvals.from} or better has no person's sign-off (pds lint lists them)`);
    if (s.approvals.stale) attention.push(`${plural(s.approvals.stale, "approval")} gone stale: edited since a person approved ${s.approvals.stale === 1 ? "it" : "them"}`);
    if (s.probes.applicable) attention.push(`${s.probes.answered} of ${s.probes.applicable} applicable concern probes answered`);
    if (attention.length) lines.push("", "Needs attention", ...attention.map((x) => `  - ${x}`));
    const { lines: next, total } = formatGaps(a.gaps, { elements: 3, items: 3 });
    lines.push("", next.length ? "Next" : "Nothing is missing at the next rung of any element.", ...next);
    if (next.length) lines.push(`${total > 3 ? `${total - 3} more elements in the queue. ` : ""}pds next shows the questions; pds ask <id> goes deep on one element.`);
    ctx.out(lines.join("\n"));
    return 0;
  },
};

// ----------------------------------------------------------------------- next

export const next = {
  summary: "The next best things to write, in order",
  usage: "next [--limit N] [--element ID] [--json]",
  help: "The queue climbs the ladder breadth first: everything is outlined before anything is specified. Within a rung it goes top-down through the spine, then critical before supporting.",
  flags: {
    limit: { type: "int", doc: "How many elements to show (default 5)." },
    element: { type: "string", doc: "Only this element and what is anchored under it." },
    json: { type: "bool", doc: "Machine-readable output." },
  },
  run(ctx) {
    const a = ctx.analysis;
    let gaps = a.gaps;
    if (ctx.flags.element) {
      const id = ctx.flags.element;
      if (!a.model.has(id)) throw new UsageError(`no element ${id}`);
      const under = new Set([id, ...a.model.descendants(id).map((e) => e.id)]);
      gaps = gaps.filter((g) => under.has(g.element));
    }
    if (ctx.flags.json) {
      ctx.out(JSON.stringify(gaps.slice(0, 200), null, 2));
      return 0;
    }
    if (!gaps.length) {
      ctx.out("Nothing is missing at the next rung of any element. Raise the claims, or add what the rules cannot see.");
      return 0;
    }
    const { lines, total } = formatGaps(gaps, { elements: ctx.flags.limit ?? 5 });
    if (total > (ctx.flags.limit ?? 5)) lines.push(`${total - (ctx.flags.limit ?? 5)} more elements in the queue: pds next --limit ${total}`);
    ctx.out(lines.join("\n"));
    return 0;
  },
};

// ------------------------------------------------------------------------ ask

export const ask = {
  summary: "The questions to answer to take one element up the ladder",
  usage: "ask ID [--all]",
  help: "Prints, rung by rung, what the element still lacks and the question that gets it written. This is the interview an agent or a person works through.",
  flags: { all: { type: "bool", doc: "Show the questions for every rung, not only the next." } },
  run(ctx) {
    const [id] = ctx.args;
    if (!id) throw new UsageError("ask needs an element id, for example: pds ask FEAT-send-invoice");
    const a = ctx.analysis;
    const { model, meta } = a;
    const el = model.get(id);
    if (!el) throw new Failure(`no element ${id}${closest(id, [...model.elements.keys()]) ? `; did you mean ${closest(id, [...model.elements.keys()])}?` : ""}`, 2);
    const m = a.maturity.get(id);
    if (!m) throw new Failure(`${id} is retired: there is nothing to ask`);
    const lines = [`${id} · ${el.title} · ${meta.spec(el.type).name}`, `supports ${maturityPhrase(m)} · tier ${model.tierOf(id)} · origin ${meta.field(el, "origin")}`];
    const where = [...model.ancestors(id)].reverse().map((x) => x.title).join(" › ");
    if (where) lines.push(`under ${where}`);
    lines.push("");
    for (const c of m.caps) {
      lines.push(c.gate === "GATE-blocking-question" ? `Held at ${c.rung} by open blocking question ${c.by.join(", ")}. Answer it, or decide it does not block.` : `Held at ${c.rung}: it is a skeleton nobody has confirmed. Read it, correct it, then set origin: human.`, "");
    }
    const rungs = meta.ladder.slice(meta.rung(m.computed) + 1);
    if (!rungs.length) lines.push("Already at the top rung.");
    rungs.forEach((rung, i) => {
      const items = m.results.filter((r) => !r.pass && r.from === rung && r.sev !== "warn");
      if (!items.length) return;
      if (i > 0 && !ctx.flags.all) {
        lines.push(`Then, for ${rung}: ${plural(items.length, "more thing")} (pds ask ${id} --all)`, "");
        return;
      }
      lines.push(`To reach ${rung}`);
      items.forEach((r, n) => {
        lines.push(`  ${n + 1}. ${r.msg}  (${r.rule}${r.sev === "info" ? ", suggested" : ""})`);
        if (r.ask) lines.push(...wrap(r.ask, 96, "     "));
      });
      lines.push("");
    });
    ctx.out(lines.join("\n"));
    return 0;
  },
};

// -------------------------------------------------------------------- explain

function ruleText(r, meta, kind) {
  const lines = [`${r.id}  (${kind})`, ""];
  const a = r.applies || {};
  const bits = [`type ${[].concat(a.type || "*").join(", ")}`, a.from ? `from ${a.from}` : null, a.tiers ? `tiers ${a.tiers.join(", ")}` : null, a.module ? `module ${a.module}` : null].filter(Boolean);
  lines.push(`Applies to: ${bits.join(" · ")}`, `Severity:   ${r.sev || "error"}`);
  if (r.require) lines.push("Requires:", ...stringifyYaml(r.require).trimEnd().split("\n").map((l) => "  " + l));
  if (r.msg) lines.push(`When it fails: ${r.msg}`);
  if (r.ask) lines.push("What to do:", ...wrap(r.ask, 96, "  "));
  const { rels } = r.require ? atomRefs(r.require) : { rels: new Set() };
  if (rels.size) lines.push(`Reads relations: ${[...rels].join(", ")}`);
  return lines;
}

function typeText(code, meta) {
  const t = meta.spec(code);
  const lines = [`${code}  ${t.name}  (element type)`, "", ...wrap(t.summary, 96), "", `Family: ${meta.families[t.family].title} · adoption: ${t.adoption}${t.singleton ? " · one per product" : ""}`, `Lives under: ${t.anchors.length ? t.anchors.join(", ") : "nothing (it is the root)"}`, ""];
  const rows = Object.entries(t.fields).map(([n, s]) => [`  ${n}`, s.type + (s.values ? ` (${s.values.join("|")})` : ""), s.required_at ? `needed for ${s.required_at}` : "optional"]);
  if (rows.length) lines.push("Fields (besides the envelope: id, title, summary, anchor, maturity, tier, approval, lifecycle, origin, owner, reviewed, rel)", ...columns(rows), "");
  if (t.sections.length) lines.push("Sections", ...t.sections.flatMap((s) => [`  ## ${s.heading}  ${s.required_at ? `(needed for ${s.required_at})` : ""}`, ...wrap(s.ask, 94, "     ")]), "");
  const blocks = Object.entries(t.blocks || {});
  if (blocks.length) lines.push("Structured blocks", ...blocks.map(([n, b]) => `  ${n}  (needed for ${b.required_at})  ${b.doc}`), "");
  const rel = [];
  for (const r of meta.relations.values()) {
    for (const p of r.allow) {
      if (p.from.includes(code) || p.from.includes("*")) rel.push([`  ${r.name}`, `→ ${p.to.join(", ")}`]);
      if (p.to.includes(code) || p.to.includes("*")) rel.push([`  ${r.inverse}`, `← ${p.from.join(", ")}`]);
    }
  }
  if (rel.length) lines.push("Relations it can take part in", ...columns(rel), "");
  return lines;
}

function relationText(r, meta) {
  const lines = [`${r.name}  (relation; read backwards: ${r.inverse})`, "", ...wrap(r.doc, 96), ""];
  lines.push("Allowed:", ...r.allow.map((p) => `  ${p.from.join(", ")} → ${p.to.join(", ")}${p.same_type ? " (same type only)" : ""}`));
  if (r.attrs) lines.push("Attributes:", ...Object.entries(r.attrs).map(([n, s]) => `  ${n}: ${s.type}${s.values ? ` (${s.values.join("|")})` : ""}`));
  const effect = (s) => (s === "none" ? "is not affected" : s === "strong" ? "must be reviewed" : "should be reviewed");
  lines.push(`Impact: when the source changes, the target ${effect(r.impacts.to)}; when the target changes, the source ${effect(r.impacts.from)}.`);
  if (r.also_from) lines.push(`Also derived from: ${r.also_from.join("; ")}`);
  const users = [...meta.rules, ...meta.checks].filter((x) => (x.require ? atomRefs(x.require).rels.has(r.name) : (x.uses || []).includes(r.name))).map((x) => x.id);
  const views = [...meta.views].filter(([, v]) => (v.uses || []).includes(r.name)).map(([id]) => id);
  if (users.length) lines.push(`Read by rules and checks: ${users.join(", ")}`);
  if (views.length) lines.push(`Read by views: ${views.join(", ")}`);
  return lines;
}

export const explain = {
  summary: "What a rule, check, probe, element type, relation or view means",
  usage: "explain NAME",
  help: "NAME is an id such as COV-FEAT-flow, INT-flow-refs, GATE-skeleton, a probe id, an element type such as FEAT, a relation such as accesses, or a view.",
  flags: {},
  run(ctx) {
    const [raw] = ctx.args;
    if (!raw) throw new UsageError("explain needs a name, for example: pds explain COV-FEAT-flow");
    const meta = ctx.meta;
    const rule = [...meta.rules, ...meta.implicitRules].find((r) => r.id === raw);
    const probe = meta.probes.find((p) => p.id === raw || `PRB-${p.id}` === raw);
    const check = meta.checks.find((c) => c.id === raw);
    const gate = meta.gates.find((g) => g.id === raw);
    const rel = meta.relations.get(raw) || [...meta.relations.values()].find((r) => r.inverse === raw);
    const type = meta.types.has(raw.toUpperCase()) ? raw.toUpperCase() : null;
    const view = meta.views.get(raw);
    let lines;
    if (rule) lines = ruleText(rule, meta, rule.implicit ? "rule generated from the element type" : "coverage rule");
    else if (probe) lines = [`${probe.id}  (concern probe: ${probe.title})`, "", `Applies to: features, ${describeProbeApplies(probe.applies)}${probe.module ? ` · module ${probe.module}` : ""}`, "The question:", ...wrap(probe.ask, 96, "  "), "", "Answer it on the feature, under probes:", `  probes:\n    ${probe.id}: {addressed: [ID, ...]}   # or {na: "why it does not apply"} or {deferred: "why", until: 2027-01-31}`, `Counts as addressed when the feature (or what is anchored on it) has: ${[].concat(probe.addressed_by || []).join(", ") || "any element"}`];
    else if (check) lines = [`${check.id}  (check, class ${check.class}, ${check.sev})`, "", ...wrap(check.doc, 96), check.from ? `Runs for elements claiming ${check.from} or more.` : ""];
    else if (gate) lines = [`${gate.id}  (gate)`, "", ...wrap(gate.doc, 96), `Caps the element at: ${gate.caps_at}`];
    else if (type) lines = typeText(type, meta);
    else if (rel) lines = relationText(rel, meta);
    else if (view) lines = [`${raw}  (view: ${view.title})`, "", `Answers: ${view.answers}`, `Scope: ${view.scope}`, `Form: ${view.form}`, `Reads: ${(view.uses || []).join(", ") || "nothing but the elements"}`, "", `Try: pds view ${raw}`];
    else {
      const prefix = ID_RE.exec(raw)?.[1];
      if (prefix && meta.types.has(prefix)) throw new Failure(`${raw} is an element id, and explain is about what rules, checks, types and relations mean; for the element itself try: pds ask ${raw}, pds spec ${raw} or pds impact ${raw}`, 2);
      const all = [...meta.rules.map((r) => r.id), ...meta.implicitRules.map((r) => r.id), ...meta.checks.map((c) => c.id), ...meta.gates.map((g) => g.id), ...meta.probes.map((p) => p.id), ...meta.types.keys(), ...meta.relations.keys(), ...meta.views.keys()];
      const near = closest(raw, all);
      throw new Failure(`nothing called ${raw}${near ? `; did you mean ${near}?` : ""}`, 2);
    }
    ctx.out(lines.join("\n"));
    return 0;
  },
};
