// What the tool writes for a person to start from: slugs, the skeleton a profile
// seeds, the template of every record type, and the surgical front matter edits.
// The rule under test throughout: nothing is invented, and nothing written is invalid.
import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { addRecord, analyseRoot, editText, found, meta, pds, readRecordText, scratch } from "./helpers.mjs";
import { readRecord, splitFrontmatter } from "../lib/records.mjs";
import { resolveConfig } from "../lib/project.mjs";
import { expandSeeds, slugify, validatePatterns } from "../lib/seed.mjs";
import { BLOCK_HEADING, body, fieldHint, frontmatter, pathFor, renderRecord } from "../lib/templates.mjs";
import { removeFrontKey, setFrontKey } from "../lib/edit.mjs";
import { parseYaml } from "../lib/yaml.mjs";

const configFor = (raw = {}) => resolveConfig(meta, { pds: 1, name: "T", profile: "saas", ...raw }).config;
const patterns = meta.patterns("saas");

describe("slugify", () => {
  test("makes an id slug from a name", () => {
    assert.equal(slugify("Ledgerly Pro"), "ledgerly-pro");
    assert.equal(slugify("Send an invoice"), "send-an-invoice");
    assert.equal(slugify("Taking Payment & Refunds!"), "taking-payment-refunds");
  });

  test("drops accents rather than the letter", () => {
    assert.equal(slugify("Café Crème"), "cafe-creme");
    assert.equal(slugify("Zoë's naïve façade"), "zoe-s-naive-facade");
  });

  test("never begins or ends with a hyphen, or repeats one", () => {
    assert.equal(slugify("  --Already--slug--  "), "already-slug");
    assert.equal(slugify("a   b\t\nc"), "a-b-c");
  });

  test("a name with nothing to make a slug from gives an empty slug, which the caller refuses", () => {
    assert.equal(slugify("!!!"), "");
    assert.equal(slugify("日本語"), "");
    assert.equal(slugify(""), "");
  });

  test("keeps digits", () => {
    assert.equal(slugify("2FA setup"), "2fa-setup");
  });
});

