// Maturity is computed, never believed. These tests pin down what the ladder
// means: which rung an element has earned, what can cap it, and what a claim
// above it costs.
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { applicableProbes, dispositionOf } from "../lib/coverage.mjs";
import { rmSync } from "node:fs";
import { analyseRoot, copyExample, editFront, found, LEDGERLY, meta, recordPath } from "./helpers.mjs";

const example = analyseRoot(LEDGERLY);
const rung = (name) => meta.rung(name);
const m = (id, analysis = example) => analysis.maturity.get(id);

describe("the ladder in the worked example", () => {
  it("computes a rung no higher than any failing error rule allows, for every element", () => {
    for (const [id, mat] of example.maturity) {
      for (const r of mat.results) {
        if (!r.pass && r.sev === "error") assert.ok(rung(mat.byRules) < rung(r.from), `${id} is ${mat.byRules} but fails ${r.rule}, which is required from ${r.from}`);
      }
    }
  });

  it("never lets a claim stand above what is computed from the rules", () => {
    for (const [id, mat] of example.maturity) assert.ok(rung(mat.declared) <= rung(mat.byRules), `${id} claims ${mat.declared} but the rules support ${mat.byRules}`);
  });

  it("caps every skeleton record at outlined, however complete it looks", () => {
    const skeletons = [...example.model.elements.values()].filter((e) => meta.field(e, "origin") === "skeleton");
    assert.ok(skeletons.length > 50, "the example keeps its skeleton visible");
    for (const e of skeletons) assert.ok(rung(m(e.id).computed) <= rung("outlined"), `${e.id} is a skeleton`);
  });

  it("lets the features that are fully defined reach verifiable, and only those with something to verify", () => {
    assert.equal(m("FEAT-send-invoice").byRules, "verifiable");
    assert.equal(m("FEAT-pay-invoice-online").byRules, "verifiable");
    assert.equal(m("FEAT-draft-invoice").computed, "outlined", "a feature with a flow and no more is not specified");
  });
});

describe("what a gap does to a rung", () => {
  it("holds a feature at outlined when a concern probe has no disposition, and names the probe", () => {
    const root = copyExample();
    editFront(root, "FEAT-send-invoice", (f) => delete f.probes.audit);
    const a = analyseRoot(root);
    assert.equal(m("FEAT-send-invoice", a).byRules, "outlined");
    const failing = m("FEAT-send-invoice", a).results.filter((r) => !r.pass).map((r) => r.rule);
    assert.deepEqual(failing, ["PRB-audit"]);
    assert.equal(found(a, "GOV-claim", "FEAT-send-invoice").length, 1, "the claim of specified is now an over-claim");
  });

  it("caps an element, and everything above it, while a blocking question about it is open", () => {
    const root = copyExample();
    editFront(root, "QST-overpayment", (f) => (f.blocking = true));
    const a = analyseRoot(root);
    for (const id of ["FEAT-pay-invoice-online", "CAP-collect-payments", "DOM-invoicing", "PROD-ledgerly"]) {
      assert.equal(m(id, a).computed, "outlined", `${id} is capped`);
      assert.deepEqual(m(id, a).caps.map((c) => [c.gate, c.by]), [["GATE-blocking-question", ["QST-overpayment"]]]);
    }
    assert.equal(m("FEAT-send-invoice", a).caps.length, 0, "an unrelated feature is untouched");
  });

  it("lifts the cap when the question is answered or dropped", () => {
    for (const status of ["answered", "dropped"]) {
      const root = copyExample();
      editFront(root, "QST-overpayment", (f) => ((f.blocking = false), (f.status = status), (f.answer = "Refuse the second payment.")));
      assert.deepEqual(m("FEAT-pay-invoice-online", analyseRoot(root)).caps, []);
    }
  });

  it("does not let a question that concerns something else cap an element", () => {
    const root = copyExample();
    editFront(root, "QST-audit-log", (f) => (f.blocking = true));
    const a = analyseRoot(root);
    assert.deepEqual(m("FEAT-pay-invoice-online", a).caps, [], "QST-audit-log concerns the send feature");
    assert.ok(m("FEAT-send-invoice", a).caps.length > 0);
  });

  it("leaves a rung where it is when only a warning-level rule fails, and reports the warning", () => {
    const root = copyExample();
    for (const risk of ["RISK-wrong-recipient", "RISK-invoice-abuse"]) rmSync(recordPath(root, risk)); // the risks recorded against the critical send feature
    const a = analyseRoot(root);
    const risk = m("FEAT-send-invoice", a).results.find((r) => r.rule === "COV-FEAT-risk");
    assert.equal(risk.pass, false);
    assert.equal(risk.sev, "warn");
    assert.equal(m("FEAT-send-invoice", a).byRules, "verifiable", "advice does not hold a rung back");
    assert.equal(found(a, "COV-FEAT-risk", "FEAT-send-invoice").length, 1, "but it is reported to a feature that claims specified");
    assert.equal(found(a, "COV-FEAT-risk", "FEAT-send-invoice")[0].sev, "warn");
  });
});

