// Scale. A definition grows to thousands of records, so nothing may be quadratic in their
// number. These tests hold the indexes that keep the analysis linear to what the plain
// scans returned, and fail if the analysis stops scaling.
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { blockingQuestions } from "../lib/coverage.mjs";
import { formatGaps } from "../lib/format.mjs";
import { analyse } from "../lib/lint.mjs";
import { resolveConfig } from "../lib/project.mjs";
import { plan } from "../lib/views/index.mjs";
import { TODAY, addRecord, analyseRoot, copyExample, meta, modelOf, rec } from "./helpers.mjs";

const SATELLITES = ["FLW", "REQ", "RULE", "TST", "SCR", "RISK", "QST"];

/**
 * A product of about `n` records: a spine (a domain per 400 records, a capability per 40, a
 * feature per 8), entities the features access, and satellites of seven kinds, one in seven an
 * open blocking question. The questions are the worst case for the gate that reads them.
 */
function synthetic(n) {
  const { config } = resolveConfig(meta, { pds: 1, name: "Scale", adoption: "full", approvers: ["Pat Reviewer"] });
  const files = new Map();
  const add = (id, front, body = "## Purpose\n\nSynthetic.\n") => files.set(`definition/${meta.familyOf(meta.typeOfId(id))}/${id}.md`, rec({ id, title: id, maturity: "stub", ...front }, body));
  const domains = Math.max(5, Math.round(n / 400));
  const caps = Math.round(n / 40);
  const feats = Math.round(n / 8);
  const ents = Math.round(n / 50);
  add("PROD-scale", { summary: "A synthetic product for measuring the tool." });
  for (let d = 0; d < domains; d++) add(`DOM-d${d}`, { anchor: "PROD-scale" });
  for (let e = 0; e < ents; e++) add(`ENT-e${e}`, { anchor: `DOM-d${e % domains}` });
  for (let c = 0; c < caps; c++) add(`CAP-c${c}`, { anchor: `DOM-d${c % domains}` });
  for (let f = 0; f < feats; f++) add(`FEAT-f${f}`, { anchor: `CAP-c${f % caps}`, rel: { accesses: [`ENT-e${f % ents}`] } });
  for (let i = 0; files.size < n; i++) {
    const kind = SATELLITES[i % SATELLITES.length];
    const feature = `FEAT-f${i % feats}`;
    add(`${kind}-s${i}`, kind === "QST" ? { anchor: feature, status: "open", blocking: true, rel: { concerns: [feature] } } : { anchor: feature });
  }
  return { config, files };
}

const run = ({ config, files }) => analyse({ meta, project: { config, files, problems: [] }, today: TODAY });
/** CPU time, not wall time, so a busy machine does not look like a slow algorithm. */
const cpuMs = (fn) => {
  const t = process.cpuUsage();
  fn();
  const u = process.cpuUsage(t);
  return (u.user + u.system) / 1000;
};
const best = (project) => Math.min(cpuMs(() => run(project)), cpuMs(() => run(project)));

describe("the analysis scales", () => {
  test("a synthetic definition is clean, so the timings measure the work and not error reporting", () => {
    const a = run(synthetic(600));
    assert.equal(a.counts.error, 0, a.findings.slice(0, 3).map((f) => `${f.id} ${f.msg}`).join("\n"));
    assert.equal(a.model.elements.size, 600);
  });

  test("four times the records cost far less than sixteen times the time", (t) => {
    const small = synthetic(2000);
    const large = synthetic(8000);
    best(small); // warm the engine so the small run is not charged for compiling the code
    const tSmall = best(small);
    const tLarge = best(large);
    t.diagnostic(`2000 records ${tSmall.toFixed(0)} ms, 8000 records ${tLarge.toFixed(0)} ms (${(tLarge / tSmall).toFixed(1)}x)`);
    // linear is 4, n log n a little over, quadratic 16: the bound sits between the two
    assert.ok(tLarge / tSmall < 9, `8000 records took ${tLarge.toFixed(0)} ms against ${tSmall.toFixed(0)} ms for 2000: ${(tLarge / tSmall).toFixed(1)}x for 4x the records`);
    assert.ok(tLarge < 20000, `8000 records took ${tLarge.toFixed(0)} ms`);
  });

  // What the analysis returns is read by the views and by the commands that print the queue.
  // Each of those once searched the whole definition for every feature or every gap, which is
  // quadratic and shows only on a definition too big to try by hand.
  test("the views: four times the records cost far less than sixteen times the time", (t) => {
    const small = run(synthetic(2000));
    const large = run(synthetic(8000));
    const cost = (a) => Math.min(...[1, 2, 3, 4].map(() => cpuMs(() => plan(a))));
    plan(small); // warm
    plan(large);
    const tSmall = cost(small);
    const tLarge = cost(large);
    t.diagnostic(`2000 records ${tSmall.toFixed(0)} ms, 8000 records ${tLarge.toFixed(0)} ms (${(tLarge / tSmall).toFixed(1)}x)`);
    // linear is 4 and the search it replaced was 9.7: the bound sits between them
    assert.ok(tLarge / tSmall < 7, `8000 records took ${tLarge.toFixed(0)} ms against ${tSmall.toFixed(0)} ms for 2000: ${(tLarge / tSmall).toFixed(1)}x for 4x the records`);
  });

  test("the queue: four times the gaps cost far less than sixteen times the time", (t) => {
    const small = run(synthetic(2000));
    const large = run(synthetic(8000));
    assert.ok(large.gaps.length > 4 * 1000, `the large definition has gaps to print (${large.gaps.length})`);
    // Ten passes a measurement: one pass is a few milliseconds, which is mostly noise.
    const cost = (a) => Math.min(...[1, 2, 3].map(() => cpuMs(() => { for (let i = 0; i < 10; i++) formatGaps(a.gaps); })));
    cost(small); // warm
    const tSmall = cost(small);
    const tLarge = cost(large);
    t.diagnostic(`${small.gaps.length} gaps ${tSmall.toFixed(0)} ms, ${large.gaps.length} gaps ${tLarge.toFixed(0)} ms for ten passes (${(tLarge / Math.max(tSmall, 1)).toFixed(1)}x)`);
    // linear is 4 and the search it replaced was over 12
    assert.ok(tLarge / Math.max(tSmall, 1) < 8, `${large.gaps.length} gaps took ${tLarge.toFixed(0)} ms against ${tSmall.toFixed(0)} ms for ${small.gaps.length}`);
  });
});

