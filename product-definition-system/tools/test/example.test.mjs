// The worked example is the first thing a reader opens, so it is held to what its
// README says about it: lint-clean, honest about what is unfinished, current, and
// everything it points to is there. If the tool changes in a way that makes the
// example wrong, this is where it is noticed.
import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { LEDGERLY, analyseRoot, found, meta, pds } from "./helpers.mjs";

const a = analyseRoot(LEDGERLY);
const readme = readFileSync(join(LEDGERLY, "README.md"), "utf8");
const rung = (id) => a.maturity.get(id).computed;

describe("the worked example is sound", () => {
  test("has no errors, and exactly the two warnings its README names", () => {
    assert.deepEqual(a.findings.filter((f) => f.sev === "error"), []);
    assert.deepEqual(
      a.findings.map((f) => `${f.sev} ${f.id} ${f.element}`).sort(),
      ["warn GOV-tier1-approval CAP-collect-payments", "warn GOV-tier1-approval FEAT-pay-invoice-online"],
    );
    for (const name of ["CAP-collect-payments", "FEAT-pay-invoice-online"]) assert.ok(readme.includes(`\`${name}\``), `${name} is named in the README`);
  });

  test("claims nothing the definition does not support", () => {
    assert.deepEqual(found(a, "GOV-claim"), []);
    for (const el of a.model.all()) {
      const m = a.maturity.get(el.id);
      assert.ok(meta.ladder.indexOf(m.declared) <= meta.ladder.indexOf(m.computed), `${el.id} declares ${m.declared} but computes ${m.computed}`);
    }
  });

  test("is the size and shape it was built to be", () => {
    assert.equal(a.model.all().length, 181);
    const hist = { stub: 0, outlined: 0, specified: 0, verifiable: 0 };
    for (const el of a.model.all()) hist[rung(el.id)]++;
    assert.deepEqual(hist, { stub: 79, outlined: 4, specified: 77, verifiable: 21 });
  });

  test("keeps every element on the spine, under the one product", () => {
    const product = a.model.all("PROD");
    assert.equal(product.length, 1);
    for (const el of a.model.all()) {
      if (el.type === "PROD") continue;
      assert.equal(a.model.ancestors(el.id).at(-1)?.id, product[0].id, `${el.id} reaches the product`);
    }
  });

  test("shows every kind of element the adoption level has, except the one its README says it skips", () => {
    const used = new Set(a.model.all().map((e) => e.type));
    const available = [...a.config.enabledTypes];
    assert.deepEqual(available.filter((t) => !used.has(t)), ["API"]);
    assert.match(readme, /Things the example does not try to cover:[^\n]*an API/);
    for (const t of used) assert.ok(a.config.enabledTypes.has(t), `${t} is within the adoption level`);
  });

  test("the generated views are current", async () => {
    const r = await pds(["views", "--check"], { cwd: LEDGERLY });
    assert.equal(r.code, 0, r.out);
    assert.match(r.out, /The 70 generated views are up to date\./);
  });
});

describe("the worked example is honest about what is unfinished", () => {
  const skeleton = a.model.all().filter((e) => e.front.origin === "skeleton");

  test("what no person has confirmed is still marked as skeleton, and still a stub", () => {
    assert.equal(skeleton.length, 79);
    for (const el of skeleton) assert.equal(rung(el.id), "stub", el.id);
    assert.ok(skeleton.length < 100, "fewer than init wrote: the invoicing and payments slice was confirmed");
    assert.match(readme, /Only the invoicing and payments slice has been confirmed/);
  });

  test("every element the README sends the reader to is a person's work, specified or better", () => {
    const named = [...new Set([...readme.matchAll(/\[`([A-Z]{2,5}-[a-z0-9-]+)`\]\(definition\//g)].map((m) => m[1]))];
    assert.ok(named.length >= 35);
    for (const id of named) {
      assert.ok(a.model.has(id), `${id} exists`);
      assert.notEqual(a.model.get(id).front.origin, "skeleton", id);
      assert.ok(["specified", "verifiable"].includes(rung(id)), `${id} is ${rung(id)}`);
    }
  });

  test("every link in the README leads to a file that is there, and says the id of the record it leads to", () => {
    let checked = 0;
    for (const m of readme.matchAll(/\[`?([^\]`]+)`?\]\(([^)#]+)(?:#[^)]*)?\)/g)) {
      const [, text, href] = m;
      checked++;
      assert.ok(existsSync(resolve(LEDGERLY, href)), `${href} exists`);
      if (href.startsWith("definition/")) assert.equal(text, href.split("/").pop().replace(/\.md$/, ""), "the link text is the id");
    }
    assert.ok(checked > 40);
  });

  test("the questions the README says stand behind deferred probes do, and are the only ones", () => {
    const named = ["QST-overpayment", "QST-audit-log", "QST-client-data-requests", "QST-refunds-and-disputes"];
    const until = new Set();
    for (const el of a.model.all()) {
      for (const d of Object.values(el.front.probes || {})) if (d && typeof d === "object" && d.deferred) until.add(d.until);
    }
    for (const id of named) {
      assert.ok(readme.includes(`\`${id}\``), `${id} is named in the README`);
      assert.ok(until.has(id), `${id} is what a probe is deferred until`);
    }
    assert.deepEqual([...until].filter((u) => u.startsWith("QST-")).sort(), [...named].sort());
    assert.match(readme, /Four non-blocking questions/);
    for (const id of named) assert.ok(a.model.get(id).front.blocking !== true, `${id} does not block`);
  });
});

describe("the worked example demonstrates approval", () => {
  const approved = a.model.all().filter((e) => e.front.approval);

  test("six records carry an approval, all by the one approver the project lists", () => {
    assert.deepEqual(approved.map((e) => e.id).sort(), ["CAP-invoicing", "FEAT-send-invoice", "JRN-first-invoice", "OBL-payment-card-security", "OBL-tax-and-invoicing", "REQ-workspace-data-isolation"]);
    assert.deepEqual(a.config.approvers, ["Dana Whitfield"]);
    for (const e of approved) assert.equal(e.front.approval.by, "Dana Whitfield", e.id);
    assert.match(readme, /Dana Whitfield is the only approver listed in `pds\.yaml`/);
  });

  test("every one of them is current: nobody has edited under an approval without approving again", () => {
    assert.deepEqual(found(a, "GOV-approval-hash"), []);
  });

  test("the critical work that claims to be specified is approved, except what the README says is not", () => {
    const unapproved = found(a, "GOV-tier1-approval").map((f) => f.element).sort();
    assert.deepEqual(unapproved, ["CAP-collect-payments", "FEAT-pay-invoice-online"]);
    assert.match(readme, /`CAP-collect-payments` and `FEAT-pay-invoice-online` claim \*specified\* and are critical/);
  });

  test("the approvals are labelled as fixture data, so nobody takes them for a real person's decision", () => {
    assert.match(readme, /The approvals are fixture data\./);
    assert.match(readme, /an agent never approves/);
  });
});

describe("the worked example is fiction, and says so", () => {
  test("states that everything in it is invented, and is not advice", () => {
    assert.match(readme, /\*\*Everything here is fiction\.\*\*/);
    assert.match(readme, /not legal or compliance advice/);
  });

  test("its files are all inside the example", () => {
    for (const el of a.model.all()) assert.ok(existsSync(join(LEDGERLY, el.path)), el.path);
    assert.equal(dirname(join(LEDGERLY, "pds.yaml")), LEDGERLY);
  });
});
