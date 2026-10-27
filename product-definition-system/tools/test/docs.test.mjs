// The documents agree with the tool. Prose that quotes a number, names a command
// or an id, or links to another page goes stale silently, so each of those is
// checked against the thing it describes:
//
//   - every relative link leads to a file, and every #anchor to a heading in it;
//   - every `pds command` exists, and every --flag shown with it belongs to it;
//   - every rule, check or gate id that is named exists;
//   - every headline count (types, relations, rules, checks, probes, views,
//     commands, modules...) is the number the meta-model computes;
//   - the skill is a well formed skill, and every document is reachable from the README.
//
// Code blocks are sample output and are not read for counts. They are read for
// commands and ids, because those are what a reader types and searches for.
import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { PROJECT_ROOT, analyseRoot, meta, pds, scratch } from "./helpers.mjs";
import { COMMON_FLAGS } from "../lib/cli.mjs";
import { COMMANDS } from "../lib/commands/index.mjs";
import { plan } from "../lib/views/index.mjs";

const read = (...parts) => readFileSync(join(PROJECT_ROOT, ...parts), "utf8");
const mdIn = (dir) => readdirSync(join(PROJECT_ROOT, dir)).filter((f) => f.endsWith(".md")).sort().map((f) => join(dir, f));

/** The documents a person wrote. The reference is generated, and `pds docs --check` keeps it honest. */
const AUTHORED = ["README.md", ...mdIn("docs"), "skills/pds-define/SKILL.md", "examples/ledgerly/README.md"];
const REFERENCE = mdIn("docs/reference");

/** Every rule, check, gate and probe id the meta-model defines. */
const RULE_IDS = new Set([
  ...meta.rules.map((r) => r.id),
  ...meta.implicitRules.map((r) => r.id),
  ...meta.checks.map((c) => c.id),
  ...meta.gates.map((g) => g.id),
  ...meta.probes.map((p) => `PRB-${p.id}`),
]);

/** A document as lines, each marked as a fence line, inside a code fence (and which language), or prose. */
function lines(file) {
  let lang = null;
  return read(file).split("\n").map((text, i) => {
    const fence = /^\s*(?:```|~~~)\s*([\w-]*)/.exec(text);
    if (fence) {
      lang = lang === null ? fence[1] || "text" : null;
      return { n: i + 1, text, fence: true, fenced: true, lang: fence[1] };
    }
    return { n: i + 1, text, fence: false, fenced: lang !== null, lang };
  });
}

/** GitHub's heading anchors: lowercase, punctuation dropped, spaces to hyphens, repeats numbered. */
function anchors(file) {
  const seen = new Map();
  const out = new Set();
  for (const l of lines(file)) {
    const m = !l.fenced && /^#{1,6}\s+(.*?)\s*#*\s*$/.exec(l.text);
    if (!m) continue;
    const base = m[1]
      .replace(/!?\[([^\]]*)\]\([^)]*\)/g, "$1")
      .replace(/[`*]/g, "")
      .toLowerCase()
      .replace(/[^\p{L}\p{N}\s_-]/gu, "")
      .trim()
      .replace(/\s/g, "-");
    const count = seen.get(base) ?? 0;
    seen.set(base, count + 1);
    out.add(count ? `${base}-${count}` : base);
  }
  return out;
}

/** The inline `code` spans of a line. */
const spans = (text) => [...text.matchAll(/`([^`]+)`/g)].map((m) => m[1]);
const withoutCode = (text) => text.replace(/`[^`]*`/g, " ");

