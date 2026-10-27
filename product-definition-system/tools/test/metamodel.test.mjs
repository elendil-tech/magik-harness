// The meta-model is data, and data can contradict itself. These tests check the
// shipped meta-model against itself and against the code, and then break it on
// purpose to prove the check notices (a check that cannot fail checks nothing).
import assert from "node:assert/strict";
import { cpSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import { IMPLEMENTATIONS } from "../lib/checks/index.mjs";
import { DEFAULT_META_DIR, loadMeta, validateMeta } from "../lib/metamodel.mjs";
import { VIEW_IDS } from "../lib/views/index.mjs";
import { meta, scratch } from "./helpers.mjs";

const impl = { checks: Object.keys(IMPLEMENTATIONS), views: VIEW_IDS };

/** The shipped meta-model with one piece of text changed, loaded afresh. */
function withEdit(file, from, to) {
  const dir = scratch("pds-meta-");
  cpSync(DEFAULT_META_DIR, dir, { recursive: true });
  const path = join(dir, file);
  const before = readFileSync(path, "utf8");
  assert.ok(before.includes(from), `test setup: ${file} no longer contains ${JSON.stringify(from)}`);
  writeFileSync(path, before.replace(from, to));
  return loadMeta(dir);
}

const problemsWith = (m, pattern, extra = impl) => validateMeta(m, extra).filter((p) => pattern.test(p));

describe("the shipped meta-model", () => {
  it("is consistent with itself and with the code that implements it", () => {
    assert.deepEqual(validateMeta(meta, impl), []);
  });

  it("gives every element type a way to reach the product, through allowed anchors", () => {
    const reached = new Set(["PROD"]);
    for (let grew = true; grew; ) {
      grew = false;
      for (const t of meta.types.values()) {
        if (!reached.has(t.code) && t.anchors.some((a) => reached.has(a))) {
          reached.add(t.code);
          grew = true;
        }
      }
    }
    assert.deepEqual([...meta.types.keys()].filter((t) => !reached.has(t)), []);
  });

  it("reads an id's type from its prefix, for every type", () => {
    for (const code of meta.types.keys()) assert.equal(meta.typeOfId(`${code}-example`), code);
    assert.ok(!meta.typeOfId("ZZZ-nothing"), "an unknown prefix has no type");
  });

  it("makes the adoption levels nest: core is inside standard is inside full", () => {
    const at = (level) => new Set([...meta.types.values()].filter((t) => meta.model.adoption.ladder.indexOf(t.adoption) <= meta.model.adoption.ladder.indexOf(level)).map((t) => t.code));
    const [core, standard, full] = ["core", "standard", "full"].map(at);
    for (const t of core) assert.ok(standard.has(t));
    for (const t of standard) assert.ok(full.has(t));
    assert.ok(core.size < standard.size && standard.size < full.size, "each level adds something");
    assert.equal(full.size, meta.types.size, "full adoption uses every type");
    for (const spine of ["PROD", "DOM", "CAP", "FEAT"]) assert.ok(core.has(spine), `${spine} is part of core`);
  });

  it("gives every relation a distinct inverse and a documented reading", () => {
    const names = [...meta.relations.keys()];
    const inverses = [...meta.relations.values()].map((r) => r.inverse);
    assert.equal(new Set(inverses).size, inverses.length);
    for (const inv of inverses) assert.ok(!names.includes(inv), `${inv} collides with a relation name`);
  });

  it("has a coverage rule for every rung above stub on the spine", () => {
    for (const type of ["PROD", "DOM", "CAP", "FEAT"]) {
      const about = (r) => [].concat(r.applies?.type ?? []).some((t) => t === type || t === "*");
      const rungs = new Set([...meta.rules, ...meta.implicitRules].filter(about).map((r) => r.applies?.from));
      assert.ok(rungs.has("outlined") && rungs.has("specified"), `${type} should be asked something at outlined and at specified`);
    }
  });
});

describe("breaking the meta-model on purpose", () => {
  it("notices a rule that names a relation that does not exist", () => {
    const m = withEdit("rules.yaml", "rel: governed_by, to: [RULE], min: 1, include: children", "rel: govrned_by, to: [RULE], min: 1, include: children");
    assert.ok(problemsWith(m, /unknown relation govrned_by/).length > 0);
  });

  it("notices an element type in a family that does not exist", () => {
    const m = withEdit("element-types.yaml", "family: behaviour", "family: nowhere");
    assert.ok(problemsWith(m, /unknown family nowhere/).length > 0);
  });

  it("notices two relations sharing an inverse name", () => {
    const m = withEdit("relation-types.yaml", "inverse: served_by", "inverse: source_of");
    assert.ok(problemsWith(m, /inverse source_of used twice/).length > 0);
  });

  it("notices a declared check with no code behind it, and code with no declaration", () => {
    const missing = Object.keys(IMPLEMENTATIONS).filter((id) => id !== "SCH-id-file");
    assert.ok(problemsWith(meta, /SCH-id-file is declared in rules.yaml but not implemented/, { checks: missing, views: VIEW_IDS }).length > 0);
    assert.ok(problemsWith(meta, /XXX-ghost is implemented but not declared/, { checks: [...Object.keys(IMPLEMENTATIONS), "XXX-ghost"], views: VIEW_IDS }).length > 0);
  });

  it("notices a view marked implemented that has no renderer, and a renderer nobody declared", () => {
    assert.ok(problemsWith(meta, /is marked implemented but has no renderer/, { checks: impl.checks, views: VIEW_IDS.filter((v) => v !== "flow") }).length > 0);
    assert.ok(problemsWith(meta, /has a renderer but is not declared/, { checks: impl.checks, views: [...VIEW_IDS, "ghost-view"] }).length > 0);
  });

  it("notices a rule, a check or a gate whose id could be taken for an element's", () => {
    // the id of the first check class was once INT, the code of the integration type
    const rule = withEdit("rules.yaml", "id: COV-FEAT-flow", "id: FEAT-flow");
    assert.ok(problemsWith(rule, /id FEAT-flow: starts with FEAT, which is an element type/).length > 0);
    const gate = withEdit("rules.yaml", "id: GATE-skeleton", "id: RULE-skeleton");
    assert.ok(problemsWith(gate, /id RULE-skeleton: starts with RULE, which is an element type/).length > 0);
    const check = withEdit("rules.yaml", "{id: COH-flow-ends, class: COH,", "{id: ENT-flow-ends, class: COH,");
    assert.ok(problemsWith(check, /id ENT-flow-ends: starts with ENT, which is an element type/).length > 0);
  });

  it("notices a calendar flag that is anything but true", () => {
    const m = withEdit("rules.yaml", "sev: warn, calendar: true, doc: \"An approved element", "sev: warn, calendar: false, doc: \"An approved element");
    assert.equal(problemsWith(m, /check GOV-freshness: calendar is either true or left out/).length, 1);
  });

  it("notices impact settings in which a weak edge would reach further than a strong one", () => {
    const m = withEdit("relation-types.yaml", "weak_hops: 1", "weak_hops: 5");
    assert.ok(problemsWith(m, /weak_hops cannot exceed strong_hops/).length > 0);
  });
});
