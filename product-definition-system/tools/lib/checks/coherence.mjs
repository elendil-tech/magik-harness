// COH: the definition is coherent, it agrees with itself. Flows lead somewhere, state machines
// are closed, data flags are consistent, and nothing contradicts the graph.
const isObj = (v) => v && typeof v === "object" && !Array.isArray(v);
const asList = (v) => (v === undefined || v === null ? [] : Array.isArray(v) ? v : [v]);
const maps = (v) => asList(v).filter(isObj);

const STEP_KEYS = ["id", "name", "actor", "at", "does", "uses", "accesses", "emits", "moves", "next", "decide", "end", "call", "note"];
const END_KINDS = ["success", "failure", "abort"];
const CRUD = ["create", "read", "update", "delete"];
const ASSOC_KINDS = ["one_to_one", "one_to_many", "many_to_one", "many_to_many"];

function block(el, name) {
  const b = el.rec.blocks.find((x) => x.name === name);
  return b && b.data && !b.error && isObj(b.data) ? b : null;
}

/** Flow steps and the graph of how they connect. */
function flowGraph(data) {
  const steps = maps(data.steps);
  const byId = new Map();
  for (const s of steps) if (typeof s.id === "string" && !byId.has(s.id)) byId.set(s.id, s);
  const next = (s) => {
    const out = [];
    if (typeof s.next === "string") out.push(s.next);
    for (const d of maps(s.decide)) if (typeof d.next === "string") out.push(d.next);
    return out.filter((t) => byId.has(t));
  };
  return { steps, byId, next };
}

function sccs(nodes, edgesOf) {
  // Tarjan
  let index = 0;
  const idx = new Map();
  const low = new Map();
  const on = new Set();
  const stack = [];
  const out = [];
  const visit = (v) => {
    idx.set(v, index);
    low.set(v, index);
    index++;
    stack.push(v);
    on.add(v);
    for (const w of edgesOf(v)) {
      if (!idx.has(w)) {
        visit(w);
        low.set(v, Math.min(low.get(v), low.get(w)));
      } else if (on.has(w)) low.set(v, Math.min(low.get(v), idx.get(w)));
    }
    if (low.get(v) === idx.get(v)) {
      const comp = [];
      let w;
      do {
        w = stack.pop();
        on.delete(w);
        comp.push(w);
      } while (w !== v);
      out.push(comp);
    }
  };
  for (const n of nodes) if (!idx.has(n)) visit(n);
  return out;
}