describe("links", () => {
  for (const file of [...AUTHORED, ...REFERENCE]) {
    test(`${file}: every relative link and anchor leads somewhere`, () => {
      const broken = [];
      let total = 0;
      for (const l of lines(file)) {
        if (l.fenced) continue;
        for (const m of l.text.matchAll(/\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g)) {
          const target = m[1];
          if (/^[a-z][a-z0-9+.-]*:/i.test(target)) continue; // http:, mailto:
          total++;
          const [path, hash] = target.split("#");
          const resolved = path ? resolve(PROJECT_ROOT, dirname(file), decodeURIComponent(path)) : join(PROJECT_ROOT, file);
          if (!existsSync(resolved)) {
            broken.push(`${file}:${l.n} ${target} (no such file)`);
            continue;
          }
          if (hash && resolved.endsWith(".md") && !anchors(relative(PROJECT_ROOT, resolved)).has(decodeURIComponent(hash))) {
            broken.push(`${file}:${l.n} ${target} (no such heading in ${relative(PROJECT_ROOT, resolved)})`);
          }
        }
      }
      assert.deepEqual(broken, [], `${total} links checked`);
    });
  }

  test("every document is reachable from the README", () => {
    const readme = read("README.md");
    for (const f of mdIn("docs")) assert.ok(readme.includes(f), `${f} is not linked from the README`);
    assert.ok(readme.includes("skills/pds-define/SKILL.md"), "the skill is not linked from the README");
  });
});

