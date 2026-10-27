// Value checks for field types and the named structured shapes. Each function
// returns a list of plain-language problems; an empty list means the value is fine.
import { ID_RE } from "./records.mjs";

const isObj = (v) => v && typeof v === "object" && !Array.isArray(v);

export const LINK_KINDS = ["design", "ticket", "code", "doc", "contract", "research", "other"];
export const EXAMPLE_CASES = ["positive", "negative", "edge"];
export const PRICE_MODELS = ["free", "flat", "per_seat", "usage", "tiered", "custom"];
export const PRICE_INTERVALS = ["monthly", "quarterly", "yearly", "once", "usage"];

export function isDate(v) {
  if (typeof v !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return false;
  const d = new Date(v + "T00:00:00Z");
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v;
}

function unknownKeys(v, allowed, where) {
  return Object.keys(v)
    .filter((k) => !allowed.includes(k))
    .map((k) => `${where}: unknown key ${k}`);
}

const SHAPE_CHECKS = {
  price(v) {
    if (!isObj(v)) return ["must be a mapping {model, amount, currency, interval}"];
    const p = unknownKeys(v, ["model", "amount", "currency", "interval"], "price");
    if (v.model !== undefined && !PRICE_MODELS.includes(v.model)) p.push(`price.model must be one of ${PRICE_MODELS.join(", ")}`);
    if (v.amount !== undefined && !(typeof v.amount === "number" && v.amount >= 0)) p.push("price.amount must be a number of zero or more");
    if (v.currency !== undefined && !/^[A-Z]{3}$/.test(String(v.currency))) p.push("price.currency must be a three-letter code such as EUR");
    if (v.interval !== undefined && !PRICE_INTERVALS.includes(v.interval)) p.push(`price.interval must be one of ${PRICE_INTERVALS.join(", ")}`);
    return p;
  },
  examples(v) {
    if (!Array.isArray(v)) return ["must be a list of {case, given, then}"];
    const p = [];
    v.forEach((x, i) => {
      if (!isObj(x)) return p.push(`examples[${i}] must be a mapping`);
      p.push(...unknownKeys(x, ["case", "given", "then", "note"], `examples[${i}]`));
      if (!EXAMPLE_CASES.includes(x.case)) p.push(`examples[${i}].case must be one of ${EXAMPLE_CASES.join(", ")}`);
      for (const k of ["given", "then"]) if (typeof x[k] !== "string" || !x[k].trim()) p.push(`examples[${i}].${k} is required`);
    });
    return p;
  },
  entitlements(v) {
    if (!Array.isArray(v)) return ["must be a list of {entl, value}"];
    const p = [];
    v.forEach((x, i) => {
      if (!isObj(x)) return p.push(`entitlements[${i}] must be a mapping`);
      p.push(...unknownKeys(x, ["entl", "value"], `entitlements[${i}]`));
      if (typeof x.entl !== "string" || !ID_RE.test(x.entl)) p.push(`entitlements[${i}].entl must be an entitlement id`);
      if (x.value === undefined) p.push(`entitlements[${i}].value is required`);
    });
    return p;
  },
  links(v) {
    if (!Array.isArray(v)) return ["must be a list of {kind, uri}"];
    const p = [];
    v.forEach((x, i) => {
      if (!isObj(x)) return p.push(`links[${i}] must be a mapping`);
      p.push(...unknownKeys(x, ["kind", "uri", "note"], `links[${i}]`));
      if (!LINK_KINDS.includes(x.kind)) p.push(`links[${i}].kind must be one of ${LINK_KINDS.join(", ")}`);
      if (typeof x.uri !== "string" || !x.uri.trim()) p.push(`links[${i}].uri is required`);
    });
    return p;
  },
  facets(v, meta) {
    if (!isObj(v)) return ["must be a mapping of facet: true or false"];
    const p = [];
    for (const [k, x] of Object.entries(v)) {
      if (!meta.facets[k]) p.push(`unknown facet ${k}`);
      else if (typeof x !== "boolean") p.push(`facet ${k} must be true or false`);
    }
    return p;
  },
  probes(v) {
    if (!isObj(v)) return ["must be a mapping of probe: disposition"];
    return Object.entries(v)
      .filter(([, d]) => !isObj(d))
      .map(([k]) => `probe ${k} needs a disposition mapping: {addressed: [...]}, {na: reason} or {deferred: reason, until: ...}`);
  },
  approval(v, meta) {
    if (!isObj(v)) return ["must be a mapping {state, by, at, hash}"];
    const p = unknownKeys(v, ["state", "by", "at", "hash", "note"], "approval");
    if (!meta.model.approval.includes(v.state)) p.push(`approval.state must be one of ${meta.model.approval.join(", ")}`);
    if (v.by !== undefined && typeof v.by !== "string") p.push("approval.by must be a name");
    if (v.at !== undefined && !isDate(v.at)) p.push("approval.at must be a date (YYYY-MM-DD)");
    if (v.hash !== undefined && !/^sha256:[0-9a-f]{16}$/.test(String(v.hash))) p.push("approval.hash must look like sha256:0123456789abcdef");
    return p;
  },
  rel(v) {
    if (!isObj(v)) return ["must be a mapping of relation: targets"];
    const p = [];
    for (const [name, list] of Object.entries(v)) {
      const items = Array.isArray(list) ? list : [list];
      items.forEach((x, i) => {
        if (typeof x === "string") return;
        if (isObj(x) && typeof x.to === "string") return;
        p.push(`rel.${name}[${i}] must be an id, or a mapping with a \`to\` id`);
      });
    }
    return p;
  },
};

/** Check one field value against its spec. Returns a list of problems. */
export function checkValue(spec, v, meta) {
  const t = spec.type;
  const bad = (msg) => [msg];
  switch (t) {
    case "string":
      return typeof v === "string" ? [] : bad("must be text");
    case "text":
      return typeof v === "string" ? [] : bad("must be text");
    case "int":
      return Number.isInteger(v) ? [] : bad("must be a whole number");
    case "number":
      return typeof v === "number" ? [] : bad("must be a number");
    case "bool":
      return typeof v === "boolean" ? [] : bad("must be true or false");
    case "date":
      return isDate(v) ? [] : bad("must be a date written YYYY-MM-DD");
    case "enum":
      return (spec.values || []).map(String).includes(String(v)) ? [] : bad(`must be one of ${spec.values.join(", ")}`);
    case "ref":
      return typeof v === "string" && ID_RE.test(v) ? [] : bad("must be an element id such as FEAT-send-invoice");
    case "refs":
      return Array.isArray(v) && v.every((x) => typeof x === "string" && ID_RE.test(x)) ? [] : bad("must be a list of element ids");
    case "strings":
      return Array.isArray(v) && v.every((x) => typeof x === "string") ? [] : bad("must be a list of text values");
    case "any":
      return [];
    case "shape":
      return SHAPE_CHECKS[spec.shape](v, meta);
    default:
      return [];
  }
}
