// New records, written from the meta-model: the front matter a record starts
// with, a heading for every section with its question as a comment, and every
// structured block as a commented example. Nothing here is hand-maintained per
// type; change element-types.yaml and the templates change with it.
import { stringifyYaml } from "./yaml.mjs";

/** The heading each structured block conventionally sits under. */
export const BLOCK_HEADING = {
  "pds-flow": "Steps",
  "pds-states": "States and transitions",
  "pds-attributes": "Attributes",
  "pds-journey": "Stages",
  "pds-payload": "Payload",
  gherkin: "Scenarios",
};

const firstSentence = (s) => String(s).split(/(?<=\.)\s/)[0];
const typeNames = (types) => (!types || types.includes("*") ? "element" : types.join(" or "));
/** Comment text must not close the comment it sits in. */
const safe = (s) => String(s).replace(/-->/g, "--&gt;");

/** A short hint for what a field holds, shown next to the commented-out field. */
export function fieldHint(spec) {
  switch (spec.type) {
    case "enum":
      return spec.values.join(" | ");
    case "bool":
      return "true | false";
    case "int":
      return "a whole number";
    case "number":
      return "a number";
    case "date":
      return "YYYY-MM-DD";
    case "ref":
      return `the id of a ${typeNames(spec.types)}`;
    case "refs":
      return `a list of ${typeNames(spec.types)} ids`;
    case "strings":
      return "a list: [item, item]";
    case "shape":
      return firstSentence(spec.doc || spec.shape);
    default:
      return "text";
  }
}

/** Where a record lives: definition/<family>/<ID>.md */
export function pathFor(meta, config, id) {
  const type = meta.typeOfId(id);
  return `${config.definitionDir}/${meta.familyOf(type)}/${id}.md`;
}

/**
 * Front matter: the few fields a stub needs, then, as comments, every field
 * the ladder asks for later and the rung that asks.
 */
export function frontmatter(meta, type, { id, title, anchor, origin, fields, rel }) {
  const data = { id, title };
  if (anchor) data.anchor = anchor;
  data.maturity = "stub";
  if (origin && origin !== "human") data.origin = origin;
  Object.assign(data, fields || {});
  if (rel) data.rel = rel;

  const spec = meta.spec(type);
  const rungs = meta.ladder;
  const asks = [];
  const consider = (name, s) => {
    if (s.required_at && s.required_at !== "stub" && !(name in data)) asks.push({ name, s });
  };
  consider("summary", meta.envelope.summary);
  for (const [name, s] of Object.entries(spec.fields)) consider(name, s);
  asks.sort((a, b) => rungs.indexOf(a.s.required_at) - rungs.indexOf(b.s.required_at));

  const comments = asks.map(({ name, s }) => `# ${name}: ${fieldHint(s)}   (${s.required_at})`);
  return ["---", stringifyYaml(data).trimEnd(), ...(comments.length ? ["", "# Still to fill in, by the rung that needs it:", ...comments] : []), "---", ""].join("\n");
}

/** The body: a heading and a prompt for every section, a commented example for every block. */
export function body(meta, type, { note } = {}) {
  const spec = meta.spec(type);
  const out = [`<!-- ${safe(spec.name)}: ${safe(spec.summary)}${note ? `\n     ${safe(note)}` : ""}\n     Write under each heading. Comments are ignored, so delete them as you go. -->\n`];
  for (const s of spec.sections) {
    const tags = [s.required_at ? `needed for ${s.required_at}` : null, s.tiers ? `tier ${s.tiers.join(" and ")} only` : null].filter(Boolean).join(", ");
    out.push(`## ${s.heading}\n\n<!-- ${safe(s.ask)}${tags ? ` [${tags}]` : ""} -->\n`);
  }
  for (const [name, b] of Object.entries(spec.blocks || {})) {
    const tags = [b.required_at ? `needed for ${b.required_at}` : null, b.unless ? `not needed for ${Object.entries(b.unless).map(([k, v]) => `${k} ${[].concat(v).join(" or ")}`).join(", ")}` : null].filter(Boolean).join(", ");
    const example = b.example ? `\n\nReplace this comment with a block like:\n\n\`\`\`${name}\n${safe(b.example).trimEnd()}\n\`\`\`` : "";
    out.push(`## ${BLOCK_HEADING[name] || name}\n\n<!--\n${safe(b.doc)}${tags ? ` [${tags}]` : ""}${example}\n-->\n`);
  }
  return out.join("\n");
}

/** A complete new record, ready to write to disk. */
export function renderRecord(meta, type, opts) {
  return frontmatter(meta, type, opts) + "\n" + body(meta, type, opts);
}
