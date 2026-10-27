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

/**
 * CPU time and not wall time, so that a busy machine does not look like a slow algorithm. It counts the
 * engine's helper threads (the compiler and the collector) as well, which is why every measurement below
 * runs the work a few times first.
 */
const cpuMs = (fn) => {
  const t = process.cpuUsage();
  fn();
  const u = process.cpuUsage(t);
  return (u.user + u.system) / 1000;
};

/** The two sizes: a definition and one eight times as big. Linear work costs eight times as much, a scan of everything for each thing sixty-four. */
const SMALL = 1000;
const LARGE = 8000;
/**
 * Where the line sits for each piece of work, between what the code costs and what the scans it once
 * had cost. Linear work measures 5 to 11 here (a little over 8 when the memory it touches no longer fits
 * in the cache), and printing the queue up to 17. The scans measured 42 for the views and 69 for the
 * queue, and the maturity computation of an earlier version, which cost 15 times as much for 4 times the
 * records, would have measured about 60.
 */
const BOUND = { analysis: 20, views: 20, queue: 32 };

const memo = (make) => {
  const made = new Map();
  return (n) => (made.has(n) ? made.get(n) : made.set(n, make(n)).get(n));
};
const projectOf = memo(synthetic);
const analysisOf = memo((n) => run(projectOf(n)));

/**
 * What `work` costs on a small and on a large input, and the ratio of the two. The runs alternate and the
 * best of each is kept: a slow moment adds time to a run and never takes any away, and a machine whose pace
 * changes during the measurement then changes both sides.
 */
function growth(work, small, large, rounds = 5) {
  for (let i = 0; i < 2; i++) {
    work(small);
    work(large);
  }
  let a = Infinity;
  let b = Infinity;
  for (let i = 0; i < rounds; i++) {
    a = Math.min(a, cpuMs(() => work(small)));
    b = Math.min(b, cpuMs(() => work(large)));
  }
  return { small: a, large: b, ratio: b / Math.max(a, 0.5) };
}

/**
 * Passes when the work grows by less than `bound` for the size the large input is. A timing is noisy
 * where a complexity is not: a regression to scanning everything for each thing fails every attempt by a
 * wide margin, and a noisy attempt does not, so a miss is tried again, twice, before it counts.
 */
function assertScales(t, what, bound, work, small, large) {
  const seen = [];
  for (let attempt = 1; attempt <= 3; attempt++) {
    const g = growth(work, small, large);
    seen.push(g);
    t.diagnostic(`${what}: ${g.small.toFixed(0)} ms for ${SMALL} records, ${g.large.toFixed(0)} ms for ${LARGE} (${g.ratio.toFixed(1)}x for ${LARGE / SMALL}x the records)`);
    if (g.ratio < bound) return g;
  }
  assert.fail(`${what} cost ${seen.map((g) => `${g.ratio.toFixed(1)}x`).join(", ")} for ${LARGE / SMALL}x the records, three times over; linear work costs about ${LARGE / SMALL}x and a scan of everything for each thing ${(LARGE / SMALL) ** 2}x`);
}

describe("the analysis scales", () => {
  test("a synthetic definition is clean, so the timings measure the work and not error reporting", () => {
    const a = analysisOf(600);
    assert.equal(a.counts.error, 0, a.findings.slice(0, 3).map((f) => `${f.id} ${f.msg}`).join("\n"));
    assert.equal(a.model.elements.size, 600);
  });

  test("eight times the records cost far less than sixty-four times the time", (t) => {
    const g = assertScales(t, "the analysis", BOUND.analysis, run, projectOf(SMALL), projectOf(LARGE));
    assert.ok(g.large < 20000, `${LARGE} records took ${g.large.toFixed(0)} ms`);
  });

  // What the analysis returns is read by the views and by the commands that print the queue.
  // Each of those once searched the whole definition for every feature or every gap, which is
  // quadratic and shows only on a definition too big to try by hand.
  test("the views: eight times the records cost far less than sixty-four times the time", (t) => {
    assertScales(t, "the views", BOUND.views, (a) => plan(a), analysisOf(SMALL), analysisOf(LARGE));
  });

  test("the queue: eight times the gaps cost far less than sixty-four times the time", (t) => {
    const small = analysisOf(SMALL);
    const large = analysisOf(LARGE);
    assert.ok(large.gaps.length > 8 * 1000, `the large definition has gaps to print (${large.gaps.length})`);
    // Ten passes a measurement: one pass is a few milliseconds, which is mostly noise.
    assertScales(t, `the queue (${small.gaps.length} and ${large.gaps.length} gaps)`, BOUND.queue, (a) => { for (let i = 0; i < 10; i++) formatGaps(a.gaps); }, small, large);
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
