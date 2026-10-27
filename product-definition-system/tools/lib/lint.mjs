// Analysis: build the model, evaluate coverage, run every declared check and
// derive the gap queue. Pure: it takes files in memory and returns data.
import { buildModel } from "./graph.mjs";
import { evaluateAll } from "./coverage.mjs";
import { IMPLEMENTATIONS } from "./checks/index.mjs";

const SEV_ORDER = { error: 0, warn: 1, info: 2 };

export function today() {
  return new Date().toISOString().slice(0, 10);
}

/**
 * @param {object} args
 * @param {import("./metamodel.mjs").Meta} args.meta
 * @param {{config: object, files: Map<string,string>, problems?: object[]}} args.project
 * @param {string} [args.today] fixed date for repeatable freshness checks
 */
export function analyse({ meta, project, today: now = today() }) {
  const { config, files } = project;
  const model = buildModel(meta, config, files);
  const maturity = evaluateAll(model);
  const findings = [];
  const declaredRung = (el) => (meta.ladder.includes(el.declared) ? meta.rung(el.declared) : 0);

  const ctx = {
    meta,
    model,
    config,
    project,
    maturity,
    today: now,
    current: null,
    report(f) {
      const c = this.current;
      findings.push({ id: c.id, sev: c.sev, element: null, path: null, line: null, ...f });
    },
    each(types, fn) {
      const c = this.current;
      const from = c.from ? meta.rung(c.from) : 0;
      const keepRetired = c.class === "SCH" || c.class === "REF";
      for (const el of model.all(types || undefined)) {
        if (model.isRetired(el.id) && !keepRetired) continue;
        if (from > 0 && declaredRung(el) < from) continue;
        fn(el);
      }
    },
  };

  for (const c of meta.checks) {
    const impl = IMPLEMENTATIONS[c.id];
    if (!impl) continue;
    ctx.current = c;
    try {
      impl(ctx);
    } catch (e) {
      findings.push({ id: c.id, sev: "error", element: null, path: null, line: null, msg: `the check itself failed: ${e.message}` });
    }
  }

  // advisory coverage rules: reported when the element claims the rung they belong to
  for (const [id, m] of maturity) {
    const el = model.get(id);
    for (const r of m.results) {
      if (r.pass || r.sev !== "warn") continue;
      if (declaredRung(el) < meta.rung(r.from)) continue;
      findings.push({ id: r.rule, sev: "warn", element: id, path: el.path, line: null, msg: r.msg, hint: r.ask });
    }
  }

  findings.sort((a, b) => SEV_ORDER[a.sev] - SEV_ORDER[b.sev] || String(a.element).localeCompare(String(b.element)) || a.id.localeCompare(b.id) || (a.line || 0) - (b.line || 0) || String(a.msg).localeCompare(String(b.msg)));

  const gaps = buildGaps(model, meta, maturity);
  const counts = { error: 0, warn: 0 };
  for (const f of findings) if (f.sev in counts) counts[f.sev]++;
  return { meta, model, config, maturity, findings, gaps, counts, today: now };
}

/** What stands between each element and its next rung, ordered broad-first, critical-first. */
export function buildGaps(model, meta, maturity) {
  const gaps = [];
  for (const [id, m] of maturity) {
    if (!m.next) continue;
    const el = model.get(id);
    const depth = meta.isSpine(el.type) ? meta.spineIndex(el.type) : meta.spine.length;
    const base = { element: id, type: el.type, title: el.title, tier: model.tierOf(id), depth, rung: m.next };
    for (const r of m.results) {
      if (!r.pass && r.sev === "error" && r.from === m.next) gaps.push({ ...base, rule: r.rule, kind: r.kind, msg: r.msg, ask: r.ask });
    }
    for (const c of m.caps) {
      if (meta.rung(c.rung) >= meta.rung(m.next)) {
        const gate = meta.gates.find((g) => g.id === c.gate);
        gaps.push({
          ...base,
          rule: c.gate,
          kind: "gate",
          msg: c.gate === "GATE-blocking-question" ? `is blocked by open question ${c.by.join(", ")}` : "is a skeleton no person has confirmed",
          ask: c.gate === "GATE-blocking-question" ? "Answer the blocking question, or decide it is not blocking." : "Read it, correct it, and set origin: human.",
          note: gate?.doc,
        });
      }
    }
  }
  gaps.sort((a, b) => meta.rung(a.rung) - meta.rung(b.rung) || a.depth - b.depth || a.tier - b.tier || a.element.localeCompare(b.element) || a.rule.localeCompare(b.rule));
  return gaps;
}