describe("the skeleton a profile seeds", () => {
  test("the shipped skeleton has nothing wrong with it", () => {
    assert.deepEqual(validatePatterns(meta, patterns), []);
  });

  test("with every module and the full adoption level, no seed is dead", () => {
    const everything = configFor({ adoption: "full", modules: Object.keys(meta.modules) });
    const { seeds, skipped } = expandSeeds(meta, everything, patterns, { productId: "PROD-t" });
    assert.deepEqual(skipped, []);
    assert.equal(seeds.length, patterns.seeds.length);
  });

  test("seeds come out in the order they are written, which is the order they can be created in", () => {
    const { seeds } = expandSeeds(meta, configFor({ adoption: "full" }), patterns, { productId: "PROD-t" });
    const order = new Map(seeds.map((s, i) => [s.id, i]));
    for (const s of seeds) if (s.anchor !== "PROD-t") assert.ok(order.get(s.anchor) < order.get(s.id), `${s.id} comes after ${s.anchor}`);
  });

  test("the product alias becomes the product's id", () => {
    const { seeds } = expandSeeds(meta, configFor(), patterns, { productId: "PROD-acme" });
    assert.ok(seeds.some((s) => s.anchor === "PROD-acme"));
    assert.ok(!seeds.some((s) => s.anchor === "@product"));
  });

  test("a seed for a module the project has not enabled is left out, and says why", () => {
    const core = configFor({ modules: [] });
    const { seeds, skipped } = expandSeeds(meta, core, patterns, { productId: "PROD-t" });
    assert.ok(!seeds.some((s) => s.id === "OBJ-sustainable-revenue"));
    assert.deepEqual(skipped.find((s) => s.id === "OBJ-sustainable-revenue"), { id: "OBJ-sustainable-revenue", reason: "module commercial is not enabled" });
    assert.ok(seeds.some((s) => s.id === "OBJ-first-value"), "core seeds are always there");
  });

  test("a seed for a type the adoption level does not include is left out, and says why", () => {
    const small = configFor({ adoption: "core" });
    const { seeds, skipped } = expandSeeds(meta, small, patterns, { productId: "PROD-t" });
    const reasons = skipped.filter((s) => /adoption level/.test(s.reason));
    assert.ok(reasons.length > 0);
    assert.match(reasons[0].reason, /is not part of the core adoption level$/);
    for (const s of seeds) assert.ok(small.enabledTypes.has(s.type), `${s.id} is a ${s.type}`);
  });

  test("a seed whose anchor was left out is left out too, rather than written pointing at nothing", () => {
    const custom = {
      seeds: [
        { id: "DOM-back", title: "Back office", anchor: "@product", module: "back-office" },
        { id: "CAP-tools", title: "Tools", anchor: "DOM-back" },
        { id: "DOM-front", title: "Front", anchor: "@product" },
      ],
    };
    const { seeds, skipped } = expandSeeds(meta, configFor({ modules: [] }), custom, { productId: "PROD-t" });
    assert.deepEqual(seeds.map((s) => s.id), ["DOM-front"]);
    assert.deepEqual(skipped.map((s) => [s.id, s.reason]), [["DOM-back", "module back-office is not enabled"], ["CAP-tools", "DOM-back is not written"]]);
  });

  test("a relation to a seed that is not written is dropped, one to a seed that is written is kept", () => {
    const custom = {
      seeds: [
        { id: "ACT-owner", title: "Owner", anchor: "@product", rel: { holds: ["ROLE-owner", "ROLE-admin"] } },
        { id: "ROLE-owner", title: "Owner", anchor: "@product" },
        { id: "ROLE-admin", title: "Admin", anchor: "@product", module: "back-office" },
        { id: "ACT-ghost", title: "Ghost", anchor: "@product", rel: { holds: ["ROLE-admin"] } },
      ],
    };
    const { seeds } = expandSeeds(meta, configFor({ modules: [] }), custom, { productId: "PROD-t" });
    assert.deepEqual(seeds.find((s) => s.id === "ACT-owner").rel, { holds: ["ROLE-owner"] });
    assert.equal(seeds.find((s) => s.id === "ACT-ghost").rel, undefined, "nothing left to say, so no empty relation");
  });

  test("no patterns, no seeds", () => {
    assert.deepEqual(expandSeeds(meta, configFor(), null, { productId: "PROD-t" }), { seeds: [], skipped: [] });
  });
});

