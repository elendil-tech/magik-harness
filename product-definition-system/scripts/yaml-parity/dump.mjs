// Prints, as JSON, every YAML source in this package together with what our parser makes of it:
// each record's front matter, each structured block, the meta-model files, the project file and the
// examples the templates offer. compare.py reads it and asks PyYAML the same question.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { parseYaml } from "../../tools/lib/yaml.mjs";
import { readRecord, splitFrontmatter } from "../../tools/lib/records.mjs";
import { DEFAULT_META_DIR, loadMeta } from "../../tools/lib/metamodel.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const walk = (d) => readdirSync(d).flatMap((f) => (statSync(join(d, f)).isDirectory() ? walk(join(d, f)) : [join(d, f)]));
const out = [];
const add = (key, source) => {
  let parsed = null;
  let error = null;
  try {
    parsed = parseYaml(source);
  } catch (e) {
    error = e.message;
  }
  out.push({ key, source, parsed, error });
};

for (const f of walk(join(ROOT, "examples")).filter((f) => f.endsWith(".md") && f.includes("/definition/"))) {
  const text = readFileSync(f, "utf8");
  add(`${relative(ROOT, f)}#front`, splitFrontmatter(text).front);
  readRecord(f, text).blocks.filter((b) => b.name.startsWith("pds-")).forEach((b, i) => add(`${relative(ROOT, f)}#${b.name}${i}`, b.text));
}
for (const f of walk(DEFAULT_META_DIR).filter((f) => f.endsWith(".yaml"))) add(relative(ROOT, f), readFileSync(f, "utf8"));
for (const f of walk(join(ROOT, "examples")).filter((f) => f.endsWith("pds.yaml"))) add(relative(ROOT, f), readFileSync(f, "utf8"));
const meta = loadMeta(DEFAULT_META_DIR);
for (const [t, s] of meta.types) for (const [n, b] of Object.entries(s.blocks || {})) if (n.startsWith("pds-") && b.example) add(`template:${t}.${n}`, b.example);

process.stdout.write(JSON.stringify(out));
