// Impact analysis: what must be reviewed, and what should be, when an element changes.
// The rules under test: containment (what is anchored on the changed element changes
// with it), strength (a path is as strong as its weakest edge), reach (strong links
// are followed further than weak ones), and silence (retired elements, unrelated ones).
import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { LEDGERLY, copyExample, editFront, modelOf, pds, meta } from "./helpers.mjs";
import { describePath, impactOf } from "../lib/impact.mjs";

/**
 * A small product with one of everything the walk treats differently:
 *
 *   PROD-p > DOM-d > CAP-c > FEAT-f > FLW-f1, SCR-s, TST-t, RISK-k
 *   ENT-e and RULE-r sit beside, under the domain and the capability
 *   FEAT-f governed_by RULE-r; FLW-f1 accesses ENT-e; TST-t verifies RULE-r
 */
const graph = (extra = {}) =>
  modelOf({
    "PROD-p": {},
    "DOM-d": { anchor: "PROD-p" },
    "CAP-c": { anchor: "DOM-d" },
    "FEAT-f": { anchor: "CAP-c", rel: { governed_by: ["RULE-r"] } },
    "FLW-f1": { anchor: "FEAT-f", rel: { accesses: ["ENT-e"] } },
    "SCR-s": { anchor: "FEAT-f" },
    "TST-t": { anchor: "FEAT-f", rel: { verifies: ["RULE-r"] } },
    "RISK-k": { anchor: "FEAT-f" },
    "ENT-e": { anchor: "DOM-d" },
    "RULE-r": { anchor: "CAP-c" },
    ...extra,
  });

const ids = (result, strength) => result.reached.filter((r) => !strength || r.strength === strength).map((r) => r.id).sort();

describe("what is inside the thing that changed", () => {
  const m = graph();

  test("changing a feature means reviewing everything anchored on it", () => {
    const r = impactOf(m, "FEAT-f");
    assert.deepEqual(ids(r, "strong"), ["FLW-f1", "RISK-k", "SCR-s", "TST-t"]);
  });

  test("and the thing it sits in, and the rules that govern it, should be looked at", () => {
    const r = impactOf(m, "FEAT-f");
    assert.deepEqual(ids(r, "weak"), ["CAP-c", "RULE-r"]);
  });

  test("but not what is two steps away through a weak link", () => {
    const r = impactOf(m, "FEAT-f");
    assert.ok(!ids(r).includes("DOM-d"), "the domain is the anchor of the anchor");
    assert.ok(!ids(r).includes("ENT-e"), "the data a flow inside the feature touches is one weak hop too far");
    assert.ok(!ids(r).includes("PROD-p"));
  });

  test("changing the product reaches what contains it, down the spine, within the strong reach", () => {
    const r = impactOf(m, "PROD-p");
    assert.deepEqual(ids(r, "strong"), ["CAP-c", "DOM-d", "ENT-e"]);
    assert.ok(!ids(r).includes("FEAT-f"), "three levels down is beyond two strong hops");
  });
});

