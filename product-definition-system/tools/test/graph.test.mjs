// The graph: how records become elements and edges, and what is derived from
// them (inverses, tiers, facets). Built in memory from a few records each time.
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { modelOf, rec } from "./helpers.mjs";

const spine = {
  "PROD-p": { title: "P" },
  "DOM-d": { anchor: "PROD-p" },
  "CAP-c": { anchor: "DOM-d" },
  "FEAT-f": { anchor: "CAP-c" },
};

describe("the spine", () => {
  const m = modelOf({ ...spine, "FLW-x": { anchor: "FEAT-f" }, "SCR-s": { anchor: "FEAT-f" } });

  it("reads anchors as containment, in both directions", () => {
    assert.deepEqual(m.children("FEAT-f").map((e) => e.id), ["FLW-x", "SCR-s"]);
    assert.deepEqual(m.children("FEAT-f", "SCR").map((e) => e.id), ["SCR-s"]);
    assert.deepEqual(m.ancestors("FLW-x").map((e) => e.id), ["FEAT-f", "CAP-c", "DOM-d", "PROD-p"], "nearest first");
    assert.deepEqual(m.descendants("CAP-c").map((e) => e.id).sort(), ["FEAT-f", "FLW-x", "SCR-s"]);
    assert.deepEqual(m.scope("FEAT-f", "children").map((e) => e.id), ["FEAT-f", "FLW-x", "SCR-s"]);
    assert.deepEqual(m.scope("FEAT-f", "self").map((e) => e.id), ["FEAT-f"]);
  });

  it("does not loop on anchors that form a cycle", () => {
    const loop = modelOf({ "DOM-a": { anchor: "DOM-b" }, "DOM-b": { anchor: "DOM-a" } });
    assert.deepEqual(loop.ancestors("DOM-a").map((e) => e.id), ["DOM-b"]);
    assert.ok(loop.descendants("DOM-a").length <= 2);
  });

  it("knows an element's type, family and file from its id", () => {
    assert.equal(m.get("FEAT-f").type, "FEAT");
    assert.equal(m.get("FEAT-f").family, "structure");
    assert.equal(m.get("FEAT-f").path, "definition/structure/FEAT-f.md");
  });
});

describe("tiers and lifecycle", () => {
  const m = modelOf({ ...spine, "CAP-crit": { anchor: "DOM-d", tier: 1 }, "FEAT-in-crit": { anchor: "CAP-crit" }, "FEAT-own": { anchor: "CAP-crit", tier: 3 }, "FEAT-gone": { anchor: "CAP-c", lifecycle: "retired" } });

  it("defaults to tier 2, inherits from the nearest ancestor that sets one, and lets an element override", () => {
    assert.equal(m.tierOf("FEAT-f"), 2);
    assert.equal(m.tierOf("FEAT-in-crit"), 1);
    assert.equal(m.tierOf("FEAT-own"), 3);
  });

  it("is active unless said otherwise", () => {
    assert.equal(m.lifecycleOf("FEAT-f"), "active");
    assert.equal(m.isRetired("FEAT-gone"), true);
    assert.equal(m.isRetired("FEAT-f"), false);
  });
});

