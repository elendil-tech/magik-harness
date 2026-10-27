// The command line as a person meets it: exit codes, messages, and what each
// command does to the files. Everything runs in process on scratch folders.
import assert from "node:assert/strict";
import { existsSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import { COMMANDS } from "../lib/commands/index.mjs";
import { addRecord, analyseRoot, copyExample, editFront, editText, found, frontOf, listFiles, pds, readRecordText, recordPath, scratch, snapshot } from "./helpers.mjs";

const PERSON = "Dana Whitfield";

/** A new project made by `pds init`, so the tests use what a user would. */
async function started(...args) {
  const dir = scratch("pds-init-");
  const r = await pds(["init", dir, ...args]);
  assert.equal(r.code, 0, r.err);
  return dir;
}

describe("the command line", () => {
  it("lists every command in its overview, and gives each one its own help", async () => {
    const overview = await pds(["help"]);
    assert.equal(overview.code, 0);
    for (const name of Object.keys(COMMANDS)) {
      assert.match(overview.out, new RegExp(`^\\s+${name}\\s`, "m"), `${name} is in the overview`);
      const help = await pds([name, "--help"]);
      assert.equal(help.code, 0, name);
      assert.match(help.out, new RegExp(`^pds ${name} — `), name);
      assert.match(help.out, /^Usage: pds /m, name);
    }
  });

  it("prints a version", async () => {
    assert.match((await pds(["--version"])).out, /^pds \d+\.\d+\.\d+$/m);
  });

  it("reaches no further than the ids that exist: every rule or check named in a help text is real", async () => {
    const texts = [(await pds(["help"])).out];
    for (const name of Object.keys(COMMANDS)) texts.push((await pds([name, "--help"])).out);
    const ids = new Set(texts.join("\n").match(/\b(?:COV|SCH|REF|INT|QLT|GOV|PRB|GATE|FLD|SEC|BLK)-[A-Za-z][A-Za-z-]*[A-Za-z]\b/g) || []);
    assert.ok(ids.size > 0);
    for (const id of ids) assert.equal((await pds(["explain", id])).code, 0, `${id} is named in a help text but does not exist`);
  });

  it("exits 2 on a mistyped command or option, and suggests the nearest", async () => {
    const cmd = await pds(["lnt"]);
    assert.equal(cmd.code, 2);
    assert.match(cmd.err, /unknown command lnt; did you mean lint\?/);
    const opt = await pds(["lint", "--strcit"]);
    assert.equal(opt.code, 2);
    assert.match(opt.err, /did you mean --strict\?/);
    assert.equal((await pds(["lint", "--limit"])).code, 2, "an option that takes a value and has none");
    assert.equal((await pds(["next", "--limit", "many"])).code, 2, "a number that is not a number");
  });

  it("says where to start when there is no project", async () => {
    const empty = scratch();
    const r = await pds(["lint"], { cwd: empty });
    assert.equal(r.code, 1);
    assert.match(r.err, /no pds.yaml found from .* upwards\. Start one with: pds init/);
  });

  it("finds the project from a folder inside it, by --root, or by PDS_ROOT", async () => {
    const root = copyExample();
    const inside = join(root, "definition", "behaviour");
    assert.equal((await pds(["lint"], { cwd: inside })).code, 0);
    assert.equal((await pds(["lint", "--root", root], { cwd: scratch() })).code, 0);
    assert.equal((await pds(["lint"], { cwd: scratch(), env: { PDS_ROOT: root } })).code, 0);
    assert.equal((await pds(["lint", "--root", scratch()])).code, 1, "a folder with no pds.yaml in it");
  });

  it("turns an unexpected exception into exit 3 with a message, and a stack only when asked", async () => {
    const root = copyExample();
    const mod = await import("../lib/commands/index.mjs");
    const original = mod.COMMANDS.status.run;
    mod.COMMANDS.status.run = () => {
      throw new Error("kaboom");
    };
    try {
      const quiet = await pds(["status"], { cwd: root });
      assert.equal(quiet.code, 3);
      assert.match(quiet.err, /unexpected error: kaboom/);
      assert.doesNotMatch(quiet.err, /\n\s+at /);
      const loud = await pds(["status"], { cwd: root, env: { PDS_DEBUG: "1" } });
      assert.match(loud.err, /\n\s+at /);
    } finally {
      mod.COMMANDS.status.run = original;
    }
  });
});

describe("pds lint", () => {
  it("exits 0 on a definition with only warnings, 1 with --strict, and 1 on any error", async () => {
    const root = copyExample();
    const ok = await pds(["lint"], { cwd: root });
    assert.equal(ok.code, 0);
    assert.match(ok.out, /0 errors, 2 warnings/);
    assert.equal((await pds(["lint", "--strict"], { cwd: root })).code, 1);
    editFront(root, "REQ-pay-page-load-time", (f) => (f.kind = "wish"));
    const bad = await pds(["lint"], { cwd: root });
    assert.equal(bad.code, 1);
    assert.match(bad.out, /SCH-field-type/);
    assert.match(bad.out, /REQ-pay-page-load-time/);
  });

  it("limits itself to one element on request", async () => {
    const root = copyExample();
    const r = await pds(["lint", "--element", "FEAT-pay-invoice-online"], { cwd: root });
    assert.match(r.out, /FEAT-pay-invoice-online/);
    assert.doesNotMatch(r.out, /CAP-collect-payments/);
  });

  it("gives machine-readable findings with --json", async () => {
    const root = copyExample();
    editFront(root, "REQ-pay-page-load-time", (f) => (f.kind = "wish"));
    const r = await pds(["lint", "--json"], { cwd: root });
    const data = JSON.parse(r.out);
    assert.ok(Array.isArray(data.findings));
    assert.ok(data.findings.some((f) => f.id === "SCH-field-type" && f.element === "REQ-pay-page-load-time" && f.sev === "error"));
    assert.equal(data.ok, false);
    assert.equal(data.errors, data.findings.filter((f) => f.sev === "error").length);
    assert.equal(data.warnings, data.findings.filter((f) => f.sev === "warn").length);
  });

  it("shows every file it could not read, not just the first problem", async () => {
    const root = copyExample();
    for (const id of ["TERM-client", "TERM-invoice"]) editText(root, id, (t) => t.replace("\n---\n", "\nnote: has: a colon\n---\n"));
    const r = await pds(["lint"], { cwd: root });
    assert.match(r.out, /TERM-client\.md/);
    assert.match(r.out, /TERM-invoice\.md/);
  });
});

describe("pds init", () => {
  it("starts a project that has no errors and nothing believed", async () => {
    const dir = await started("--name", "Demo Co", "--adoption", "core");
    const a = analyseRoot(dir);
    assert.equal(a.counts.error, 0);
    assert.ok(a.model.all().length > 50, "the profile's skeleton");
    for (const el of a.model.elements.values()) {
      assert.equal(el.declared, "stub", `${el.id} claims nothing`);
      if (el.type !== "PROD") assert.equal(el.front.origin, "skeleton", `${el.id} is marked as a prompt`);
    }
    assert.equal(a.model.all("PROD")[0].id, "PROD-demo-co");
    assert.match(readFileSync(join(dir, "pds.yaml"), "utf8"), /^name: Demo Co$/m);
    assert.match(readFileSync(join(dir, "pds.yaml"), "utf8"), /^approvers: \[\]$/m);
  });

  it("writes a larger skeleton at higher adoption, never a smaller one, and only the product with --no-skeleton", async () => {
    const count = async (...args) => analyseRoot(await started("--name", "X", ...args)).model.all().length;
    const [core, standard, full, bare] = [await count("--adoption", "core"), await count("--adoption", "standard"), await count("--adoption", "full"), await count("--no-skeleton")];
    assert.ok(core < standard && standard <= full, `${core} < ${standard} <= ${full}`);
    assert.equal(bare, 1);
  });

  it("writes only a product record for the empty profile", async () => {
    const dir = await started("--profile", "none", "--name", "Bare");
    assert.deepEqual(listFiles(dir), [join("definition", "intent", "PROD-bare.md"), "pds.yaml"]);
  });

  it("does not overwrite a project that is already there", async () => {
    const dir = await started("--name", "Once");
    const before = snapshot(dir);
    const again = await pds(["init", dir, "--name", "Twice"]);
    assert.equal(again.code, 1);
    assert.match(again.err, /already/);
    assert.deepEqual([...snapshot(dir)], [...before], "nothing changed");
  });

  it("refuses what it cannot honour", async () => {
    const dir = scratch();
    assert.equal((await pds(["init", dir, "--adoption", "huge"])).code, 2);
    assert.equal((await pds(["init", dir, "--profile", "nonesuch"])).code, 2);
    assert.equal((await pds(["init", dir, "--modules", "core,nonesuch"])).code, 2);
    assert.deepEqual(listFiles(dir), [], "a refused init leaves nothing behind");
  });

  it("produces a project every command works on, with nothing to fix", async () => {
    const dir = await started("--name", "Smoke");
    for (const argv of [["status"], ["next"], ["lint"], ["views"], ["views", "--check"], ["meta", "check"]]) {
      const r = await pds(argv, { cwd: dir });
      assert.equal(r.code, 0, `${argv.join(" ")}: ${r.err}${r.out}`);
    }
  });
});

describe("pds new", () => {
  it("makes the id from a slug, and the slug and title from a name", async () => {
    const dir = await started("--name", "Shop", "--no-skeleton", "--adoption", "core");
    assert.equal((await pds(["new", "DOM", "ordering"], { cwd: dir })).code, 0);
    assert.ok(existsSync(recordPath(dir, "DOM-ordering")));
    assert.equal(frontOf(dir, "DOM-ordering").title, "Ordering");
    assert.equal((await pds(["new", "DOM", "Taking Payment & Refunds!"], { cwd: dir })).code, 0);
    assert.equal(frontOf(dir, "DOM-taking-payment-refunds").title, "Taking Payment & Refunds!");
  });

  it("infers the anchor when only one thing could be it, and asks when not", async () => {
    const dir = await started("--name", "Shop", "--no-skeleton", "--adoption", "core");
    const first = await pds(["new", "DOM", "orders"], { cwd: dir });
    assert.equal(first.code, 0);
    assert.match(first.out, /Created definition\/structure\/DOM-orders\.md \(under PROD-shop\)/, "it says where it put it");
    assert.equal(frontOf(dir, "DOM-orders").anchor, "PROD-shop");
    assert.equal((await pds(["new", "DOM", "stock"], { cwd: dir })).code, 0);
    assert.equal(frontOf(dir, "DOM-stock").anchor, "PROD-shop", "a domain goes under the product, not under the other domain, unless told");
    assert.equal(frontOf(dir, "DOM-orders").anchor, "PROD-shop");
    const ambiguous = await pds(["new", "CAP", "checkout"], { cwd: dir });
    assert.equal(ambiguous.code, 2);
    assert.match(ambiguous.err, /there are several\. Pass --anchor with one of: DOM-orders, DOM-stock/);
    assert.equal((await pds(["new", "CAP", "checkout", "--anchor", "DOM-orders"], { cwd: dir })).code, 0);
    assert.equal(frontOf(dir, "CAP-checkout").anchor, "DOM-orders");
    assert.equal((await pds(["new", "DOM", "returns", "--anchor", "DOM-orders"], { cwd: dir })).code, 0, "nesting is allowed when asked for");
    assert.equal(frontOf(dir, "DOM-returns").anchor, "DOM-orders");
  });

  it("starts a record as a stub that lints clean and says what it still needs", async () => {
    const dir = await started("--name", "Shop", "--no-skeleton", "--adoption", "core");
    await pds(["new", "DOM", "orders", "--summary", "Taking an order from basket to confirmation."], { cwd: dir });
    const text = readRecordText(dir, "DOM-orders");
    assert.match(text, /^maturity: stub$/m);
    assert.match(text, /# Still to fill in, by the rung that needs it:/);
    assert.match(text, /# strategic: .*\(outlined\)/);
    assert.equal(analyseRoot(dir).counts.error, 0);
  });

  it("refuses an id that exists, a type that does not, a wrong anchor, a long summary, and a second product", async () => {
    const dir = await started("--name", "Shop", "--no-skeleton", "--adoption", "core");
    await pds(["new", "DOM", "orders"], { cwd: dir });
    const refuse = async (argv, code, pattern) => {
      const r = await pds(argv, { cwd: dir });
      assert.equal(r.code, code, argv.join(" "));
      assert.match(r.err, pattern, argv.join(" "));
    };
    await refuse(["new", "DOM", "orders"], 1, /DOM-orders already exists/);
    await refuse(["new", "WIDGET", "x"], 2, /WIDGET/);
    await refuse(["new", "CAP", "x", "--anchor", "PROD-shop"], 2, /lives under DOM or CAP, not under a PROD/);
    await refuse(["new", "CAP", "x", "--anchor", "DOM-ordrs"], 2, /did you mean DOM-orders\?/);
    await refuse(["new", "DOM", "x", "--summary", "y".repeat(250)], 2, /one line of at most 200 characters; this one is 250/);
    await refuse(["new", "PROD", "second"], 1, /only one/);
  });

  it("will not create a type the project's adoption level does not use", async () => {
    const dir = await started("--name", "Shop", "--no-skeleton", "--adoption", "core");
    const r = await pds(["new", "RISK", "fire"], { cwd: dir });
    assert.equal(r.code, 1);
    assert.match(r.err, /adoption level and this project uses core/);
  });
});

describe("pds rename", () => {
  /** Every file in the project that still mentions an id. */
  const mentioning = (dir, id) =>
    [...snapshot(dir)]
      .filter(([path]) => path.startsWith("definition") || path === "pds.yaml") // generated views and hand-written notes are not the tool's to rewrite
      .filter(([, text]) => new RegExp(`(?<![A-Za-z0-9-])${id}(?![A-Za-z0-9-])`).test(text))
      .map(([p]) => p);

  it("renames the record, its file and every kind of reference to it, and the definition stays as sound as it was", async () => {
    const root = copyExample();
    const before = analyseRoot(root);
    const used = mentioning(root, "RULE-invoice-total");
    assert.ok(used.length >= 5, `referenced from a relation, a flow block, a test, prose and the record itself: ${used.join(", ")}`);
    const r = await pds(["rename", "RULE-invoice-total", "RULE-invoice-amount"], { cwd: root });
    assert.equal(r.code, 0, r.err);
    assert.deepEqual(mentioning(root, "RULE-invoice-total"), [], "nothing still points at the old id");
    assert.ok(existsSync(recordPath(root, "RULE-invoice-amount")));
    assert.ok(!existsSync(recordPath(root, "RULE-invoice-total")));
    const after = analyseRoot(root);
    assert.equal(after.counts.error, 0);
    assert.equal(after.counts.warn, before.counts.warn);
    assert.deepEqual(
      [...after.maturity].map(([id, m]) => [id.replace("RULE-invoice-amount", "RULE-invoice-total"), m.computed]).sort(),
      [...before.maturity].map(([id, m]) => [id, m.computed]).sort(),
      "no element changed rung",
    );
    assert.equal(after.model.out("FEAT-send-invoice", "governed_by").some((e) => e.to === "RULE-invoice-amount"), true);
  });

  it("keeps approvals that were valid valid, by re-sealing them", async () => {
    const root = copyExample();
    assert.equal(found(analyseRoot(root), "GOV-approval-hash").length, 0);
    const r = await pds(["rename", "RULE-invoice-total", "RULE-invoice-amount"], { cwd: root });
    assert.match(r.out, /approval(s)? re-sealed, still valid/);
    assert.equal(found(analyseRoot(root), "GOV-approval-hash").length, 0);
    assert.equal(frontOf(root, "FEAT-send-invoice").approval.state, "approved");
  });

  it("does not rewrite an id that merely begins with the old one", async () => {
    const root = copyExample();
    addRecord(root, "TERM-client-contact", { title: "Client contact", anchor: "PROD-ledgerly", maturity: "stub", summary: "Someone at a client that the owner writes to about an invoice." }, "Sent mail goes to a [[TERM-client-contact]], not to a [[TERM-client]].");
    const r = await pds(["rename", "TERM-client", "TERM-customer"], { cwd: root });
    assert.equal(r.code, 0, r.err);
    const text = readRecordText(root, "TERM-client-contact");
    assert.match(text, /\[\[TERM-client-contact\]\], not to a \[\[TERM-customer\]\]/);
    assert.ok(existsSync(recordPath(root, "TERM-client-contact")));
  });

  it("changes nothing on --dry-run, and says what it would do", async () => {
    const root = copyExample();
    const before = snapshot(root);
    const r = await pds(["rename", "RULE-invoice-total", "RULE-invoice-amount", "--dry-run"], { cwd: root });
    assert.equal(r.code, 0);
    assert.match(r.out, /Would rename RULE-invoice-total to RULE-invoice-amount/);
    assert.match(r.out, /other files? refers? to it/);
    assert.deepEqual([...snapshot(root)], [...before]);
  });

  it("puts everything back exactly when the rename would make the definition worse", async () => {
    const root = copyExample();
    // A one-line summary close to its limit grows past it once the longer id replaces the shorter.
    addRecord(root, "TERM-note", { title: "Note", anchor: "PROD-ledgerly", maturity: "stub", summary: "See TERM-client for the word we use. " + "x".repeat(148) });
    assert.equal(analyseRoot(root).counts.error, 0);
    const before = snapshot(root);
    const r = await pds(["rename", "TERM-client", "TERM-client-with-a-considerably-longer-identifier"], { cwd: root });
    assert.equal(r.code, 3);
    assert.match(r.err, /would introduce 1 new error, so nothing was changed/);
    assert.deepEqual([...snapshot(root)], [...before], "every file is as it was, and the new file is gone");
  });

  it("refuses what it cannot do safely", async () => {
    const root = copyExample();
    const refuse = async (argv, code, pattern) => {
      const r = await pds(["rename", ...argv], { cwd: root });
      assert.equal(r.code, code, argv.join(" "));
      assert.match(r.err, pattern, argv.join(" "));
    };
    await refuse(["RULE-invoice-totl", "RULE-x"], 2, /did you mean RULE-invoice-total\?/);
    await refuse(["RULE-invoice-total", "CAP-invoice-total"], 2, /keeps the type/);
    await refuse(["RULE-invoice-total", "RULE-Invoice"], 2, /not a valid id/);
    await refuse(["RULE-invoice-total", "RULE-invoice-total"], 2, /same as the old one/);
    await refuse(["RULE-invoice-total", "RULE-invoice-number-sequence"], 1, /already exists/);
    await refuse(["FEAT-send-invoice", "FEAT-send-bill", "--title", "Send a bill"], 1, /is approved, and a new title changes what was approved/);
    assert.equal((await pds(["rename", "RULE-invoice-total"], { cwd: root })).code, 2, "needs both ids");
  });

  it("can give a new title with the new id, when the element is not approved", async () => {
    const root = copyExample();
    const r = await pds(["rename", "FEAT-draft-invoice", "FEAT-write-invoice", "--title", "Write an invoice"], { cwd: root });
    assert.equal(r.code, 0, r.err);
    assert.equal(frontOf(root, "FEAT-write-invoice").title, "Write an invoice");
  });

  it("works on a project folder with a views folder, and tells the person to refresh it", async () => {
    const root = copyExample();
    const r = await pds(["rename", "RULE-invoice-total", "RULE-invoice-amount"], { cwd: root });
    assert.match(r.out, /Run `pds views` to refresh the generated views/);
    assert.equal((await pds(["views", "--check"], { cwd: root })).code, 1, "the views are now out of date");
    assert.equal((await pds(["views"], { cwd: root })).code, 0);
    assert.equal((await pds(["views", "--check"], { cwd: root })).code, 0);
  });
});

describe("pds status, next and ask", () => {
  it("reports depth, the queue and what needs attention", async () => {
    const r = await pds(["status"], { cwd: copyExample() });
    assert.equal(r.code, 0);
    assert.match(r.out, /^181 elements · depth \d+%/m);
    assert.match(r.out, /Findings: 0 errors, 2 warnings/);
    assert.match(r.out, /79 unconfirmed skeleton elements/);
    assert.match(r.out, /2 approvals not yet given/);
  });

  it("gives status as JSON", async () => {
    const data = JSON.parse((await pds(["status", "--json"], { cwd: copyExample() })).out);
    assert.equal(data.elements, 181);
    assert.equal(data.byType.FEAT.verifiable, 2);
    assert.equal(Object.values(data.byType).reduce((n, t) => n + t.stub + t.outlined + t.specified + t.verifiable, 0), 181, "every element is counted once, at its computed rung");
  });

  it("puts everything at outlined before anything is specified, top of the spine first", async () => {
    const root = await started("--name", "Q");
    const queue = JSON.parse((await pds(["next", "--limit", "200", "--json"], { cwd: root })).out);
    const rungs = queue.map((q) => q.rung);
    assert.equal(rungs[0], "outlined");
    assert.ok(!rungs.includes("specified") || rungs.lastIndexOf("outlined") < rungs.indexOf("specified"), "everything is outlined before anything is specified");
    const depth = queue.filter((q) => q.rung === "outlined").map((q) => q.depth);
    assert.deepEqual(depth, [...depth].sort((a, b) => a - b), "within a rung, the top of the spine comes first");
  });

  it("limits the queue to one element and what is under it", async () => {
    const r = await pds(["next", "--element", "FEAT-draft-invoice", "--limit", "10"], { cwd: copyExample() });
    assert.match(r.out, /FEAT-draft-invoice/);
    assert.doesNotMatch(r.out, /DOM-billing-and-plans/);
  });

  it("asks, for an element, what stands between it and the next rung", async () => {
    const root = copyExample();
    const r = await pds(["ask", "FEAT-draft-invoice"], { cwd: root });
    assert.match(r.out, /FEAT-draft-invoice · Draft an invoice · Feature/);
    assert.match(r.out, /supports outlined/);
    assert.match(r.out, /To reach specified/);
    assert.match(r.out, /has no flow {2}\(COV-FEAT-flow\)/);
    assert.equal((await pds(["ask", "FEAT-nope"], { cwd: root })).code, 2);
  });

  it("has nothing to ask of a finished element, and says so", async () => {
    const r = await pds(["ask", "FEAT-send-invoice"], { cwd: copyExample() });
    assert.equal(r.code, 0);
    assert.match(r.out, /verifiable/);
  });
});

describe("pds explain", () => {
  it("says what a rule, a check, a gate, a probe, a type, a relation and a view mean", async () => {
    const root = copyExample();
    for (const [name, pattern] of [
      ["COV-FEAT-flow", /flow/i],
      ["GOV-claim", /claim/i],
      ["GATE-skeleton", /skeleton/i],
      ["audit", /audit/i],
      ["FEAT", /feature/i],
      ["accesses", /entit/i],
      ["product-map", /product/i],
    ]) {
      const r = await pds(["explain", name], { cwd: root });
      assert.equal(r.code, 0, `${name}: ${r.err}`);
      assert.match(r.out, pattern, name);
    }
  });

  it("points an element id to the commands that are about elements", async () => {
    const r = await pds(["explain", "FEAT-send-invoice"], { cwd: copyExample() });
    assert.equal(r.code, 2);
    assert.match(r.err, /is an element id, and explain is about what rules, checks, types and relations mean/);
    assert.match(r.err, /pds ask FEAT-send-invoice, pds spec FEAT-send-invoice or pds impact FEAT-send-invoice/);
  });

  it("suggests the nearest name for one that does not exist", async () => {
    const r = await pds(["explain", "COV-FEAT-flw"], { cwd: copyExample() });
    assert.equal(r.code, 2);
    assert.match(r.err, /COV-FEAT-flow/);
  });
});

describe("pds meta and docs", () => {
  it("checks the meta-model against itself and lists what it defines", async () => {
    const check = await pds(["meta", "check"]);
    assert.equal(check.code, 0, check.err);
    assert.match(check.out, /The meta-model is consistent: \d+ element types, \d+ relations, \d+ rules, \d+ checks, \d+ probes, \d+ views/);
    for (const what of ["types", "relations", "rules", "probes", "views", "modules", "profiles"]) {
      const r = await pds(["meta", "list", what]);
      assert.equal(r.code, 0, `${what}: ${r.err}`);
      assert.ok(r.out.trim().length > 0, what);
    }
    assert.equal((await pds(["meta", "list", "nonsense"])).code, 2);
    assert.equal((await pds(["meta"])).code, 2);
  });

  it("writes the reference to a folder, and --check notices when it is out of date", async () => {
    const out = join(scratch(), "reference");
    assert.equal((await pds(["docs", "--out", out])).code, 0);
    const files = listFiles(out);
    assert.ok(files.length >= 6, files.join(", "));
    assert.equal((await pds(["docs", "--out", out, "--check"])).code, 0);
    const victim = join(out, files[0]);
    writeFileSync(victim, readFileSync(victim, "utf8") + "\nhand edit\n");
    const stale = await pds(["docs", "--out", out, "--check"]);
    assert.equal(stale.code, 1);
    assert.match(stale.err + stale.out, /out of date/);
    rmSync(join(out, files[1]));
    assert.equal((await pds(["docs", "--out", out, "--check"])).code, 1, "a missing file is out of date too");
  });

  it("keeps the committed reference in step with the meta-model", async () => {
    const r = await pds(["docs", "--check"]);
    assert.equal(r.code, 0, `${r.err}${r.out}\nRun: node tools/pds.mjs docs`);
  });
});
