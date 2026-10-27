// SCH: the records are well formed. These checks need no graph, only the
// records and the meta-model.
import { ID_RE } from "../records.mjs";
import { checkValue } from "../shapes.mjs";

const isObj = (v) => v && typeof v === "object" && !Array.isArray(v);
const asList = (v) => (v === undefined || v === null ? [] : Array.isArray(v) ? v : [v]);

const BLOCK_SHAPE = {
  "pds-flow": (d, add) => {
    if (typeof d.entry !== "string") add("needs `entry`, the id of the first step");
    listOfMaps(d.steps, "steps", "id", add);
  },
  "pds-states": (d, add) => {
    listOfMaps(d.states, "states", "id", add);
    if (!Array.isArray(d.transitions)) add("needs `transitions`, a list (it may be empty)");
    else d.transitions.forEach((t, i) => (isObj(t) ? ["from", "to", "on"].forEach((k) => typeof t[k] !== "string" && add(`transitions[${i}] needs \`${k}\``)) : add(`transitions[${i}] must be a mapping`)));
  },
  "pds-attributes": (d, add) => {
    listOfMaps(d.attributes, "attributes", "name", add);
    if (d.associations !== undefined && !Array.isArray(d.associations)) add("`associations` must be a list");
  },
  "pds-journey": (d, add) => {
    listOfMaps(d.stages, "stages", "id", add);
    if (Array.isArray(d.stages)) d.stages.forEach((s, i) => isObj(s) && typeof s.name !== "string" && add(`stages[${i}] needs a \`name\``));
  },
  "pds-payload": (d, add) => listOfMaps(d.fields, "fields", "name", add),
};

function listOfMaps(list, key, idKey, add) {
  if (!Array.isArray(list) || list.length === 0) return add(`needs \`${key}\`, a non-empty list`);
  list.forEach((x, i) => {
    if (!isObj(x)) add(`${key}[${i}] must be a mapping`);
    else if (typeof x[idKey] !== "string" || !x[idKey]) add(`${key}[${i}] needs \`${idKey}\``);
  });
}

