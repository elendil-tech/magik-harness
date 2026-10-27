// PRB: concern probes carry a real disposition, not a gesture.
import { isDate } from "../shapes.mjs";

const isObj = (v) => v && typeof v === "object" && !Array.isArray(v);

export const checks = {
  "PRB-disposition"(ctx) {
    const { model } = ctx;
    ctx.each("FEAT", (el) => {
      const probes = el.front.probes;
      if (!isObj(probes)) return;
      for (const [id, d] of Object.entries(probes)) {
        if (!isObj(d)) continue; // SCH-field-type reports it
        const at = (msg) => ctx.report({ element: el.id, path: el.path, msg: `probe ${id}: ${msg}` });
        const kinds = ["addressed", "na", "deferred"].filter((k) => k in d);
        if (kinds.length !== 1) {
          at(`give exactly one of addressed, na or deferred (found ${kinds.length})`);
          continue;
        }
        for (const k of Object.keys(d)) if (!["addressed", "na", "deferred", "until", "note"].includes(k)) at(`unknown key ${k}`);
        const kind = kinds[0];
        if (kind !== "addressed" && (typeof d[kind] !== "string" || d[kind].trim().length < 5)) at(`${kind} needs a reason`);
        if (kind === "deferred") {
          if (d.until === undefined) at("deferred needs `until`: a question, a release or a date");
          else if (typeof d.until === "string" && !isDate(d.until)) {
            const target = model.get(d.until);
            if (!target) at(`until ${d.until} does not exist`);
            else if (!["QST", "RLS", "DEC"].includes(target.type)) at(`until ${d.until} must be a question, release or decision`);
          } else if (typeof d.until !== "string") at("until must be an id or a date");
        }
      }
    });
  },

  "PRB-addressed"(ctx) {
    const { model, meta } = ctx;
    ctx.each("FEAT", (el) => {
      const probes = el.front.probes;
      if (!isObj(probes)) return;
      for (const [id, d] of Object.entries(probes)) {
        if (!isObj(d) || !("addressed" in d)) continue;
        const probe = meta.probes.find((p) => p.id === id);
        const at = (msg) => ctx.report({ element: el.id, path: el.path, msg: `probe ${id}: ${msg}` });
        if (!Array.isArray(d.addressed) || d.addressed.length === 0) {
          at("addressed must name the elements that address it");
          continue;
        }
        for (const target of d.addressed) {
          const t = model.get(target);
          if (!t) at(`${target} does not exist`);
          else if (probe && !probe.addressed_by.includes(t.type)) at(`${target} is a ${t.type}; this probe is addressed by ${probe.addressed_by.join(", ")}`);
        }
      }
    });
  },

  "PRB-unknown"(ctx) {
    const known = new Set(ctx.meta.probes.map((p) => p.id));
    ctx.each("FEAT", (el) => {
      if (!isObj(el.front.probes)) return;
      for (const id of Object.keys(el.front.probes)) if (!known.has(id)) ctx.report({ element: el.id, path: el.path, msg: `probe ${id} does not exist`, hint: `known: ${[...known].join(", ")}` });
    });
  },
};