describe("what merely touches the thing that changed", () => {
  const m = graph();

  test("a change to a rule reaches what is governed by it and what verifies it, and not everything inside", () => {
    const r = impactOf(m, "RULE-r");
    assert.deepEqual(ids(r, "strong"), ["FEAT-f", "TST-t"]);
    for (const inner of ["FLW-f1", "SCR-s", "RISK-k"]) assert.ok(!ids(r).includes(inner), `${inner} is inside a feature the rule merely governs`);
  });

  test("the feature reached that way is a neighbour, so what it contains is at most weak, and weak does not travel two steps", () => {
    const r = impactOf(m, "RULE-r", { weakHops: 2 });
    for (const inner of ["FLW-f1", "SCR-s", "RISK-k"]) {
      const hit = r.reached.find((x) => x.id === inner);
      assert.equal(hit?.strength, "weak", inner);
      assert.equal(hit.hops, 2);
    }
  });

  test("the strength of a path is its weakest edge", () => {
    const r = impactOf(m, "ENT-e", { weakHops: 3, strongHops: 3 });
    const flow = r.reached.find((x) => x.id === "FLW-f1");
    assert.equal(flow.strength, "strong", "the flow accesses the entity: strong");
    const feat = r.reached.find((x) => x.id === "FEAT-f");
    assert.equal(feat.strength, "weak", "through the flow, up the spine: strong then weak is weak");
    assert.deepEqual(feat.path.map((s) => `${s.from}>${s.to}`), ["ENT-e>FLW-f1", "FLW-f1>FEAT-f"]);
  });

  test("a strong link after a weak one does not make the path strong", () => {
    // FEAT-f is governed by RULE-r (weak towards the rule), and TST-u verifies RULE-r (strong towards the test):
    // a change to the feature should not send anyone to a test that sits two steps away behind the rule
    const m = graph({ "TST-u": { anchor: "PROD-p", rel: { verifies: ["RULE-r"] } } });
    assert.ok(!ids(impactOf(m, "FEAT-f")).includes("TST-u"));
    const wide = impactOf(m, "FEAT-f", { weakHops: 2 }).reached.find((x) => x.id === "TST-u");
    assert.equal(wide.strength, "weak");
    assert.equal(wide.hops, 2);
    assert.deepEqual(wide.path.map((s) => s.rel), ["governed_by", "verifies"]);
  });

  test("an element nothing connects to is never reached", () => {
    const lone = graph({ "RULE-lonely": { anchor: "PROD-p" } });
    assert.ok(!ids(impactOf(lone, "FEAT-f")).includes("RULE-lonely"));
    assert.deepEqual(impactOf(lone, "RULE-lonely").reached.map((r) => r.id).sort(), ["PROD-p"], "only the anchor, as a weak link");
    assert.equal(impactOf(lone, "RULE-lonely").reached[0].strength, "weak");
  });
});

describe("how far each kind of link carries", () => {
  // each depends on the next; a dependency is a strong link towards whoever depends
  const chain = modelOf({
    "FEAT-a": { rel: { depends_on: ["FEAT-b"] } },
    "FEAT-b": { rel: { depends_on: ["FEAT-c"] } },
    "FEAT-c": { rel: { depends_on: ["FEAT-d"] } },
    "FEAT-d": {},
  });

  test("a strong link is followed for strong_hops and no further", () => {
    assert.equal(meta.impactConfig.strong_hops, 2);
    assert.deepEqual(ids(impactOf(chain, "FEAT-d")), ["FEAT-b", "FEAT-c"]);
  });

  test("the limits are the caller's to change", () => {
    assert.deepEqual(ids(impactOf(chain, "FEAT-d", { strongHops: 3 })), ["FEAT-a", "FEAT-b", "FEAT-c"]);
    assert.deepEqual(ids(impactOf(chain, "FEAT-d", { strongHops: 1 })), ["FEAT-c"]);
    assert.deepEqual(ids(impactOf(chain, "FEAT-d", { strongHops: 0 })), []);
  });

  test("a weak link is followed for weak_hops, which is one by default", () => {
    assert.equal(meta.impactConfig.weak_hops, 1);
    const m = graph();
    assert.ok(!ids(impactOf(m, "ENT-e")).includes("FEAT-f"));
    assert.ok(ids(impactOf(m, "ENT-e", { weakHops: 2 })).includes("FEAT-f"));
  });

  test("raising one limit does not change what the other kind of link reaches", () => {
    const m = graph();
    assert.deepEqual(ids(impactOf(m, "FEAT-f", { strongHops: 5 }), "weak"), ids(impactOf(m, "FEAT-f"), "weak"));
  });

  test("a cycle terminates, and every element is reported once", () => {
    const loop = modelOf({ "FEAT-a": { rel: { depends_on: ["FEAT-b"] } }, "FEAT-b": { rel: { depends_on: ["FEAT-a"] } } });
    const r = impactOf(loop, "FEAT-a", { strongHops: 10, weakHops: 10 });
    assert.deepEqual(ids(r), ["FEAT-b"]);
  });

  test("the strongest way of reaching an element is the one reported", () => {
    // FEAT-f is reached weakly through the anchor, and strongly through a dependency
    const m = graph({ "FEAT-g": { anchor: "CAP-c", rel: { depends_on: ["FEAT-f"] } } });
    const r = impactOf(m, "FEAT-f", { weakHops: 2 });
    const g = r.reached.find((x) => x.id === "FEAT-g");
    assert.equal(g.strength, "strong");
    assert.equal(g.hops, 1);
    assert.deepEqual(g.path.map((s) => s.rel), ["depends_on"]);
  });
});