describe("the indexes return what the plain scans did", () => {
  const model = analyseRoot(copyExample()).model;

  test("all(type) is the load-order filter, for one type, several, in any order, or none", () => {
    const naive = (type) => (type ? [...model.elements.values()].filter((e) => [].concat(type).includes(e.type)) : [...model.elements.values()]);
    for (const type of [undefined, "QST", "FEAT", ["CAP", "FEAT"], ["FEAT", "CAP"], ["CAP", "CAP"], ["NOPE"], ["DOM", "ACT", "ENT", "TERM"]]) {
      assert.deepEqual(model.all(type).map((e) => e.id), naive(type).map((e) => e.id), `all(${JSON.stringify(type)})`);
    }
    assert.ok(model.all("FEAT").length > 0);
  });

  test("all(type) hands out a fresh array, so a caller may sort or slice it", () => {
    const before = model.all("FEAT").length;
    model.all("FEAT").length = 0;
    model.all(["CAP", "FEAT"]).reverse();
    assert.equal(model.all("FEAT").length, before);
  });

  test("blocking questions reach what they concern and everything above it, and match a plain scan", () => {
    const root = copyExample();
    const target = [...analyseRoot(root).model.all("SCR")][0];
    assert.ok(target, "the example has a screen to hang a question on");
    addRecord(root, "QST-deep", { title: "Deep", anchor: target.anchor, status: "open", blocking: true, rel: { concerns: [target.id, target.id] } }, "");
    addRecord(root, "QST-quiet", { title: "Quiet", anchor: target.anchor, status: "open", blocking: false, rel: { concerns: [target.id] } }, "");
    addRecord(root, "QST-done", { title: "Done", anchor: target.anchor, status: "answered", blocking: true, answer: "Yes.", rel: { concerns: [target.id] } }, "");
    const m = analyseRoot(root).model;

    const naive = (el) => {
      const out = [];
      for (const q of m.all("QST")) {
        if (m.isRetired(q.id) || m.meta.field(q, "status") !== "open" || m.meta.field(q, "blocking") !== true) continue;
        const targets = m.out(q.id, "concerns").map((e) => e.to);
        if (targets.some((t) => t === el.id || m.ancestors(t).some((a) => a.id === el.id))) out.push(q.id);
      }
      return out;
    };
    for (const el of m.all()) assert.deepEqual(blockingQuestions(m, el), naive(el), el.id);
    const reached = m.all().filter((el) => blockingQuestions(m, el).includes("QST-deep")).map((e) => e.id);
    assert.deepEqual(reached.sort(), [target.id, ...m.ancestors(target.id).map((a) => a.id)].sort());
    assert.ok(m.all().every((el) => !blockingQuestions(m, el).includes("QST-quiet") && !blockingQuestions(m, el).includes("QST-done")));
  });

  test("a model built from a few records keeps the same order the files load in", () => {
    const m = modelOf({ "PROD-p": {}, "DOM-b": { anchor: "PROD-p" }, "DOM-a": { anchor: "PROD-p" }, "CAP-z": { anchor: "DOM-a" } });
    assert.deepEqual(m.all(["CAP", "DOM"]).map((e) => e.id), ["CAP-z", "DOM-a", "DOM-b"], "paths sort before ids: structure/CAP-z, structure/DOM-a, structure/DOM-b");
  });
});