export const checks = {
  "COH-flow-shape"(ctx) {
    ctx.each("FLW", (el) => {
      const b = block(el, "pds-flow");
      if (!b) return;
      const at = (msg) => ctx.report({ element: el.id, path: el.path, line: b.line, msg });
      const { steps, byId } = flowGraph(b.data);
      const seen = new Set();
      for (const s of steps) {
        if (typeof s.id !== "string") continue;
        if (!/^[a-z][a-z0-9_-]*$/.test(s.id)) at(`step id "${s.id}" must start with a lowercase letter and use only lowercase letters, digits, _ or -`);
        if (seen.has(s.id)) at(`step id "${s.id}" is used twice`);
        seen.add(s.id);
      }
      if (typeof b.data.entry === "string" && !byId.has(b.data.entry)) at(`entry ${b.data.entry} is not a step`);
      for (const s of steps) {
        const where = `step ${s.id}`;
        for (const k of Object.keys(s)) if (!STEP_KEYS.includes(k)) at(`${where}: unknown key ${k}`);
        const exits = ["next", "decide", "end"].filter((k) => k in s);
        if (exits.length === 0) at(`${where} leads nowhere: give it next, decide or end`);
        if (exits.length > 1) at(`${where} has ${exits.join(" and ")}; a step has exactly one way on`);
        if ("next" in s && (typeof s.next !== "string" || !byId.has(s.next))) at(`${where}: next ${JSON.stringify(s.next)} is not a step`);
        if ("end" in s && !END_KINDS.includes(s.end)) at(`${where}: end must be one of ${END_KINDS.join(", ")}`);
        if ("decide" in s) {
          const branches = asList(s.decide);
          if (branches.length < 2) at(`${where}: a decision needs at least two branches`);
          branches.forEach((d, i) => {
            if (!isObj(d) || typeof d.when !== "string" || !d.when.trim()) at(`${where}: decide[${i}] needs a \`when\` that says which case it is`);
            else if (typeof d.next !== "string" || !byId.has(d.next)) at(`${where}: decide[${i}] next ${JSON.stringify(d.next)} is not a step`);
          });
        }
      }
    });
  },

  "COH-flow-reach"(ctx) {
    ctx.each("FLW", (el) => {
      const b = block(el, "pds-flow");
      if (!b || typeof b.data.entry !== "string") return;
      const { steps, byId, next } = flowGraph(b.data);
      if (!byId.has(b.data.entry)) return;
      const seen = new Set([b.data.entry]);
      const queue = [b.data.entry];
      while (queue.length) for (const t of next(byId.get(queue.shift()))) if (!seen.has(t)) (seen.add(t), queue.push(t));
      for (const s of steps) if (typeof s.id === "string" && !seen.has(s.id)) ctx.report({ element: el.id, path: el.path, line: b.line, msg: `step ${s.id} cannot be reached from the entry` });
      // can every reachable step still reach an end?
      const canEnd = new Set(steps.filter((s) => "end" in s).map((s) => s.id));
      let grew = true;
      while (grew) {
        grew = false;
        for (const s of steps) if (!canEnd.has(s.id) && next(s).some((t) => canEnd.has(t))) (canEnd.add(s.id), (grew = true));
      }
      for (const id of seen) if (!canEnd.has(id)) ctx.report({ sev: "warn", element: el.id, path: el.path, line: b.line, msg: `step ${id} is on a loop with no way out: no path from it reaches an end` });
    });
  },

  "COH-flow-ends"(ctx) {
    ctx.each("FLW", (el) => {
      const b = block(el, "pds-flow");
      if (!b || ctx.model.tierOf(el.id) > 2) return;
      const ends = maps(b.data.steps).map((s) => s.end).filter(Boolean);
      if (!ends.includes("success")) ctx.report({ element: el.id, path: el.path, line: b.line, msg: "has no success end" });
      if (!ends.includes("failure") && !ends.includes("abort")) ctx.report({ element: el.id, path: el.path, line: b.line, msg: "has no failure or abort end: what happens when it goes wrong?" });
    });
  },

  "COH-flow-refs"(ctx) {
    const { model, meta } = ctx;
    ctx.each("FLW", (el) => {
      const b = block(el, "pds-flow");
      if (!b) return;
      const at = (s, msg) => ctx.report({ element: el.id, path: el.path, line: b.line, msg: `step ${s.id}: ${msg}` });
      for (const s of maps(b.data.steps)) {
        for (const u of asList(s.uses)) {
          const t = meta.typeOfId(u);
          if (!["RULE", "EXT", "INT", "API"].includes(t)) at(s, `uses ${u}: expected a RULE, EXT, INT or API`);
        }
        if ("accesses" in s) {
          if (!isObj(s.accesses)) at(s, "accesses must map entity ids to operations, for example {ENT-invoice: [create]}");
          else for (const [ent, ops] of Object.entries(s.accesses)) for (const op of asList(ops)) if (!CRUD.includes(op)) at(s, `accesses ${ent}: ${op} is not one of ${CRUD.join(", ")}`);
        }
        if ("moves" in s) {
          if (!isObj(s.moves)) at(s, "moves must map a state machine id to transitions, for example {STM-invoice: [\"draft->sent\"]}");
          else {
            for (const [stm, trs] of Object.entries(s.moves)) {
              const target = model.get(stm);
              if (!target) continue; // REF-target reports it
              if (target.type !== "STM") {
                at(s, `moves ${stm}: expected a state machine`);
                continue;
              }
              const sb = block(target, "pds-states");
              if (!sb) continue;
              const known = new Set(maps(sb.data.transitions).map((t) => `${t.from}->${t.to}`));
              for (const t of asList(trs)) if (!known.has(t)) at(s, `moves ${stm}: ${JSON.stringify(t)} is not a transition of it (known: ${[...known].join(", ") || "none"})`);
            }
          }
        }
        if (typeof s.call === "string" && meta.typeOfId(s.call) !== "FLW") at(s, `call ${s.call}: expected a flow`);
        if (s.call === el.id) at(s, "a flow cannot call itself");
      }
    });
  },

  "COH-flow-size"(ctx) {
    ctx.each("FLW", (el) => {
      const b = block(el, "pds-flow");
      const n = b ? maps(b.data.steps).length : 0;
      if (n > 25) ctx.report({ element: el.id, path: el.path, line: b?.line, msg: `has ${n} steps; split it into flows that call each other` });
    });
  },

  "COH-stm-shape"(ctx) {
    ctx.each("STM", (el) => {
      const b = block(el, "pds-states");
      if (!b) return;
      const at = (msg) => ctx.report({ element: el.id, path: el.path, line: b.line, msg });
      const states = maps(b.data.states);
      const ids = new Set();
      for (const s of states) {
        if (typeof s.id !== "string") continue;
        if (ids.has(s.id)) at(`state ${s.id} is defined twice`);
        ids.add(s.id);
        if (s.kind !== undefined && !["initial", "normal", "terminal"].includes(s.kind)) at(`state ${s.id}: kind must be initial, normal or terminal`);
      }
      const initial = states.filter((s) => s.kind === "initial");
      if (initial.length !== 1) at(`needs exactly one initial state; it has ${initial.length}`);
      const trs = maps(b.data.transitions);
      const outgoing = new Map([...ids].map((i) => [i, []]));
      trs.forEach((t, i) => {
        for (const k of ["from", "to"]) if (typeof t[k] === "string" && !ids.has(t[k])) at(`transitions[${i}]: ${k} ${t[k]} is not a state`);
        if (typeof t.trigger !== "string" || !t.trigger.trim()) at(`transitions[${i}] ${t.from}->${t.to} needs \`trigger\`: what causes it`);
        if (outgoing.has(t.from)) outgoing.get(t.from).push(t.to);
      });
      for (const s of states) {
        if (s.kind === "terminal" && outgoing.get(s.id)?.length) at(`state ${s.id} is terminal but has a way out`);
        if (s.kind !== "terminal" && outgoing.has(s.id) && !outgoing.get(s.id).length) at(`state ${s.id} is a dead end: mark it terminal or give it a way out`);
      }
      if (initial.length === 1) {
        const seen = new Set([initial[0].id]);
        const queue = [initial[0].id];
        while (queue.length) for (const t of outgoing.get(queue.shift()) || []) if (!seen.has(t)) (seen.add(t), queue.push(t));
        for (const id of ids) if (!seen.has(id)) at(`state ${id} cannot be reached from the initial state`);
      }
    });
  },

  "COH-stm-driven"(ctx) {
    const { model } = ctx;
    ctx.each("STM", (el) => {
      const b = block(el, "pds-states");
      if (!b) return;
      const driven = new Set(model.in(el.id, "drives").flatMap((e) => asList(e.attrs.transitions)));
      for (const t of maps(b.data.transitions)) {
        const name = `${t.from}->${t.to}`;
        if (!t.by) ctx.report({ element: el.id, path: el.path, line: b.line, msg: `transition ${name} says nothing about who or what causes it (by)` });
        else if (t.by !== "system" && !driven.has(name)) ctx.report({ element: el.id, path: el.path, line: b.line, msg: `transition ${name} is caused by ${t.by} but no flow moves it`, hint: "add moves to the flow step that does it, or set by: system" });
      }
    });
  },

  "COH-ent-attributes"(ctx) {
    const { meta } = ctx;
    ctx.each("ENT", (el) => {
      const b = block(el, "pds-attributes");
      if (!b) return;
      const at = (msg, sev) => ctx.report({ sev, element: el.id, path: el.path, line: b.line, msg });
      const attrs = maps(b.data.attributes);
      const names = new Set();
      for (const a of attrs) {
        if (typeof a.name !== "string") continue;
        const k = a.name.toLowerCase();
        if (names.has(k)) at(`attribute ${a.name} is defined twice`);
        names.add(k);
        if (typeof a.type !== "string" || !a.type.trim()) at(`attribute ${a.name} needs a type`);
        for (const f of ["required", "unique", "pii"]) if (f in a && typeof a[f] !== "boolean") at(`attribute ${a.name}: ${f} must be true or false`);
      }
      for (const [i, a] of asList(b.data.associations).entries()) {
        if (!isObj(a)) at(`associations[${i}] must be a mapping`);
        else if (a.kind !== undefined && !ASSOC_KINDS.includes(a.kind)) at(`associations[${i}]: kind must be one of ${ASSOC_KINDS.join(", ")}`);
      }
      const anyPii = attrs.some((a) => a.pii === true);
      const pii = meta.field(el, "pii");
      if (pii === false && anyPii) at("says it holds no personal data, but an attribute is marked pii");
      if (pii === true && !anyPii) at("says it holds personal data, but no attribute is marked pii", "warn");
      if ((pii === true || anyPii) && ["public", "internal"].includes(meta.field(el, "classification"))) at(`holds personal data but is classified ${meta.field(el, "classification")}; use confidential or restricted`);
    });
  },

  "COH-payload"(ctx) {
    const { meta } = ctx;
    ctx.each("EVT", (el) => {
      const b = block(el, "pds-payload");
      if (!b) return;
      const at = (msg, sev) => ctx.report({ sev, element: el.id, path: el.path, line: b.line, msg });
      const fields = maps(b.data.fields);
      const names = new Set();
      for (const f of fields) {
        if (typeof f.name !== "string") continue;
        if (names.has(f.name.toLowerCase())) at(`payload field ${f.name} is defined twice`);
        names.add(f.name.toLowerCase());
      }
      const anyPii = fields.some((f) => f.pii === true);
      const pii = meta.field(el, "pii");
      if (pii === false && anyPii) at("says it carries no personal data, but a payload field is marked pii");
      if (pii === true && !anyPii) at("says it carries personal data, but no payload field is marked pii", "warn");
    });
  },

  "COH-journey"(ctx) {
    ctx.each("JRN", (el) => {
      const b = block(el, "pds-journey");
      if (!b) return;
      const at = (msg, sev) => ctx.report({ sev, element: el.id, path: el.path, line: b.line, msg });
      const seen = new Set();
      for (const s of maps(b.data.stages)) {
        if (typeof s.id !== "string") continue;
        if (seen.has(s.id)) at(`stage id ${s.id} is used twice`);
        seen.add(s.id);
        if (s.feeling !== undefined && !(Number.isInteger(s.feeling) && s.feeling >= 1 && s.feeling <= 5)) at(`stage ${s.id}: feeling must be a whole number from 1 (frustrated) to 5 (delighted)`);
        if (!asList(s.flows).length && !asList(s.touchpoints).length) at(`stage ${s.id} names no flow and no touchpoint`, "warn");
      }
    });
  },

  "COH-plan-entitlements"(ctx) {
    const { model, meta } = ctx;
    ctx.each("PLAN", (el) => {
      const at = (msg) => ctx.report({ element: el.id, path: el.path, msg });
      const seen = new Set();
      for (const item of maps(el.front.entitlements)) {
        const entl = model.get(item.entl);
        if (seen.has(item.entl)) at(`entitlement ${item.entl} is listed twice`);
        seen.add(item.entl);
        if (!entl) continue; // REF-target reports a missing one
        if (entl.type !== "ENTL") {
          at(`${item.entl} is not an entitlement`);
          continue;
        }
        const kind = meta.field(entl, "kind");
        const v = item.value;
        if (kind === "access" && typeof v !== "boolean") at(`${item.entl} is an access entitlement: its value must be true or false`);
        if (["limit", "quota", "rate"].includes(kind) && !(v === "unlimited" || (Number.isInteger(v) && v >= 0))) at(`${item.entl} is a ${kind}: its value must be a whole number of zero or more, or "unlimited"`);
      }
      const price = el.front.price;
      if (isObj(price)) {
        if (price.model === "free" && price.amount !== undefined && price.amount !== 0) at("a free plan has no amount");
        if (["flat", "per_seat", "tiered"].includes(price.model)) {
          if (!(typeof price.amount === "number" && price.amount > 0)) at(`price.model ${price.model} needs an amount above zero`);
          if (!price.currency) at(`price.model ${price.model} needs a currency`);
          if (!price.interval) at(`price.model ${price.model} needs an interval`);
        }
      }
    });
  },

  "COH-rule-examples"(ctx) {
    ctx.each("RULE", (el) => {
      const ex = maps(el.front.examples);
      if (el.front.examples === undefined) return; // missing is a coverage gap, not an inconsistency
      if (!ex.some((x) => x.case === "positive")) ctx.report({ element: el.id, path: el.path, msg: "needs at least one positive example: a case where the rule holds" });
      if (!ex.some((x) => x.case === "negative" || x.case === "edge")) ctx.report({ element: el.id, path: el.path, msg: "needs at least one negative or edge example: a case at or beyond the boundary" });
    });
  },

  "COH-screen-states"(ctx) {
    ctx.each("SCR", (el) => {
      if (ctx.meta.field(el, "data_bound") !== true) return;
      const have = new Set(asList(el.front.states).map((s) => String(s).trim().toLowerCase()));
      const missing = ["loading", "empty", "error"].filter((s) => !have.has(s));
      if (missing.length) ctx.report({ element: el.id, path: el.path, msg: `shows data but does not define the ${missing.join(", ")} state${missing.length > 1 ? "s" : ""}`, hint: "list the states in `states` and describe each under Content and states" });
    });
  },

  "COH-facets"(ctx) {
    ctx.each("FEAT", (el) => {
      const f = ctx.model.facets(el.id);
      for (const [name, declared] of Object.entries(f.declared)) {
        if (declared === false && f.derived[name]) ctx.report({ element: el.id, path: el.path, msg: `declares facet ${name} false, but the graph shows it true`, hint: "remove the declaration, or fix the relations that imply it" });
      }
    });
  },

  "COH-role-limits"(ctx) {
    const { model } = ctx;
    ctx.each("ROLE", (el) => {
      const { min_holders: min, max_holders: max } = el.front;
      if (Number.isInteger(min) && Number.isInteger(max) && min > max) ctx.report({ element: el.id, path: el.path, msg: `min_holders ${min} exceeds max_holders ${max}` });
      const chain = [el.id];
      let cur = el;
      while (cur && typeof cur.front.assignable_by === "string") {
        if (chain.includes(cur.front.assignable_by)) {
          ctx.report({ element: el.id, path: el.path, msg: `assignable_by loops: ${[...chain, cur.front.assignable_by].join(" -> ")}` });
          break;
        }
        chain.push(cur.front.assignable_by);
        cur = model.get(cur.front.assignable_by);
      }
    });
  },

  "COH-dependency-cycle"(ctx) {
    const { model } = ctx;
    const nodes = model.all(["CAP", "FEAT"]).filter((e) => !model.isRetired(e.id)).map((e) => e.id);
    const edgesOf = (id) =>
      model
        .out(id, "depends_on")
        .filter((e) => e.attrs.kind !== "soft" && nodes.includes(e.to))
        .map((e) => e.to);
    for (const comp of sccs(nodes, edgesOf)) {
      const self = comp.length === 1 && edgesOf(comp[0]).includes(comp[0]);
      if (comp.length < 2 && !self) continue;
      const first = [...comp].sort()[0];
      ctx.report({ element: first, path: model.get(first).path, msg: `hard dependencies form a cycle: ${[...comp].sort().join(", ")}`, hint: "make one of them soft, or split out what they share" });
    }
  },

  "COH-supersedes"(ctx) {
    const { model } = ctx;
    const nodes = [...new Set(model.edges.filter((e) => e.rel === "supersedes").flatMap((e) => [e.from, e.to]))].filter((i) => model.has(i));
    const edgesOf = (id) => model.out(id, "supersedes").map((e) => e.to).filter((i) => model.has(i));
    for (const comp of sccs(nodes, edgesOf)) {
      if (comp.length < 2 && !edgesOf(comp[0]).includes(comp[0])) continue;
      const first = [...comp].sort()[0];
      ctx.report({ element: first, path: model.get(first).path, msg: `supersession loops: ${[...comp].sort().join(", ")}` });
    }
    for (const e of model.edges) {
      if (e.rel !== "supersedes" || !model.has(e.to) || !model.has(e.from)) continue;
      if (model.isRetired(e.from) || model.lifecycleOf(e.from) !== "active") continue;
      if (model.lifecycleOf(e.to) === "active") ctx.report({ element: e.to, path: model.get(e.to).path, msg: `is superseded by ${e.from} but is still active`, hint: "deprecate or retire it, with a lifecycle_note that points at its replacement" });
    }
  },

  "COH-release-scope"(ctx) {
    const { model, meta } = ctx;
    ctx.each("RLS", (el) => {
      if (!["planned", "in_progress"].includes(meta.field(el, "stage"))) return;
      for (const e of model.out(el.id, "includes")) {
        if (model.has(e.to) && model.isRetired(e.to)) ctx.report({ element: el.id, path: el.path, msg: `includes ${e.to}, which is retired` });
      }
    });
  },

  "COH-tier-order"(ctx) {
    const { model } = ctx;
    ctx.each(["CAP", "FEAT"], (el) => {
      const own = Number(el.front.tier);
      if (![1, 2, 3].includes(own)) return;
      const parent = model.ancestors(el.id).find((a) => [1, 2, 3].includes(Number(a.front.tier)));
      if (parent && own < Number(parent.front.tier)) ctx.report({ element: el.id, path: el.path, msg: `is tier ${own} but sits under ${parent.id}, tier ${parent.front.tier}`, hint: "a critical feature makes its capability critical: raise the parent, or lower this" });
    });
  },

  "COH-qst-answer"(ctx) {
    const { meta } = ctx;
    ctx.each("QST", (el) => {
      const status = meta.field(el, "status");
      if (status === "open" && el.front.answer !== undefined && String(el.front.answer).trim()) ctx.report({ element: el.id, path: el.path, msg: "is open but carries an answer: set status to answered" });
      if (status !== "open" && meta.field(el, "blocking") === true) ctx.report({ element: el.id, path: el.path, msg: `is ${status} but still marked blocking`, hint: "set blocking: false" });
    });
  },
};