describe("what the answer looks like", () => {
  const m = graph();

  test("strong before weak, then nearer before further, then by type and id", () => {
    const r = impactOf(m, "FEAT-f");
    const order = r.reached.map((x) => `${x.strength}:${x.hops}:${x.type}:${x.id}`);
    assert.deepEqual(order, [
      "strong:1:FLW:FLW-f1", "strong:1:RISK:RISK-k", "strong:1:SCR:SCR-s", "strong:1:TST:TST-t",
      "weak:1:CAP:CAP-c", "weak:1:RULE:RULE-r",
    ]);
  });

  test("names the element that changed, and never lists it among what it reaches", () => {
    const r = impactOf(m, "FEAT-f");
    assert.deepEqual(r.start, { id: "FEAT-f", type: "FEAT", title: "FEAT-f" });
    assert.ok(!ids(r).includes("FEAT-f"));
  });

  test("gives the same answer every time", () => {
    assert.deepEqual(impactOf(m, "FEAT-f"), impactOf(graph(), "FEAT-f"));
  });

  test("says who owns what is affected: the features and capabilities a person can reason about", () => {
    const r = impactOf(m, "RULE-r");
    assert.deepEqual(r.owners.map((o) => `${o.id}:${o.strength}`), ["CAP-c:strong", "FEAT-f:strong"]);
    const down = impactOf(m, "FLW-f1");
    assert.deepEqual(down.owners.map((o) => `${o.id}:${o.strength}`), ["FEAT-f:strong"], "a flow is owned by its feature; the data it touches belongs to no feature");
    assert.deepEqual(impactOf(m, "FEAT-f").owners.map((o) => `${o.id}:${o.strength}`), ["CAP-c:weak"], "a feature is not its own blast radius, but the capability around it is in it");
  });

  test("an element with no feature or capability above it has no owner to name", () => {
    const loose = modelOf({ "DOM-x": {}, "ENT-y": { anchor: "DOM-x" } });
    assert.deepEqual(impactOf(loose, "ENT-y").owners, []);
  });

  test("describes a path as a sentence a person can check", () => {
    const r = impactOf(graph(), "ENT-e", { weakHops: 2 });
    assert.equal(describePath(r.reached.find((x) => x.id === "FLW-f1").path), "ENT-e ←accesses— FLW-f1");
    assert.equal(describePath(r.reached.find((x) => x.id === "FEAT-f").path), "ENT-e ←accesses— FLW-f1 is part of FEAT-f");
    assert.equal(describePath(impactOf(graph(), "FEAT-f").reached.find((x) => x.id === "FLW-f1").path), "FEAT-f contains FLW-f1");
    assert.equal(describePath(impactOf(graph(), "FEAT-f").reached.find((x) => x.id === "RULE-r").path), "FEAT-f —governed_by→ RULE-r");
    assert.equal(describePath([]), "");
  });

  test("an element that does not exist is an error, not an empty answer", () => {
    assert.throws(() => impactOf(m, "FEAT-nope"), /no element FEAT-nope/);
  });
});

describe("what is not counted", () => {
  test("a retired element is never reached, and does not carry the walk past itself", () => {
    const m = graph({ "FLW-f1": { anchor: "FEAT-f", lifecycle: "retired", rel: { accesses: ["ENT-e"] } } });
    assert.ok(!ids(impactOf(m, "FEAT-f")).includes("FLW-f1"));
    assert.ok(!ids(impactOf(m, "ENT-e"), "strong").includes("FLW-f1"));
  });

  test("a reference to an element that is not there does not stop the walk", () => {
    const m = graph({ "FEAT-f": { anchor: "CAP-c", rel: { governed_by: ["RULE-r", "RULE-ghost"] } } });
    const r = impactOf(m, "FEAT-f");
    assert.ok(ids(r).includes("RULE-r"));
    assert.ok(!ids(r).includes("RULE-ghost"));
  });
});

