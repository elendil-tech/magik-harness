// How the command line scales with the size of a definition.
//
//   node scripts/scale/measure.mjs                   1000, 5000 and 20000 records
//   node scripts/scale/measure.mjs --sizes 2000,8000
//   node scripts/scale/measure.mjs --keep DIR        leave the generated projects in DIR
//
// It writes a synthetic product to disk and times each command as a person runs it: a
// process of its own, wall clock, files read from disk. Each is run three times and the
// fastest is reported, because a busy machine only ever makes a run slower; `views`, which
// writes everything the first time, is run once. The product is a spine (a domain
// per 400 records, a capability per 40, a feature per 8), entities the features access, and
// satellites of seven kinds, all stubs, one in seven an open blocking question (the worst
// case for the gate that reads them). It measures the engine, not any particular definition.
//
// Times depend on the machine and are not asserted anywhere. What is asserted, by
// tools/test/scale.test.mjs, is the shape: doubling the records must not quadruple the work.
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { cpus, tmpdir, totalmem } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const PDS = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "tools", "pds.mjs");
const FAMILY = { PROD: "intent", DOM: "structure", CAP: "structure", FEAT: "structure", ENT: "information", FLW: "experience", SCR: "experience", REQ: "behaviour", RULE: "behaviour", TST: "assurance", RISK: "assurance", QST: "change" };
const SATELLITES = ["FLW", "REQ", "RULE", "TST", "SCR", "RISK", "QST"];

function arg(name, fallback) {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? process.argv[i + 1] : fallback;
}

/** Write a product of about `n` records under `out`, and return how many were written. */
function generate(out, n) {
  let made = 0;
  const write = (id, front = {}) => {
    const dir = join(out, "definition", FAMILY[id.split("-")[0]]);
    mkdirSync(dir, { recursive: true });
    const lines = ["---", `id: ${id}`, `title: ${id}`];
    if (front.anchor) lines.push(`anchor: ${front.anchor}`);
    lines.push("maturity: stub");
    if (front.summary) lines.push(`summary: ${front.summary}`);
    if (front.question) lines.push("status: open", "blocking: true");
    for (const [rel, targets] of Object.entries(front.rel ?? {})) lines.push("rel:", `  ${rel}:`, ...targets.map((t) => `    - ${t}`));
    lines.push("---", "", "## Purpose", "", "Synthetic.", "");
    writeFileSync(join(dir, `${id}.md`), lines.join("\n"));
    made++;
  };
  writeFileSync(join(out, "pds.yaml"), "pds: 1\nname: Scale\nadoption: full\napprovers: [Pat Reviewer]\n");
  const domains = Math.max(5, Math.round(n / 400));
  const caps = Math.round(n / 40);
  const feats = Math.round(n / 8);
  const ents = Math.round(n / 50);
  write("PROD-scale", { summary: "A synthetic product for measuring the tool." });
  for (let d = 0; d < domains; d++) write(`DOM-d${d}`, { anchor: "PROD-scale" });
  for (let e = 0; e < ents; e++) write(`ENT-e${e}`, { anchor: `DOM-d${e % domains}` });
  for (let c = 0; c < caps; c++) write(`CAP-c${c}`, { anchor: `DOM-d${c % domains}` });
  for (let f = 0; f < feats; f++) write(`FEAT-f${f}`, { anchor: `CAP-c${f % caps}`, rel: { accesses: [`ENT-e${f % ents}`] } });
  for (let i = 0; made < n; i++) {
    const kind = SATELLITES[i % SATELLITES.length];
    const feature = `FEAT-f${i % feats}`;
    write(`${kind}-s${i}`, kind === "QST" ? { anchor: feature, question: true, rel: { concerns: [feature] } } : { anchor: feature });
  }
  return made;
}

/** Wall-clock milliseconds for the fastest of `runs` runs of the command line. */
function time(root, runs, ...command) {
  let best = { ms: Infinity, status: 0 };
  for (let i = 0; i < runs; i++) {
    const t0 = process.hrtime.bigint();
    const run = spawnSync(process.execPath, [PDS, ...command, "--root", root], { encoding: "utf8", maxBuffer: 1 << 28 });
    const ms = Number(process.hrtime.bigint() - t0) / 1e6;
    if (ms < best.ms) best = { ms, status: run.status };
  }
  return best;
}

const sizes = arg("sizes", "1000,5000,20000").split(",").map(Number);
const keep = arg("keep", null);
const base = keep ?? mkdtempSync(join(tmpdir(), "pds-scale-"));
const COMMANDS = [[3, "lint"], [3, "status"], [3, "next"], [1, "views"], [3, "views", "--check"]];

console.log(`${cpus()[0]?.model ?? "unknown cpu"}, ${cpus().length} cores, ${Math.round(totalmem() / 2 ** 30)} GB, node ${process.version}`);
console.log(["records", ...COMMANDS.map((c) => c.slice(1).join(" "))].map((h, i) => (i ? h.padStart(14) : h.padStart(8))).join(""));
for (const n of sizes) {
  const root = join(base, `p${n}`);
  rmSync(root, { recursive: true, force: true });
  mkdirSync(root, { recursive: true });
  const made = generate(root, n);
  const cells = COMMANDS.map((c) => {
    const { ms, status } = time(root, ...c);
    return `${ms >= 1000 ? `${(ms / 1000).toFixed(1)} s` : `${Math.round(ms)} ms`}${status > 1 ? ` (exit ${status})` : ""}`.padStart(14);
  });
  console.log(String(made).padStart(8) + cells.join(""));
}
if (!keep) rmSync(base, { recursive: true, force: true });