describe("what makes a skeleton file invalid", () => {
  const base = () => ({
    seeds: [
      { id: "DOM-a", title: "A", anchor: "@product" },
      { id: "CAP-b", title: "B", anchor: "DOM-a", fields: {} },
    ],
  });
  const problems = (change) => {
    const p = base();
    change(p);
    return validatePatterns(meta, p);
  };
  const says = (change, expected) => {
    const found = problems(change);
    assert.ok(found.some((m) => expected.test(m)), `expected ${expected} in:\n  ${found.join("\n  ")}`);
  };

  test("the base used below is itself fine", () => {
    assert.deepEqual(validatePatterns(meta, base()), []);
  });

  test("it needs a list of seeds", () => {
    assert.deepEqual(validatePatterns(meta, null), ["patterns needs a seeds list"]);
    assert.deepEqual(validatePatterns(meta, {}), ["patterns needs a seeds list"]);
    assert.deepEqual(validatePatterns(meta, { seeds: "x" }), ["patterns needs a seeds list"]);
  });

  test("each seed must be a mapping with only the keys a seed has", () => {
    says((p) => p.seeds.push("DOM-x"), /seed 3: must be a mapping/);
    says((p) => (p.seeds[0].colour = "red"), /DOM-a: unknown key colour/);
  });

  test("an id is TYPE-slug, of a type that exists, used once", () => {
    says((p) => (p.seeds[0].id = "dom-a"), /id must look like TYPE-slug/);
    says((p) => (p.seeds[0].id = "ZZZ-a"), /unknown type prefix/);
    says((p) => p.seeds.push({ id: "DOM-a", title: "again", anchor: "@product" }), /DOM-a: appears twice/);
    says((p) => (p.seeds[0].id = 7), /id must look like TYPE-slug/);
  });

  test("a seed has a title, a known module and an anchor", () => {
    says((p) => delete p.seeds[0].title, /DOM-a: needs a title/);
    says((p) => (p.seeds[0].title = "   "), /DOM-a: needs a title/);
    says((p) => (p.seeds[0].module = "nonexistent"), /DOM-a: unknown module nonexistent/);
    says((p) => delete p.seeds[0].anchor, /DOM-a: needs an anchor/);
  });

  test("an anchor is the product or a seed above it, and a type the seed may live under", () => {
    says((p) => (p.seeds[1].anchor = "DOM-later"), /CAP-b: anchor DOM-later must be an earlier seed or "@product"/);
    says((p) => p.seeds.unshift({ id: "CAP-first", title: "C", anchor: "DOM-a" }), /anchor DOM-a must be an earlier seed/);
    says((p) => (p.seeds[1].anchor = "@product"), /CAP-b: a CAP cannot be anchored on the product/);
    says((p) => p.seeds.push({ id: "FEAT-x", title: "X", anchor: "DOM-a" }), /FEAT-x: a FEAT cannot be anchored on a DOM \(allowed: CAP\)/);
  });

  test("a singleton can be seeded once", () => {
    says((p) => p.seeds.push({ id: "TEN-one", title: "One", anchor: "@product" }, { id: "TEN-two", title: "Two", anchor: "@product" }), /TEN-two: TEN is a singleton/);
  });

  test("a field is one the type has, with a value of the type's kind", () => {
    says((p) => (p.seeds[1].fields = { nope: 1 }), /CAP-b: CAP has no field nope/);
    says((p) => p.seeds.push({ id: "OBJ-x", title: "X", anchor: "@product", fields: { kind: "whatever" } }), /OBJ-x\.kind:/);
  });

  test("a relation is a known one, between seeds, of types it connects", () => {
    says((p) => (p.seeds[1].rel = { invents: ["DOM-a"] }), /CAP-b: unknown relation invents/);
    says((p) => (p.seeds[1].rel = { depends_on: ["FEAT-elsewhere"] }), /CAP-b: depends_on points at FEAT-elsewhere, which is not a seed/);
    says((p) => (p.seeds[1].rel = { accesses: ["DOM-a"] }), /CAP-b: accesses from CAP to DOM is not allowed/);
  });
});