describe("relations", () => {
  const m = modelOf({
    ...spine,
    "RULE-r": { anchor: "CAP-c" },
    "ENT-e": { anchor: "CAP-c" },
    "ENT-other": { anchor: "CAP-c" },
    "FEAT-f": { anchor: "CAP-c", rel: { governed_by: ["RULE-r"], accesses: [{ to: "ENT-e", ops: ["create", "read"] }, "ENT-other"] } },
  });

  it("builds an edge for each authored relation, plain or with attributes", () => {
    assert.deepEqual(m.out("FEAT-f", "governed_by").map((e) => e.to), ["RULE-r"]);
    const acc = m.out("FEAT-f", "accesses");
    assert.deepEqual(acc.map((e) => e.to), ["ENT-e", "ENT-other"]);
    assert.deepEqual(acc[0].attrs.ops, ["create", "read"]);
    assert.deepEqual(acc[1].attrs, {});
  });

  it("derives the other end of every edge, so a relation is written once", () => {
    assert.deepEqual(m.in("RULE-r", "governed_by").map((e) => e.from), ["FEAT-f"]);
    assert.deepEqual(m.in("ENT-e").map((e) => e.rel), ["accesses"]);
  });

  it("ignores a relation name the meta-model does not know (the schema check reports it)", () => {
    const bad = modelOf({ ...spine, "FEAT-f": { anchor: "CAP-c", rel: { invented: ["RULE-r"] } }, "RULE-r": { anchor: "CAP-c" } });
    assert.equal(bad.out("FEAT-f").length, 0);
  });

  it("gives a question an implicit concern for what it is anchored under", () => {
    const q = modelOf({ ...spine, "QST-q": { anchor: "FEAT-f" }, "QST-explicit": { anchor: "FEAT-f", rel: { concerns: ["CAP-c"] } } });
    assert.deepEqual(q.out("QST-q", "concerns").map((e) => [e.to, e.via]), [["FEAT-f", "implicit"]]);
    assert.deepEqual(q.out("QST-explicit", "concerns").map((e) => [e.to, e.via]), [["CAP-c", "rel"]], "an explicit concern replaces the implicit one");
  });
});

describe("edges implied by reference fields and blocks", () => {
  const flow = `
\`\`\`pds-flow
entry: a
steps:
  - id: a
    actor: ACT-who
    at: SCR-s
    uses: [RULE-r, EXT-pay]
    accesses: {ENT-e: [create], ENT-f: [read]}
    emits: [EVT-done]
    moves: {STM-life: ["draft->sent"]}
    call: FLW-other
    end: success
\`\`\`
`;
  const m = modelOf({ ...spine, "FLW-x": [{ anchor: "FEAT-f" }, flow], "FLW-other": { anchor: "FEAT-f" } });
  const at = (rel) => m.out("FLW-x", rel).map((e) => [e.to, e.via, e.attrs]);

  it("turns each flow step into edges that remember which step they came from", () => {
    assert.deepEqual(at("audience"), [["ACT-who", "block:pds-flow", { step: "a" }]]);
    assert.deepEqual(at("touches"), [["SCR-s", "block:pds-flow", { step: "a" }]]);
    assert.deepEqual(m.out("FLW-x", "accesses").map((e) => [e.to, e.attrs.ops]), [["ENT-e", ["create"]], ["ENT-f", ["read"]]]);
    assert.deepEqual(m.out("FLW-x", "emits").map((e) => e.to), ["EVT-done"]);
    assert.deepEqual(m.out("FLW-x", "drives").map((e) => [e.to, e.attrs.transitions]), [["STM-life", ["draft->sent"]]]);
  });

  it("files `uses` by what it points at: a rule governs, an external system is a hard dependency", () => {
    assert.deepEqual(m.out("FLW-x", "governed_by").map((e) => e.to), ["RULE-r"]);
    const dep = m.out("FLW-x", "depends_on");
    assert.deepEqual(dep.map((e) => [e.to, e.attrs.kind]), [["EXT-pay", "hard"], ["FLW-other", "hard"]]);
    assert.equal(dep[1].attrs.note, "calls");
  });

  it("does not build edges from a block that does not parse", () => {
    const broken = modelOf({ ...spine, "FLW-x": [{ anchor: "FEAT-f" }, "```pds-flow\nsteps: [oops\n```\n"] });
    assert.equal(broken.out("FLW-x").length, 0);
  });
});

describe("mentions", () => {
  const prose = "See [[ENT-e]] twice: [[ENT-e]], and itself [[RULE-r]], and `[[ENT-code]]`, and [[ENT-nothing]].";
  const m = modelOf({ ...spine, "ENT-e": { anchor: "CAP-c" }, "RULE-r": [{ anchor: "CAP-c" }, prose + "\n"] });

  it("makes one mentions edge per target, never to itself, and not from inline code", () => {
    assert.deepEqual(m.out("RULE-r", "mentions").map((e) => e.to), ["ENT-e", "ENT-nothing"]);
  });

  it("keeps the line a mention was found on", () => {
    const text = rec({ id: "RULE-r", title: "RULE-r", maturity: "stub", anchor: "CAP-c" }, prose + "\n");
    assert.equal(m.out("RULE-r", "mentions")[0].line, text.split("\n").findIndex((l) => l === prose) + 1);
  });
});

