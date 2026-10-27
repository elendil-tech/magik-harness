// The skeleton a profile starts a project with: seeds in, stub records out.
import { ID_RE } from "./records.mjs";
import { checkValue } from "./shapes.mjs";

const isObj = (v) => v && typeof v === "object" && !Array.isArray(v);
const asList = (v) => (v === undefined || v === null ? [] : Array.isArray(v) ? v : [v]);
const SEED_KEYS = ["id", "title", "anchor", "module", "fields", "rel", "note"];

/** A name as an id slug: "Ledgerly Pro" -> "ledgerly-pro". */
export function slugify(text) {
  return String(text)
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/**
 * Which seeds a project gets. A seed is written when its module and its element
 * type are enabled and the element it anchors on is written too.
 * @returns {{seeds: object[], skipped: {id: string, reason: string}[]}}
 */
export function expandSeeds(meta, config, patterns, { productId }) {
  const written = new Map();
  const skipped = [];
  for (const seed of asList(patterns?.seeds)) {
    const type = meta.typeOfId(seed.id);
    const module = seed.module || "core";
    if (!config.modules.has(module)) {
      skipped.push({ id: seed.id, reason: `module ${module} is not enabled` });
      continue;
    }
    if (!config.enabledTypes.has(type)) {
      skipped.push({ id: seed.id, reason: `${meta.spec(type).name} is not part of the ${config.adoption} adoption level` });
      continue;
    }
    const anchor = seed.anchor === "@product" ? productId : seed.anchor;
    if (anchor !== productId && !written.has(anchor)) {
      skipped.push({ id: seed.id, reason: `${anchor} is not written` });
      continue;
    }
    written.set(seed.id, { ...seed, type, anchor });
  }
  for (const s of written.values()) {
    if (!s.rel) continue;
    const rel = {};
    for (const [name, targets] of Object.entries(s.rel)) {
      const kept = asList(targets).filter((t) => written.has(t));
      if (kept.length) rel[name] = kept;
    }
    s.rel = Object.keys(rel).length ? rel : undefined;
  }
  return { seeds: [...written.values()], skipped };
}

/** Problems with a patterns file, checked against the live meta-model. */
export function validatePatterns(meta, patterns) {
  const problems = [];
  const bad = (m) => problems.push(m);
  if (!patterns || !Array.isArray(patterns.seeds)) return ["patterns needs a seeds list"];
  const ids = new Map();
  patterns.seeds.forEach((s, i) => {
    const w = isObj(s) && typeof s.id === "string" ? s.id : `seed ${i + 1}`;
    if (!isObj(s)) return bad(`${w}: must be a mapping`);
    for (const k of Object.keys(s)) if (!SEED_KEYS.includes(k)) bad(`${w}: unknown key ${k}`);
    if (typeof s.id !== "string" || !ID_RE.test(s.id)) return bad(`${w}: id must look like TYPE-slug`);
    const type = meta.typeOfId(s.id);
    if (!type) return bad(`${w}: unknown type prefix`);
    if (ids.has(s.id)) bad(`${w}: appears twice`);
    ids.set(s.id, { type, index: i });
    if (typeof s.title !== "string" || !s.title.trim()) bad(`${w}: needs a title`);
    if (s.module && !meta.modules[s.module]) bad(`${w}: unknown module ${s.module}`);
    if (meta.spec(type).singleton && patterns.seeds.filter((x) => meta.typeOfId(x?.id) === type).length > 1) bad(`${w}: ${type} is a singleton`);

    if (typeof s.anchor !== "string") bad(`${w}: needs an anchor`);
    else if (s.anchor !== "@product") {
      const a = ids.get(s.anchor);
      if (!a) bad(`${w}: anchor ${s.anchor} must be an earlier seed or "@product"`);
      else if (!meta.spec(type).anchors.includes(a.type) && !meta.spec(type).anchors.includes("*")) bad(`${w}: a ${type} cannot be anchored on a ${a.type} (allowed: ${meta.spec(type).anchors.join(", ")})`);
    } else if (!meta.spec(type).anchors.includes("PROD")) bad(`${w}: a ${type} cannot be anchored on the product`);

    for (const [name, value] of Object.entries(s.fields || {})) {
      const spec = meta.fieldSpec(type, name);
      if (!spec) bad(`${w}: ${type} has no field ${name}`);
      else for (const p of checkValue(spec, value, meta)) bad(`${w}.${name}: ${p}`);
    }
  });
  for (const s of patterns.seeds) {
    if (!isObj(s) || !ids.has(s.id)) continue;
    const from = ids.get(s.id).type;
    for (const [name, targets] of Object.entries(s.rel || {})) {
      const rel = meta.relations.get(name);
      if (!rel) {
        bad(`${s.id}: unknown relation ${name}`);
        continue;
      }
      for (const t of asList(targets)) {
        const to = ids.get(t);
        if (!to) bad(`${s.id}: ${name} points at ${t}, which is not a seed`);
        else if (!rel.allow.some((p) => (p.from.includes("*") || p.from.includes(from)) && (p.to.includes("*") || p.to.includes(to.type)))) bad(`${s.id}: ${name} from ${from} to ${to.type} is not allowed`);
      }
    }
  }
  return problems;
}