describe("pds impact", () => {
  test("says what must be reviewed and what should be, with the reason for each", async () => {
    const r = await pds(["impact", "RULE-invoice-total"], { cwd: LEDGERLY });
    assert.equal(r.code, 0);
    assert.match(r.out, /^A change to RULE-invoice-total \(How an invoice total is calculated\) reaches 6 elements, owned by 2 features and capabilities\./);
    assert.match(r.out, /Must review \(4\)\n {2}FEAT-send-invoice {2}Send an invoice\n {6}RULE-invoice-total ←governed_by— FEAT-send-invoice/);
    assert.match(r.out, /Should review \(2\)\n {2}CAP-invoicing {2}Invoicing\n {6}RULE-invoice-total is part of CAP-invoicing/);
    assert.match(r.out, /Who owns what is affected\n {2}CAP-invoicing +Invoicing +strong\n {2}FEAT-send-invoice +Send an invoice +strong/);
  });

  test("gives the same answer as JSON, for a tool to use", async () => {
    const r = await pds(["impact", "RULE-invoice-total", "--json"], { cwd: LEDGERLY });
    assert.equal(r.code, 0);
    const data = JSON.parse(r.out);
    assert.deepEqual(Object.keys(data), ["start", "reached", "owners"]);
    assert.equal(data.start.id, "RULE-invoice-total");
    assert.equal(data.reached.length, 6);
    assert.deepEqual(data.reached.map((x) => x.strength), ["strong", "strong", "strong", "strong", "weak", "weak"]);
    assert.ok(data.reached.every((x) => x.id && x.type && x.title && x.hops >= 1 && Array.isArray(x.path)));
  });

  test("--strong-hops and --weak-hops change how far it looks", async () => {
    const count = async (...flags) => JSON.parse((await pds(["impact", "RULE-invoice-total", "--json", ...flags], { cwd: LEDGERLY })).out).reached.length;
    const normal = await count();
    assert.equal(await count("--weak-hops", "0"), normal - 2, "without weak links, the anchor and the obligation drop out");
    assert.ok((await count("--strong-hops", "1")) < normal, "one strong hop leaves out the test two steps away");
    assert.ok((await count("--strong-hops", "4", "--weak-hops", "4")) > normal, "the wider the net, the more it catches");
    assert.equal(await count("--strong-hops", "0", "--weak-hops", "0"), 0);
  });

  test("a feature's change reaches everything inside it, so the answer is long and says so", async () => {
    const data = JSON.parse((await pds(["impact", "FEAT-send-invoice", "--json"], { cwd: LEDGERLY })).out);
    assert.equal(data.reached.filter((x) => x.strength === "strong").length, 13);
    assert.ok(data.reached.filter((x) => x.strength === "strong").every((x) => x.path.length === 1 && x.path[0].rel === "anchor" && x.path[0].dir === "down"));
  });

  test("suggests the nearest element when the id is mistyped, and asks for one when there is none", async () => {
    const typo = await pds(["impact", "RULE-invoice-totl"], { cwd: LEDGERLY });
    assert.equal(typo.code, 2);
    assert.match(typo.err, /no element RULE-invoice-totl; did you mean RULE-invoice-total\?/);
    const none = await pds(["impact"], { cwd: LEDGERLY });
    assert.equal(none.code, 2);
    assert.match(none.err, /impact needs an element id, for example: pds impact ENT-invoice/);
  });

  test("a retired element in the worked example drops out of the answer", async () => {
    const root = copyExample();
    editFront(root, "TST-invoice-total", (f) => (f.lifecycle = "retired"));
    const data = JSON.parse((await pds(["impact", "RULE-invoice-total", "--json"], { cwd: root })).out);
    assert.ok(!data.reached.some((x) => x.id === "TST-invoice-total"));
    assert.equal(data.reached.length, 5);
  });
});