describe("facets", () => {
  const entities = { "ENT-money": { anchor: "CAP-c", monetary: true, pii: true, tenant_scoped: true, has_lifecycle: true }, "ENT-plain": { anchor: "CAP-c" } };
  const withFlow = (accesses, extra = {}) =>
    modelOf({ ...spine, ...entities, "FEAT-f": { anchor: "CAP-c", ...extra }, "FLW-x": [{ anchor: "FEAT-f" }, `\`\`\`pds-flow\nentry: a\nsteps:\n  - {id: a, accesses: ${accesses}, end: success}\n\`\`\`\n`] });

  it("derives what the graph shows: writing, money, personal data, tenant data, state", () => {
    const f = withFlow("{ENT-money: [create]}").facets("FEAT-f");
    assert.deepEqual([f.derived.writes_data, f.derived.handles_money, f.derived.handles_pii, f.derived.tenant_data, f.derived.stateful], [true, true, true, true, true]);
    assert.equal(f.derived.has_ui, false);
  });

  it("does not call reading writing, nor a plain entity sensitive", () => {
    const f = withFlow("{ENT-plain: [read]}").facets("FEAT-f");
    assert.deepEqual([f.derived.writes_data, f.derived.handles_money, f.derived.handles_pii], [false, false, false]);
  });

  it("takes the facets nothing in the graph can show from what is declared", () => {
    const f = withFlow("{ENT-plain: [read]}", { facets: { async: true, public: false } }).facets("FEAT-f");
    assert.equal(f.derived.async, false);
    assert.equal(f.effective.async, true);
    assert.equal(f.effective.public, false);
    assert.deepEqual(f.declared, { async: true, public: false });
  });

  it("derives a UI from a screen anchored under the feature", () => {
    const m = modelOf({ ...spine, "SCR-s": { anchor: "FEAT-f" } });
    assert.equal(m.facets("FEAT-f").derived.has_ui, true);
  });

  it("answers only for features", () => {
    assert.deepEqual(withFlow("{ENT-plain: [read]}").facets("CAP-c").effective, {});
  });
});

describe("records the model cannot use", () => {
  const good = rec({ id: "TERM-a", title: "A", maturity: "stub", anchor: "PROD-p" });

  it("keeps the first of two records with one id, in path order, and reports the other as a duplicate", () => {
    const m = modelOf({ "PROD-p": {}, "TERM-a": { anchor: "PROD-p", summary: "first" } }, { extraFiles: { "definition/experience/TERM-a.md": good } });
    assert.equal(m.duplicates.length, 1);
    assert.equal(m.duplicates[0].id, "TERM-a");
    assert.equal(m.get("TERM-a").path, "definition/experience/TERM-a.md", "'experience' sorts before 'information'");
  });

  it("keeps a record it cannot parse in `records`, with its problem, and out of the graph", () => {
    const m = modelOf({ "PROD-p": {} }, { extraFiles: { "definition/information/TERM-bad.md": "---\nid: TERM-bad\nnote: has: colon\n---\n" } });
    assert.equal(m.has("TERM-bad"), false);
    const r = m.records.find((x) => x.path.endsWith("TERM-bad.md"));
    assert.equal(r.ok, false);
    assert.equal(r.problems[0].id, "SCH-frontmatter");
  });

  it("leaves out a record whose id has no known type", () => {
    const m = modelOf({ "PROD-p": {} }, { extraFiles: { "definition/information/ZZZ-x.md": rec({ id: "ZZZ-x", title: "X" }) } });
    assert.equal(m.has("ZZZ-x"), false);
  });
});
