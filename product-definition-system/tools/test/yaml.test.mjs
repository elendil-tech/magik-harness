import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { parseYaml, stringifyYaml, YamlError } from "../lib/yaml.mjs";

const bad = (text, pattern) => assert.throws(() => parseYaml(text), (e) => e instanceof YamlError && pattern.test(e.message), `expected ${pattern} for ${JSON.stringify(text)}`);

describe("PDS-YAML parse", () => {
  it("reads scalars with the YAML 1.2 meaning and no 1.1 surprises", () => {
    assert.deepEqual(
      parseYaml(["a: 1", "b: -2", "c: 3.5", "d: true", "e: false", "f: null", "g: ~", "h: hello world", "i: 2026-10-27", "j: 1.2.3", "k: 'it''s'", 'l: "tab\\there"', "m:"].join("\n")),
      { a: 1, b: -2, c: 3.5, d: true, e: false, f: null, g: null, h: "hello world", i: "2026-10-27", j: "1.2.3", k: "it's", l: "tab\there", m: null },
    );
  });

  it("reads nested mappings and sequences, including a sequence at its key's indent", () => {
    const doc = ["rel:", "  serves: [OBJ-a, OBJ-b]", "  accesses:", "    - {to: ENT-x, ops: [read, update]}", "    - to: ENT-y", "      ops: [create]", "steps:", "- id: s1", "  next: s2", "- id: s2", "  end: success", "tail: done"].join("\n");
    assert.deepEqual(parseYaml(doc), {
      rel: { serves: ["OBJ-a", "OBJ-b"], accesses: [{ to: "ENT-x", ops: ["read", "update"] }, { to: "ENT-y", ops: ["create"] }] },
      steps: [{ id: "s1", next: "s2" }, { id: "s2", end: "success" }],
      tail: "done",
    });
  });

  it("reads nested sequences and mixed items", () => {
    assert.deepEqual(parseYaml("- - a\n  - b\n- c\n-\n  k: v\n- ~"), [["a", "b"], "c", { k: "v" }, null]);
  });

  it("strips comments but keeps hashes inside quotes and URLs", () => {
    assert.deepEqual(parseYaml('a: 1 # note\n# whole line\nb: "x # y"\nc: http://h/p#frag\nd: \'q # r\' # tail'), { a: 1, b: "x # y", c: "http://h/p#frag", d: "q # r" });
  });

  it("reads block scalars", () => {
    const doc = ["lit: |", "  one", "  two", "", "  three", "fold: >", "  a", "  b", "", "  c", "strip: |-", "  x", "folds: >-", "  p", "  q", "after: ok"].join("\n");
    assert.deepEqual(parseYaml(doc), { lit: "one\ntwo\n\nthree\n", fold: "a b\nc\n", strip: "x", folds: "p q", after: "ok" });
  });

  it("reads block scalars inside list items", () => {
    assert.deepEqual(parseYaml("- |\n  text\n  more\n- next"), ["text\nmore\n", "next"]);
  });

  it("reads flow collections with quoted text and empty values", () => {
    assert.deepEqual(parseYaml('a: [1, "x, y", {k: v}, []]\nb: {when: Not permitted, next: e1, empty: }\nc: {}'), {
      a: [1, "x, y", { k: "v" }, []],
      b: { when: "Not permitted", next: "e1", empty: null },
      c: {},
    });
  });

  it("returns null for an empty document and reports line numbers with an offset", () => {
    assert.equal(parseYaml("\n# nothing\n"), null);
    assert.throws(() => parseYaml("a: 1\nb: yes", { baseLine: 10 }), /line 11:/);
  });

  it("rejects what differs between YAML versions", () => {
    for (const v of ["yes", "No", "ON", "off", "True", "NULL", "007", "0x1F", "1_000", "1e3", "1:30", ".inf"]) bad(`k: ${v}`, /quote|means different|number/);
  });

  it("rejects structures it does not support", () => {
    bad("a:\n\tb: 1", /tabs/);
    bad("a: &x 1", /anchors|indicator/);
    bad("a: *x", /anchors|indicator/);
    bad("a: !!str 1", /indicator|tags/);
    bad("a: 1\na: 2", /duplicate key "a"/);
    bad("a: b: c", /quotes/);
    bad("a:\n  plain text", /nested mapping/);
    bad("a: [1, 2", /expected/);
    bad('a: "open', /unterminated/);
    bad("a: |+\n  x", /block scalar header/);
    bad("a: >\n  x\n    y", /more-indented/);
    bad("---\na: 1", /document markers/);
    bad("a: 1\n  b: 2", /indentation/);
    bad("__proto__: 1", /__proto__/);
  });
});

describe("PDS-YAML write", () => {
  const roundtrip = (v) => assert.deepEqual(parseYaml(stringifyYaml(v)), v);

  it("round-trips scalars that need quoting", () => {
    roundtrip({ a: "yes", b: "007", c: "1e3", d: "", e: " lead", f: "a: b", g: "x # y", h: "- dash", i: "[x]", j: "true", k: "null", l: "multi\nline\n", m: "multi\nno-trailing", n: "quote \" inside", o: "tab\there" });
  });

  it("round-trips nested structures in block and flow style", () => {
    roundtrip({
      id: "FEAT-x",
      tags: ["a", "b"],
      rel: { serves: ["OBJ-1"], accesses: [{ to: "ENT-a", ops: ["read"] }, { to: "ENT-b", ops: ["create", "update"], note: "long enough text to push this item out of flow style onto several lines of block style output" }] },
      empty: [],
      none: {},
      nested: [[1, 2], { k: [3, { z: null }] }],
      flag: false,
      n: 3.25,
    });
  });

  it("writes a stable, readable layout", () => {
    assert.equal(stringifyYaml({ id: "FEAT-x", rel: { serves: ["OBJ-a"] }, steps: [{ id: "s1", next: "s2" }] }), "id: FEAT-x\nrel: {serves: [OBJ-a]}\nsteps:\n  - {id: s1, next: s2}\n");
  });

  it("refuses values it cannot represent", () => {
    assert.throws(() => stringifyYaml({ a: Number.NaN }), YamlError);
    assert.throws(() => stringifyYaml({ a: () => 1 }), YamlError);
  });
});