describe("where a record lives, and what it starts with", () => {
  const config = configFor();

  test("a record lives in the folder of its family, named after its id", () => {
    for (const [type] of meta.types) assert.equal(pathFor(meta, config, `${type}-sample`), `definition/${meta.familyOf(type)}/${type}-sample.md`);
    assert.equal(pathFor(meta, { ...config, definitionDir: "spec/defs" }, "FEAT-x"), "spec/defs/structure/FEAT-x.md");
  });

  test("a new record has only what a stub needs: id, title, anchor, and a maturity of stub", () => {
    const text = frontmatter(meta, "FEAT", { id: "FEAT-pay", title: "Pay", anchor: "CAP-money" });
    const front = parseYaml(splitFrontmatter(text + "x").front);
    assert.deepEqual(front, { id: "FEAT-pay", title: "Pay", anchor: "CAP-money", maturity: "stub" });
  });

  test("origin is written only when it is not the default, so a skeleton is always marked", () => {
    assert.ok(!/^origin:/m.test(frontmatter(meta, "FEAT", { id: "FEAT-a", title: "A", anchor: "CAP-b" })));
    assert.ok(!/^origin:/m.test(frontmatter(meta, "FEAT", { id: "FEAT-a", title: "A", anchor: "CAP-b", origin: "human" })));
    assert.match(frontmatter(meta, "FEAT", { id: "FEAT-a", title: "A", anchor: "CAP-b", origin: "skeleton" }), /^origin: skeleton$/m);
  });

  test("a product has no anchor, and the fields and relations a seed carries are written", () => {
    assert.ok(!/^anchor:/m.test(frontmatter(meta, "PROD", { id: "PROD-p", title: "P" })));
    const text = frontmatter(meta, "ACT", { id: "ACT-a", title: "A", anchor: "PROD-p", fields: { kind: "human" }, rel: { holds: ["ROLE-r"] } });
    const front = parseYaml(splitFrontmatter(text + "x").front);
    assert.equal(front.kind, "human");
    assert.deepEqual(front.rel, { holds: ["ROLE-r"] });
  });

  test("what the ladder asks for later is listed as comments, nearest rung first, and never as values", () => {
    const text = frontmatter(meta, "FEAT", { id: "FEAT-a", title: "A", anchor: "CAP-b" });
    const asks = [...text.matchAll(/^# (\w+): .+\((outlined|specified|verifiable)\)$/gm)];
    assert.ok(asks.length >= 3);
    const rank = ["stub", "outlined", "specified", "verifiable"];
    for (let i = 1; i < asks.length; i++) assert.ok(rank.indexOf(asks[i][2]) >= rank.indexOf(asks[i - 1][2]), "outlined before specified");
    assert.ok(asks.some((a) => a[1] === "summary"));
    const front = parseYaml(splitFrontmatter(text + "x").front);
    for (const [name] of asks) assert.ok(!(name in front), `${name} is a prompt, not a value`);
  });

  test("a field that is already given is not asked for again", () => {
    const text = frontmatter(meta, "FEAT", { id: "FEAT-a", title: "A", anchor: "CAP-b", fields: { summary: "Already here." } });
    assert.ok(!/^# summary:/m.test(text));
  });

  test("each kind of field says what it takes", () => {
    assert.equal(fieldHint({ type: "enum", values: ["a", "b"] }), "a | b");
    assert.equal(fieldHint({ type: "bool" }), "true | false");
    assert.equal(fieldHint({ type: "int" }), "a whole number");
    assert.equal(fieldHint({ type: "number" }), "a number");
    assert.equal(fieldHint({ type: "date" }), "YYYY-MM-DD");
    assert.equal(fieldHint({ type: "ref", types: ["ROLE"] }), "the id of a ROLE");
    assert.equal(fieldHint({ type: "refs", types: ["ROLE", "ACT"] }), "a list of ROLE or ACT ids");
    assert.equal(fieldHint({ type: "refs", types: ["*"] }), "a list of element ids");
    assert.equal(fieldHint({ type: "strings" }), "a list: [item, item]");
    assert.equal(fieldHint({ type: "shape", doc: "First sentence. Second sentence." }), "First sentence.");
    assert.equal(fieldHint({ type: "string" }), "text");
  });
});

describe("the body of a new record", () => {
  test("has a heading and the question for every section, in the order the type declares", () => {
    for (const [type, spec] of meta.types) {
      const text = body(meta, type);
      const headings = [...text.matchAll(/^## (.+)$/gm)].map((m) => m[1]);
      const expected = [...spec.sections.map((s) => s.heading), ...Object.keys(spec.blocks || {}).map((n) => BLOCK_HEADING[n] || n)];
      assert.deepEqual(headings, expected, type);
      for (const s of spec.sections) assert.ok(text.includes(`<!-- ${s.ask.replace(/-->/g, "--&gt;")}`), `${type}: the question for ${s.heading}`);
    }
  });

  test("never closes its own comments early, whatever the meta-model says", () => {
    for (const [type] of meta.types) {
      const text = body(meta, type);
      const opens = (text.match(/<!--/g) || []).length;
      const closes = (text.match(/-->/g) || []).length;
      assert.equal(opens, closes, type);
    }
  });

  test("a note a seed carries is kept as a comment, never as content", () => {
    const text = body(meta, "MET", { note: "Define what counts as activated, exactly." });
    assert.match(text, /^<!-- Metric: .*\n {5}Define what counts as activated, exactly\./);
    assert.ok(!/^Define what counts/m.test(text));
  });

  test("a whole new record has nothing in it a reader would take for an answer", () => {
    for (const [type] of meta.types) {
      const rec = readRecord("x.md", renderRecord(meta, type, { id: `${type}-x`, title: "X", anchor: type === "PROD" ? undefined : "PROD-p" }));
      assert.equal(rec.problems.length, 0, type);
      assert.equal(rec.blocks.length, 0, `${type}: examples are comments until a person writes them`);
      assert.ok(rec.sections.every((s) => !s.text?.trim()), `${type}: every section is empty`);
    }
  });
});

describe("a new record of every type is valid", () => {
  test("pds new, for every type, writes something that lints without a single error", async () => {
    const dir = join(scratch("pds-types-"), "p");
    assert.equal((await pds(["init", dir, "--name", "Types", "--adoption", "full", "--no-skeleton"])).code, 0);
    for (const args of [["DOM", "d"], ["CAP", "c", "--anchor", "DOM-d"], ["FEAT", "f", "--anchor", "CAP-c"]]) assert.equal((await pds(["new", ...args], { cwd: dir })).code, 0, args.join(" "));
    const spine = { PROD: "PROD-types", DOM: "DOM-d", CAP: "CAP-c", FEAT: "FEAT-f" };
    let made = 0;
    for (const [type, spec] of meta.types) {
      if (["PROD", "DOM", "CAP", "FEAT"].includes(type)) continue;
      const above = spec.anchors.find((a) => spine[a]);
      const r = await pds(["new", type, `sample-${type.toLowerCase()}`, "--anchor", spine[above]], { cwd: dir });
      assert.equal(r.code, 0, `${type}: ${r.err}`);
      made++;
    }
    assert.equal(made, meta.types.size - 4);
    const lint = JSON.parse((await pds(["lint", "--json"], { cwd: dir })).out);
    const errors = lint.findings.filter((f) => f.sev === "error");
    assert.deepEqual(errors, [], "a stub is incomplete, never wrong");
  });

  test("and every one of them is a stub that computes as a stub", async () => {
    const dir = join(scratch("pds-types-"), "p");
    await pds(["init", dir, "--name", "Types", "--adoption", "full", "--no-skeleton"]);
    await pds(["new", "DOM", "d"], { cwd: dir });
    await pds(["new", "OBJ", "o"], { cwd: dir });
    const a = analyseRoot(dir);
    assert.equal(a.maturity.get("OBJ-o").computed, "stub");
    assert.equal(a.maturity.get("DOM-d").computed, "stub");
  });
});

describe("the examples a template offers", () => {
  const cases = [...meta.types].flatMap(([type, spec]) => Object.entries(spec.blocks || {}).map(([name, b]) => ({ type, name, example: b.example })));

  test("every structured block of every type has an example to copy", () => {
    assert.ok(cases.length >= 6);
    for (const c of cases) assert.ok(c.example && c.example.trim().length > 20, `${c.type}.${c.name}`);
  });

  for (const c of cases) {
    test(`the ${c.name} example in ${c.type} parses, and has every key its block requires`, async () => {
      const dir = join(scratch("pds-ex-"), "p"); // the example, written out as a real block in a record of its type
      assert.equal((await pds(["init", dir, "--name", "Ex", "--adoption", "full", "--no-skeleton"])).code, 0);
      await pds(["new", "DOM", "d"], { cwd: dir });
      await pds(["new", "CAP", "c", "--anchor", "DOM-d"], { cwd: dir });
      const anchor = { DOM: "DOM-d", CAP: "CAP-c", PROD: "PROD-ex" }[meta.spec(c.type).anchors[0]] ?? "CAP-c";
      addRecord(dir, `${c.type}-sample`, { title: "Sample", anchor, maturity: "stub" }, `## Section\n\n\`\`\`${c.name}\n${c.example.trimEnd()}\n\`\`\``);
      const a = analyseRoot(dir);
      const own = a.findings.filter((f) => f.element === `${c.type}-sample`);
      const schema = own.filter((f) => f.id.startsWith("SCH-"));
      assert.deepEqual(schema.map((f) => `${f.id}: ${f.msg}`), [], "the example is well formed");
      if (c.name === "gherkin") assert.deepEqual(found(a, "QLT-gherkin", `${c.type}-sample`), [], "and the gherkin example is in the order it teaches");
      const rec = a.model.get(`${c.type}-sample`).rec;
      assert.equal(rec.blocks.filter((b) => b.name === c.name && !b.error && (c.name === "gherkin" ? b.text.trim() : b.data)).length, 1, "and is read as that block");
    });
  }
});

describe("editing one key of a record's front matter", () => {
  const text = [
    "---",
    "id: FEAT-a",
    "title: A",
    "# why this is here",
    "maturity: stub",
    "rel:",
    "  accesses:",
    "    - ENT-x",
    "",
    "  emits: [EVT-y]",
    "tier: 2",
    "---",
    "",
    "## Purpose",
    "",
    "Body, with a `maturity: stub` mention that is not a key.",
    "",
  ].join("\n");

  test("replaces a key and everything under it, and nothing else", () => {
    const out = setFrontKey(text, "rel", ["rel:", "  serves: [OBJ-z]"]);
    assert.equal(out, text.replace(["rel:", "  accesses:", "    - ENT-x", "", "  emits: [EVT-y]"].join("\n"), ["rel:", "  serves: [OBJ-z]"].join("\n")));
  });

  test("replaces a one-line key in place, keeping its comment neighbours and the order", () => {
    const out = setFrontKey(text, "maturity", ["maturity: outlined"]);
    assert.equal(out.split("\n").slice(0, 6).join("\n"), ["---", "id: FEAT-a", "title: A", "# why this is here", "maturity: outlined", "rel:"].join("\n"));
    assert.ok(out.endsWith(text.slice(text.indexOf("tier: 2"))));
  });

  test("adds a missing key straight after maturity, which is where a reader looks for the state of the record", () => {
    const out = setFrontKey(text, "origin", ["origin: human"]);
    const front = out.split("\n");
    assert.equal(front[front.indexOf("maturity: stub") + 1], "origin: human");
  });

  test("adds a missing key at the end when there is no maturity to follow", () => {
    const bare = "---\nid: FEAT-a\ntitle: A\n---\nBody\n";
    assert.equal(setFrontKey(bare, "tier", ["tier: 1"]), "---\nid: FEAT-a\ntitle: A\ntier: 1\n---\nBody\n");
  });

  test("a key is only ever a top-level key: a nested one of the same name is left alone", () => {
    const nested = "---\nid: A-b\ntitle: T\nrel:\n  tier: [X-y]\n---\n";
    assert.equal(removeFrontKey(nested, "tier"), nested);
    assert.equal(setFrontKey(nested, "tier", ["tier: 3"]), "---\nid: A-b\ntitle: T\nrel:\n  tier: [X-y]\ntier: 3\n---\n");
  });

  test("never reads the body: a line in it that looks like a key is not one", () => {
    const out = setFrontKey(text, "maturity", ["maturity: specified"]);
    assert.ok(out.includes("Body, with a `maturity: stub` mention that is not a key."));
    assert.equal((out.match(/^maturity:/gm) || []).length, 1);
  });

  test("removes a key with what belongs to it, and says nothing when the key is not there", () => {
    const out = removeFrontKey(text, "rel");
    assert.ok(!out.includes("rel:") && !out.includes("ENT-x") && !out.includes("EVT-y"));
    assert.ok(out.includes("tier: 2") && out.includes("maturity: stub"));
    assert.equal(removeFrontKey(text, "approval"), text);
  });

  test("a key name with characters that mean something in a pattern is taken literally", () => {
    const odd = "---\nid: A-b\ntitle: T\n---\n";
    assert.equal(removeFrontKey(odd, "a.b"), odd);
    assert.equal(setFrontKey(odd, "a.b", ["a.b: 1"]), "---\nid: A-b\ntitle: T\na.b: 1\n---\n");
  });

  test("a file with no front matter, or none that closes, is refused rather than guessed at", () => {
    assert.throws(() => setFrontKey("# just a note\n", "tier", ["tier: 1"]), /the record has no front matter/);
    assert.throws(() => removeFrontKey("---\nid: A-b\n", "id"), /never closed/);
  });

  test("a record with Windows line endings keeps them", () => {
    const crlf = "---\r\nid: FEAT-a\r\ntitle: A\r\nmaturity: stub\r\n---\r\nBody\r\n";
    const out = setFrontKey(crlf, "origin", ["origin: human"]);
    assert.ok(!/[^\r]\n/.test(out), "every line still ends the way the file's lines ended");
    assert.equal(out, "---\r\nid: FEAT-a\r\ntitle: A\r\nmaturity: stub\r\norigin: human\r\n---\r\nBody\r\n");
    assert.equal(removeFrontKey(crlf, "maturity"), "---\r\nid: FEAT-a\r\ntitle: A\r\n---\r\nBody\r\n");
  });

  test("an edit that comes back through the reader says what was written", () => {
    const edited = setFrontKey(text, "tier", ["tier: 1"]);
    const rec = readRecord("x.md", edited);
    assert.equal(rec.ok, true);
    assert.equal(rec.front.tier, 1);
    assert.deepEqual(rec.front.rel.emits, ["EVT-y"]);
    assert.equal(rec.problems.length, 0);
  });
});

describe("the files the tool writes, read back", () => {
  test("a record made by `pds new` is read back with the same id, title and anchor", async () => {
    const dir = join(scratch("pds-new-"), "p");
    await pds(["init", dir, "--name", "Back", "--no-skeleton"]);
    await pds(["new", "DOM", "Taking payment & refunds", "--title", "Taking payment (and refunds)"], { cwd: dir });
    const rec = readRecord("x.md", readFileSync(join(dir, "definition/structure/DOM-taking-payment-refunds.md"), "utf8"));
    assert.deepEqual([rec.front.id, rec.front.title, rec.front.anchor, rec.front.maturity], ["DOM-taking-payment-refunds", "Taking payment (and refunds)", "PROD-back", "stub"]);
  });

  test("a title with characters YAML would read as syntax survives the round trip", async () => {
    const dir = join(scratch("pds-new-"), "p");
    await pds(["init", dir, "--name", "Back", "--no-skeleton"]);
    const titles = ["Pay: now", "Is it #1?", "- leading dash", "It's \"quoted\"", "yes", "no", "null", "12345", "a: b: c", "[brackets]", "{braces}", "trailing colon:", "日本語 title", "  padded  "];
    for (const [i, title] of titles.entries()) {
      const r = await pds(["new", "DOM", `d${i}`, "--title", title], { cwd: dir });
      assert.equal(r.code, 0, `${title}: ${r.err}`);
      const back = readRecord("x.md", readRecordText(dir, `DOM-d${i}`));
      assert.equal(back.problems.length, 0, `${title}: ${JSON.stringify(back.problems)}`);
      assert.equal(back.front.title, title.trim(), title);
    }
    assert.equal(analyseRoot(dir).findings.filter((f) => f.sev === "error").length, 0);
  });

  test("editing a record that has a comment in its front matter keeps the comment", async () => {
    const dir = join(scratch("pds-new-"), "p");
    await pds(["init", dir, "--name", "Back", "--no-skeleton"]);
    await pds(["new", "DOM", "d"], { cwd: dir });
    const before = readRecordText(dir, "DOM-d");
    assert.match(before, /# Still to fill in, by the rung that needs it:/);
    editText(dir, "DOM-d", (t) => setFrontKey(t, "tier", ["tier: 1"]));
    const after = readRecordText(dir, "DOM-d");
    assert.match(after, /# Still to fill in, by the rung that needs it:/);
    assert.match(after, /^tier: 1$/m);
  });
});