describe("commands", () => {
  const known = new Set([...Object.keys(COMMANDS), "help", "version"]);

  test("there are the commands the documents say there are", () => {
    assert.equal(Object.keys(COMMANDS).length, 15);
  });

  test("every `pds command` the documents show exists, and every flag shown with it belongs to it", () => {
    const wrong = [];
    let seen = 0;
    for (const file of AUTHORED) {
      for (const l of lines(file)) {
        // in a code block the whole line is a command line; elsewhere only the `code` spans are
        const texts = l.fence ? [] : l.fenced ? [l.text] : spans(l.text);
        for (const text of texts) {
          for (const m of text.matchAll(/(?:^|[\s(`;&|])pds\s+([a-z][a-z-]*)\b([^|;&#`\n]*)/g)) {
            const [, cmd, rest] = m;
            if (!/^(\s|$)/.test(rest) && rest !== "") continue;
            seen++;
            if (!known.has(cmd)) {
              wrong.push(`${file}:${l.n} pds ${cmd}: no such command`);
              continue;
            }
            const allowed = new Set([...Object.keys(COMMANDS[cmd]?.flags ?? {}), ...Object.keys(COMMON_FLAGS)]);
            for (const f of rest.matchAll(/(?<![\w-])--([a-z][a-z-]*)/g)) {
              if (!allowed.has(f[1])) wrong.push(`${file}:${l.n} pds ${cmd} --${f[1]}: not a flag of ${cmd}`);
            }
          }
        }
      }
    }
    assert.ok(seen > 100, `the documents show plenty of commands (${seen})`);
    assert.deepEqual(wrong, []);
  });
});

describe("ids", () => {
  const ids = RULE_IDS;

  test("every rule, check and gate the documents name exists", () => {
    const missing = [];
    let seen = 0;
    for (const file of AUTHORED) {
      for (const l of lines(file)) {
        for (const m of l.text.matchAll(/(?<![\w-])((?:COV|FLD|SEC|BLK|SCH|REF|COH|QLT|GOV|PRB|GATE)(?:-[A-Za-z0-9_]+)+)/g)) {
          seen++;
          if (!ids.has(m[1])) missing.push(`${file}:${l.n} ${m[1]}`);
        }
      }
    }
    assert.ok(seen > 80, `the documents name plenty of rules and checks (${seen})`);
    assert.deepEqual(missing, []);
  });
});

describe("counts", () => {
  // A headline count is written as digits, and only digits are checked. A number
  // in words is a subset ("only six commands write", "two gates cap a maturity"),
  // and one with a leading zero is a page number ("05 Views"), not a count.
  const NUM = "(?<![\\d.-])(?!0\\d)\\d+";
  const num = (s) => Number(s);

  const adoptionCount = (level) => meta.enabledTypes(level).size;
  const productWide = [...meta.views.keys()].length - 2; // every view but `card` and `spec`, which need an element
  const total = {
    types: meta.types.size,
    relations: meta.relations.size,
    rules: meta.rules.length + meta.implicitRules.length,
    handWritten: meta.rules.length,
    checks: meta.checks.length,
    gates: meta.gates.length,
    probes: meta.probes.length,
    views: meta.views.size,
    commands: Object.keys(COMMANDS).length,
    families: Object.keys(meta.families).length,
    modules: Object.keys(meta.modules).length,
    facets: Object.keys(meta.facets).length,
    tiers: Object.keys(meta.tiers).length,
    rungs: meta.ladder.length,
    zoom: meta.spine.length + 1,
  };

  // noun phrase -> the numbers it may legitimately carry
  const CLAIMS = [
    { noun: "element types", re: new RegExp(`(?<before>\\b\\w+ )?\\b(?<n>${NUM}) element types\\b`, "gi"), ok: (n, before) => (/^(core|standard|full) $/i.test(before ?? "") ? n === adoptionCount(before.trim().toLowerCase()) : n === total.types) },
    { noun: "relations", re: new RegExp(`\\b(?<n>${NUM}) (?:typed )?relations\\b`, "gi"), ok: (n) => n === total.relations },
    { noun: "checks", re: new RegExp(`\\b(?<n>${NUM}) (?:coded )?checks\\b`, "gi"), ok: (n) => n === total.checks },
    { noun: "rules", re: new RegExp(`\\b(?<n>${NUM}) (?:coverage )?rules\\b`, "gi"), ok: (n) => n === total.rules || n === total.handWritten },
    { noun: "probes", re: new RegExp(`\\b(?<n>${NUM}) (?:concern )?probes\\b`, "gi"), ok: (n) => n === total.probes },
    { noun: "views", re: new RegExp(`\\b(?<n>${NUM}) (?:product-wide )?views\\b`, "gi"), ok: (n) => n === total.views || n === productWide },
    { noun: "commands", re: new RegExp(`\\b(?<n>${NUM}) commands\\b`, "gi"), ok: (n) => n === total.commands },
    { noun: "families", re: new RegExp(`\\b(?<n>${NUM}) families\\b`, "gi"), ok: (n) => n === total.families },
    { noun: "gates", re: new RegExp(`\\b(?<n>${NUM}) gates\\b`, "gi"), ok: (n) => n === total.gates },
    { noun: "facets", re: new RegExp(`\\b(?<n>${NUM}) facets\\b`, "gi"), ok: (n) => n === total.facets },
    { noun: "modules", re: new RegExp(`\\b(?<n>${NUM}) (?<optional>optional )?modules\\b`, "gi"), ok: (n, _b, optional) => n === (optional ? total.modules - 1 : total.modules) },
    { noun: "tiers", re: new RegExp(`\\b(?<n>${NUM}) (?:criticality )?tiers\\b`, "gi"), ok: (n) => n === total.tiers },
    { noun: "rungs", re: new RegExp(`\\b(?<n>${NUM})[ -](?:maturity )?rungs?\\b`, "gi"), ok: (n) => n === total.rungs },
    { noun: "zoom levels", re: new RegExp(`\\b(?<n>${NUM}) zoom levels\\b`, "gi"), ok: (n) => n === total.zoom },
    { noun: "adoption levels", re: new RegExp(`\\b(?<n>${NUM}) (?:levels of adoption|adoption levels)\\b`, "gi"), ok: (n) => n === meta.model.adoption.ladder.length },
  ];

  test("the numbers the documents quote are the numbers the meta-model computes", () => {
    const wrong = [];
    let checked = 0;
    for (const file of AUTHORED) {
      for (const l of lines(file)) {
        if (l.fence || (l.fenced && l.lang !== "mermaid")) continue; // a diagram's labels are prose; sample output is not
        if (/^#{1,6}\s/.test(l.text) && !l.fenced) continue; // a heading's "2.3 Relations" is a section number
        const prose = (l.fenced ? l.text : withoutCode(l.text)).replace(/\*/g, "");
        for (const c of CLAIMS) {
          for (const m of prose.matchAll(c.re)) {
            checked++;
            const n = num(m.groups.n);
            if (!c.ok(n, m.groups.before, m.groups.optional)) wrong.push(`${file}:${l.n} "${m[0].trim()}": the meta-model has ${expected(c.noun)}`);
          }
        }
      }
    }
    assert.ok(checked > 30, `the documents quote plenty of counts (${checked})`);
    assert.deepEqual(wrong, []);

    function expected(noun) {
      const t = total;
      return { "element types": t.types, relations: t.relations, checks: t.checks, rules: `${t.rules} (${t.handWritten} hand-written)`, probes: t.probes, views: `${t.views} (${productWide} product-wide)`, commands: t.commands, families: t.families, gates: t.gates, facets: t.facets, modules: `${t.modules} (${t.modules - 1} optional)`, tiers: t.tiers, rungs: t.rungs, "zoom levels": t.zoom, "adoption levels": meta.model.adoption.ladder.length }[noun];
    }
  });

  test("the adoption levels hold the numbers of types the documents give them", () => {
    assert.deepEqual(["core", "standard", "full"].map(adoptionCount), [17, 38, 42]);
    const text = AUTHORED.map((f) => read(f)).join("\n");
    assert.ok(text.includes("core 17 element types, standard 38, full 42"));
  });
});

describe("the model, restated", () => {
  const types = new Set(meta.types.keys());

  test("the families table lists the types the meta-model puts in each family", () => {
    const rows = lines("docs/02-architecture.md").filter((l) => !l.fenced && /^\|\s*[A-Z][^|]*\(`[a-z]+`\)\s*\|/.test(l.text));
    assert.equal(rows.length, Object.keys(meta.families).length, "a row for every family");
    for (const row of rows) {
      const cells = row.text.split("|").map((c) => c.trim());
      const folder = /\(`([a-z]+)`\)/.exec(cells[1])[1];
      assert.ok(meta.families[folder], `${folder} is a family`);
      assert.equal(cells[1].split(" (")[0], meta.families[folder].title, `${folder}: title`);
      const listed = [...cells[3].matchAll(/`([A-Z]+)`/g)].map((m) => m[1]).sort();
      const actual = [...meta.types.values()].filter((t) => t.family === folder).map((t) => t.code).sort();
      assert.deepEqual(listed, actual, `${folder}: types`);
    }
  });

  test("every type code the documents put in code is a real element type", () => {
    // Placeholders and words, and the prefixes of rule, check and gate ids: those are not types
    // (the meta-model refuses a prefix that is one), but a document may name them (09 D18 does).
    const NOT_TYPES = new Set(["TBD", "TODO", "XXX", "NULL", "ID", ...[...RULE_IDS].map((id) => id.split("-")[0])]);
    const unknown = [];
    for (const file of AUTHORED) {
      for (const l of lines(file)) {
        if (l.fenced) continue;
        for (const m of l.text.matchAll(/`([A-Z]{2,5})`/g)) if (!types.has(m[1]) && !NOT_TYPES.has(m[1])) unknown.push(`${file}:${l.n} ${m[1]}`);
      }
    }
    assert.deepEqual(unknown, []);
  });

  test("every element id the documents mention is in the example, or is on purpose not", () => {
    // Made up to show a new element, a placeholder, or a typo for the "did you mean" example.
    // `FEAT-0042` is the numbered id that 09 D6 argues against, and `INT-flow-ends` the check id that 09 D18 says could be read as an element's.
    const ILLUSTRATIVE = new Set(["SCR-invoice-reviw", "FEAT-send-payment-reminders", "FEAT-send-reminders", "FEAT-issue-invoice", "PROD-my-product", "CAP-x", "RLS-name", "FEAT-0042", "INT-flow-ends"]);
    const have = new Set();
    const walk = (dir) => {
      for (const e of readdirSync(join(PROJECT_ROOT, dir), { withFileTypes: true })) {
        if (e.isDirectory()) walk(join(dir, e.name));
        else if (e.name.endsWith(".md")) have.add(e.name.slice(0, -3));
      }
    };
    walk("examples/ledgerly/definition");
    assert.ok(have.size > 150, "the example has its elements");
    const missing = [];
    for (const file of AUTHORED) {
      for (const l of lines(file)) {
        if (l.fenced && l.lang !== "bash" && l.lang !== "sh" && l.lang !== "text") continue;
        for (const m of l.text.matchAll(/(?<![\w-])([A-Z]{2,5})-([a-z0-9]+(?:-[a-z0-9]+)*)(?![\w-])/g)) {
          if (!types.has(m[1]) || have.has(m[0]) || ILLUSTRATIVE.has(m[0])) continue;
          if (m[0] === "API-only") continue; // a phrase
          missing.push(`${file}:${l.n} ${m[0]}`);
        }
      }
    }
    assert.deepEqual(missing, []);
  });
});

describe("what the documents promise a new project", () => {
  test("`pds init` writes as many records as the README says", async () => {
    const dir = scratch("pds-init-");
    const made = await pds(["init", join(dir, "p"), "--name", "P"]);
    assert.equal(made.code, 0, made.err);
    const size = analyseRoot(join(dir, "p")).model.elements.size;
    const quoted = [...read("README.md").matchAll(/(\d+) records already exist/g)].map((m) => Number(m[1]));
    assert.ok(quoted.length > 0, "the README says how big the skeleton is");
    assert.deepEqual(quoted, quoted.map(() => size));
  });

  test("the size and depth of the example are what the documents quote", () => {
    const a = analyseRoot(join(PROJECT_ROOT, "examples", "ledgerly"));
    const rungs = Object.fromEntries(meta.ladder.map((r) => [r, 0]));
    for (const m of a.maturity.values()) if (m) rungs[m.computed]++;
    const actual = [a.model.elements.size, ...meta.ladder.map((r) => rungs[r])];
    const sentence = /(\d+) elements: (\d+) stub[·, ]+(\d+) outlined[·, ]+(\d+) specified[·, ]+(\d+) verifiable/g;
    const quoted = AUTHORED.flatMap((file) => lines(file).flatMap((l) => [...l.text.matchAll(sentence)].map((m) => ({ at: `${file}:${l.n}`, got: m.slice(1).map(Number) }))));
    assert.ok(quoted.length >= 2, "the documents quote the example's status");
    for (const q of quoted) assert.deepEqual(q.got, actual, q.at);
    const files = plan(a).size;
    for (const file of ["docs/01-assessment.md"]) assert.match(read(file), new RegExp(`\\b${files} files for the example`), "the number of generated files");
  });

  test("the example uses the types the assessment says it uses", () => {
    const standard = meta.enabledTypes("standard");
    const used = new Set(analyseRoot(join(PROJECT_ROOT, "examples", "ledgerly")).model.all().map((e) => e.type));
    const unused = [...standard].filter((t) => !used.has(t));
    const claim = /uses (\d+) of the (\d+) types at standard adoption \(all but `(\w+)`\)/.exec(read("docs/01-assessment.md"));
    assert.ok(claim, "the assessment says how much of the model the example exercises");
    assert.deepEqual([Number(claim[1]), Number(claim[2]), claim[3]], [used.size, standard.size, unused[0]]);
    assert.equal(unused.length, 1, "and it leaves out exactly one");
  });
});

describe("the skill", () => {
  const file = "skills/pds-define/SKILL.md";
  const text = read(file);
  const front = /^---\n([\s\S]*?)\n---\n/.exec(text)?.[1] ?? "";
  const field = (name) => new RegExp(`^${name}:\\s*(.+)$`, "m").exec(front)?.[1]?.trim();

  test("is named for its folder, with a description that says what it does and when to use it", () => {
    assert.equal(field("name"), "pds-define");
    assert.match(field("name"), /^[a-z0-9-]{1,64}$/);
    const description = field("description");
    assert.ok(description && description.length <= 1024, "a description of at most 1024 characters");
    assert.match(description, /\bUse when\b/, "says when to use it");
  });

  test("is short enough to be read whole", () => {
    assert.ok(text.split("\n").length < 200, `${text.split("\n").length} lines`);
  });
});