export const checks = {
  "SCH-project"(ctx) {
    for (const p of ctx.project.problems || []) ctx.report({ id: "SCH-project", path: "pds.yaml", msg: p.msg });
  },

  "SCH-frontmatter"(ctx) {
    for (const rec of ctx.model.records) {
      for (const p of rec.problems) if (p.id === "SCH-frontmatter") ctx.report({ path: rec.path, line: p.line, msg: p.msg });
    }
  },

  "SCH-id-form"(ctx) {
    const { meta, config } = ctx;
    for (const rec of ctx.model.records) {
      if (!rec.ok) continue;
      if (typeof rec.id !== "string" || !ID_RE.test(rec.id)) {
        ctx.report({ path: rec.path, msg: `id ${JSON.stringify(rec.front?.id)} is not of the form TYPE-kebab-slug (for example FEAT-send-invoice)`, hint: "an id is a type prefix, a hyphen and lowercase words joined by hyphens" });
        continue;
      }
      const type = meta.typeOfId(rec.id);
      if (!type) {
        ctx.report({ element: rec.id, path: rec.path, msg: `unknown type prefix in ${rec.id}`, hint: `known: ${[...meta.types.keys()].join(" ")}` });
      } else if (!config.enabledTypes.has(type)) {
        ctx.report({ element: rec.id, path: rec.path, msg: `${type} (${meta.spec(type).name}) is not available at adoption level ${config.adoption}`, hint: "raise `adoption` in pds.yaml, or remove the record" });
      } else if (rec.id.length > 70) {
        ctx.report({ element: rec.id, path: rec.path, msg: "id is longer than 70 characters", hint: "a slug is a short mnemonic; the title carries the full name" });
      }
    }
  },

  "SCH-id-file"(ctx) {
    const dir = ctx.config.definitionDir;
    for (const el of ctx.model.all()) {
      const expectFolder = `${dir}/${el.family}/`;
      const base = el.path.split("/").pop();
      if (!el.path.startsWith(expectFolder)) ctx.report({ element: el.id, path: el.path, msg: `${el.type} records live under ${expectFolder}`, hint: `move it to ${expectFolder}${el.id}.md` });
      else if (base !== `${el.id}.md`) ctx.report({ element: el.id, path: el.path, msg: `file name must be ${el.id}.md`, hint: "the id and the file name are the same thing" });
    }
  },

  "SCH-id-unique"(ctx) {
    for (const d of ctx.model.duplicates) ctx.report({ element: d.id, path: d.path, msg: `id ${d.id} is already used by ${d.first}` });
  },

  "SCH-envelope"(ctx) {
    const { meta } = ctx;
    ctx.each(null, (el) => {
      const f = el.front;
      if ("type" in f) ctx.report({ element: el.id, path: el.path, msg: "`type` is not a field: the type is the id prefix", hint: "delete the key" });
      if (typeof f.title !== "string" || !f.title.trim()) ctx.report({ element: el.id, path: el.path, msg: "needs a title" });
      if (f.maturity === undefined) ctx.report({ element: el.id, path: el.path, msg: "needs a maturity; write stub if nothing is defined yet" });
      if (el.type !== "PROD" && f.anchor === undefined) ctx.report({ element: el.id, path: el.path, msg: `needs an anchor: the ${meta.spec(el.type).anchors.join(" or ")} it lives under` });
      const allowed = meta.allowedKeys(el.type);
      for (const k of Object.keys(f)) {
        if (k === "type" || allowed.has(k)) continue;
        ctx.report({ element: el.id, path: el.path, msg: `unknown field ${k} for ${el.type}`, hint: `${el.type} fields: ${[...allowed].join(", ")}` });
      }
    });
  },

  "SCH-field-type"(ctx) {
    const { meta } = ctx;
    ctx.each(null, (el) => {
      for (const [k, v] of Object.entries(el.front)) {
        const spec = meta.fieldSpec(el.type, k);
        if (!spec || v === null) continue;
        if (k === "id" || k === "title") continue;
        for (const msg of checkValue(spec, v, meta)) ctx.report({ element: el.id, path: el.path, msg: `${k}: ${msg}` });
        if (spec.type === "ref" || spec.type === "refs") {
          for (const id of asList(v)) {
            const t = typeof id === "string" ? meta.typeOfId(id) : null;
            if (t && spec.types && !spec.types.includes("*") && !spec.types.includes(t)) ctx.report({ element: el.id, path: el.path, msg: `${k}: ${id} is a ${t}; expected ${spec.types.join(" or ")}` });
          }
        }
      }
    });
  },

  "SCH-anchor"(ctx) {
    const { meta } = ctx;
    ctx.each(null, (el) => {
      const spec = meta.spec(el.type);
      if (el.type === "PROD") {
        if (el.front.anchor !== undefined) ctx.report({ element: el.id, path: el.path, msg: "the product has no anchor: it is the root" });
        return;
      }
      if (typeof el.anchor !== "string") return; // SCH-envelope reports it
      const t = meta.typeOfId(el.anchor);
      if (!t) ctx.report({ element: el.id, path: el.path, msg: `anchor ${el.anchor} is not a known element id` });
      else if (!spec.anchors.includes(t)) ctx.report({ element: el.id, path: el.path, msg: `a ${el.type} cannot live under a ${t}`, hint: `allowed anchors for ${el.type}: ${spec.anchors.join(", ")}` });
    });
  },

  "SCH-singleton"(ctx) {
    const prods = ctx.model.all("PROD");
    if (prods.length === 0 && ctx.model.records.length > 0) ctx.report({ msg: "there is no product record: every definition starts with one PROD" });
    for (const extra of prods.slice(1)) ctx.report({ element: extra.id, path: extra.path, msg: `there can be only one product; ${prods[0].id} already is` });
    for (const type of ctx.meta.types.values()) {
      if (type.code === "PROD" || !type.singleton) continue;
      for (const extra of ctx.model.all(type.code).slice(1)) ctx.report({ element: extra.id, path: extra.path, msg: `there can be only one ${type.name.toLowerCase()}` });
    }
  },

  "SCH-rel-key"(ctx) {
    const { meta } = ctx;
    ctx.each(null, (el) => {
      const rel = el.front.rel;
      if (rel === undefined) return;
      if (!isObj(rel)) return; // SCH-field-type reports the shape
      for (const [name, value] of Object.entries(rel)) {
        const r = meta.relations.get(name);
        if (!r) {
          const fwd = meta.inverseNames.get(name);
          if (fwd) ctx.report({ element: el.id, path: el.path, msg: `rel.${name} is the derived side of ${fwd}`, hint: `write ${fwd} on the other element; both ends are then known` });
          else ctx.report({ element: el.id, path: el.path, msg: `unknown relation ${name}`, hint: `known: ${[...meta.relations.keys()].join(", ")}` });
          continue;
        }
        if (r.derived_only) ctx.report({ element: el.id, path: el.path, msg: `${name} is derived from [[ID]] in the prose and is never written under rel` });
        else if (!r.allow.some((p) => p.from.includes(el.type) || p.from.includes("*")) && r.allow.length) {
          ctx.report({ element: el.id, path: el.path, msg: `a ${el.type} cannot be the source of ${name}`, hint: `sources: ${[...new Set(r.allow.flatMap((p) => p.from))].join(", ")}` });
        } else if (r.allow.some((p) => p.via === "entitlements" && p.from.includes(el.type)) && !r.allow.some((p) => !p.via && p.from.includes(el.type))) {
          ctx.report({ element: el.id, path: el.path, msg: `a plan's grants are written in its \`entitlements\` field, with a value for each` });
        }
        void value;
      }
    });
  },

  "SCH-rel-pair"(ctx) {
    const { meta } = ctx;
    for (const e of ctx.model.edges) {
      if (e.via === "prose" || e.via === "implicit") continue;
      const from = ctx.model.get(e.from);
      const toType = meta.typeOfId(e.to);
      if (!from || !toType) continue; // unknown targets are REF-target's business
      if (from.type && ctx.model.isRetired(e.from)) continue;
      const r = meta.relations.get(e.rel);
      const ok = r.allow.some((p) => {
        if (p.via && e.via === "rel") return false;
        if (!p.from.includes(from.type) && !p.from.includes("*")) return false;
        if (!p.to.includes(toType) && !p.to.includes("*")) return false;
        if (p.same_type && from.type !== toType) return false;
        return true;
      });
      const where = e.via === "rel" ? "" : ` (from ${e.via.replace("block:", "the ").replace("field:", "the field ")}${e.attrs.step ? `, step ${e.attrs.step}` : ""})`;
      if (!ok) {
        const targets = [...new Set(r.allow.filter((p) => p.from.includes(from.type) || p.from.includes("*")).flatMap((p) => p.to))];
        ctx.report({ element: e.from, path: from.path, line: e.line, msg: `${e.rel} ${e.to}${where}: a ${from.type} cannot ${e.rel.replace(/_/g, " ")} a ${toType}`, hint: targets.length ? `${from.type} ${e.rel} can point at: ${targets.join(", ")}` : `${from.type} is not a source of ${e.rel}` });
        continue;
      }
      if (e.via === "rel") {
        for (const [k, v] of Object.entries(e.attrs)) {
          const spec = r.attrs?.[k];
          if (!spec) ctx.report({ element: e.from, path: from.path, msg: `${e.rel} ${e.to}: unknown attribute ${k}`, hint: `attributes: ${Object.keys(r.attrs || {}).join(", ") || "none"}` });
          else for (const msg of checkValue(spec, v, meta)) ctx.report({ element: e.from, path: from.path, msg: `${e.rel} ${e.to}: ${k} ${msg}` });
          if (spec?.values && spec.type === "strings") {
            const bad = asList(v).filter((x) => !spec.values.includes(x));
            if (bad.length) ctx.report({ element: e.from, path: from.path, msg: `${e.rel} ${e.to}: ${k} has ${bad.join(", ")}; allowed ${spec.values.join(", ")}` });
          }
        }
      }
    }
  },

  "SCH-block"(ctx) {
    const { meta } = ctx;
    ctx.each(null, (el) => {
      const spec = meta.spec(el.type);
      const seen = new Set();
      for (const p of el.rec.problems) if (p.id === "SCH-block") ctx.report({ element: el.id, path: el.path, line: p.line, msg: p.msg });
      for (const b of el.rec.blocks) {
        if (!b.name.startsWith("pds-") && b.name !== "gherkin") continue;
        const at = { element: el.id, path: el.path, line: b.line };
        if (!(b.name in spec.blocks)) {
          ctx.report({ ...at, msg: `${b.name} is not a block of ${el.type}`, hint: Object.keys(spec.blocks).length ? `${el.type} blocks: ${Object.keys(spec.blocks).join(", ")}` : `${el.type} has no structured blocks` });
          continue;
        }
        if (seen.has(b.name)) ctx.report({ ...at, msg: `${b.name} appears twice; a record has one` });
        seen.add(b.name);
        if (b.error) {
          ctx.report({ ...at, line: b.error.line || b.line, msg: `${b.name} does not parse: ${b.error.msg}` });
          continue;
        }
        if (b.name === "gherkin") {
          if (!b.text.trim()) ctx.report({ ...at, msg: "gherkin block is empty" });
          continue;
        }
        if (!isObj(b.data)) {
          ctx.report({ ...at, msg: `${b.name} must be a mapping` });
          continue;
        }
        BLOCK_SHAPE[b.name]?.(b.data, (m) => ctx.report({ ...at, msg: `${b.name}: ${m}` }));
      }
    });
  },

  "SCH-section"(ctx) {
    ctx.each(null, (el) => {
      const seen = new Map();
      for (const s of el.rec.sections) {
        if (!s.heading) continue;
        const k = s.heading.toLowerCase();
        if (seen.has(k)) ctx.report({ element: el.id, path: el.path, line: s.line, msg: `heading "${s.heading}" appears twice (first at line ${seen.get(k)})` });
        else seen.set(k, s.line);
      }
    });
  },

  "SCH-summary"(ctx) {
    ctx.each(null, (el) => {
      const s = el.front.summary;
      if (s === undefined || typeof s !== "string") return;
      if (/\n/.test(s.trim())) ctx.report({ element: el.id, path: el.path, msg: "summary must be one line" });
      else if (s.length > 200) ctx.report({ element: el.id, path: el.path, msg: `summary is ${s.length} characters; the limit is 200` });
    });
  },
};