describe("the top of the ladder", () => {
  it("does not let an element claim a rung nothing is checked at", () => {
    const root = copyExample();
    editFront(root, "TERM-client", (f) => (f.maturity = "verifiable"));
    const a = analyseRoot(root);
    assert.equal(m("TERM-client", a).byRules, "specified", "a glossary term can be complete but there is nothing to verify");
    const [claim] = found(a, "GOV-claim", "TERM-client");
    assert.match(claim.msg, /claims verifiable, but nothing about this .* is checked at that rung/i);
  });

  it("gives the types that can be verified a rule at that rung, and only those", () => {
    const withTop = new Set(meta.rules.filter((r) => r.applies?.from === "verifiable").flatMap((r) => [].concat(r.applies.type)));
    for (const t of ["FEAT", "FLW", "REQ", "RULE", "STM", "OBL"]) assert.ok(withTop.has(t), `${t} can be verified`);
    for (const t of ["TERM", "PERS", "DEC", "QST"]) assert.ok(!withTop.has(t), `${t} has nothing to verify`);
  });
});

describe("probes", () => {
  const feat = (id, analysis = example) => analysis.model.get(id);

  it("asks fewer concerns of a feature the less critical it is", () => {
    const askedAt = (tier) => {
      const root = copyExample();
      editFront(root, "FEAT-send-invoice", (f) => (f.tier = tier));
      const a = analyseRoot(root);
      return applicableProbes(a.model, feat("FEAT-send-invoice", a)).length;
    };
    const [critical, important, minor] = [askedAt(1), askedAt(2), askedAt(3)];
    assert.ok(critical > important && important > minor && minor > 0, `tier 1 ${critical}, tier 2 ${important}, tier 3 ${minor}`);
  });

  it("asks nothing of anything that is not a feature", () => {
    assert.deepEqual(applicableProbes(example.model, example.model.get("CAP-invoicing")), []);
  });

  it("reads a disposition only when it is well formed", () => {
    const el = (probes) => ({ front: { probes } });
    assert.deepEqual(dispositionOf(el({ x: { na: "not relevant here" } }), "x"), { kind: "na", reason: "not relevant here", until: undefined });
    assert.deepEqual(dispositionOf(el({ x: { addressed: ["REQ-a", "TST-b"] } }), "x"), { kind: "addressed", by: ["REQ-a", "TST-b"] });
    assert.equal(dispositionOf(el({ x: { addressed: [] } }), "x"), null);
    assert.equal(dispositionOf(el({ x: { na: "" } }), "x"), null);
    assert.equal(dispositionOf(el({ x: { deferred: "later" } }), "x"), null, "a deferral needs `until`");
    assert.equal(dispositionOf(el({ x: { na: "a reason", addressed: ["REQ-a"] } }), "x"), null, "exactly one disposition");
    assert.equal(dispositionOf(el({}), "x"), null);
    assert.equal(dispositionOf(el(undefined), "x"), null);
  });

  it("stops asking about a probe a project has switched off with a reason", () => {
    const root = copyExample();
    editFront(root, "FEAT-send-invoice", (f) => delete f.probes.audit);
    assert.equal(m("FEAT-send-invoice", analyseRoot(root)).byRules, "outlined");
  });
});

describe("retired elements", () => {
  it("are not evaluated, and do not count as children or as scope", () => {
    const root = copyExample();
    editFront(root, "FEAT-draft-invoice", (f) => ((f.lifecycle = "retired"), (f.lifecycle_note = "Folded into sending.")));
    const a = analyseRoot(root);
    assert.equal(a.maturity.has("FEAT-draft-invoice"), false);
    assert.equal(example.maturity.has("FEAT-draft-invoice"), true);
  });
});
