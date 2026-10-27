// Approval: a person's decision, bound to content. What one approval covers,
// when it goes stale, who may give it, and what an agent may not do.
import assert from "node:assert/strict";
import { readFileSync, writeFileSync } from "node:fs";
import { describe, it } from "node:test";
import { approvalHash, approvalRoot, approvalUnits, covered } from "../lib/approval.mjs";
import { analyseRoot, copyExample, editFront, editText, found, frontOf, LEDGERLY, pds, readRecordText } from "./helpers.mjs";

const a = analyseRoot(LEDGERLY);
const ids = (els) => els.map((e) => e.id).sort();
const PERSON = "Dana Whitfield";

describe("what one approval covers", () => {
  const root = (id) => approvalRoot(a.model, a.config, id).id;

  it("covers a feature and everything anchored beneath it: its flows, screens, rules, requirements and tests", () => {
    for (const id of ["FLW-send-invoice", "SCR-invoice-review", "MSG-invoice-email"]) assert.equal(root(id), "FEAT-send-invoice", id);
    for (const id of ["FLW-pay-invoice", "SCR-pay-page", "REQ-pay-page-load-time"]) assert.equal(root(id), "FEAT-pay-invoice-online", id);
  });

  it("covers what is shared at a capability's level with the capability, not with its features", () => {
    for (const id of ["ENT-client", "ENT-invoice", "RULE-invoice-total", "STM-invoice-lifecycle", "TST-invoice-total"]) assert.equal(root(id), "CAP-invoicing", id);
    const cap = ids(covered(a.model, a.config, a.model.get("CAP-invoicing")));
    assert.ok(cap.includes("ENT-client"));
    assert.ok(!cap.includes("FEAT-send-invoice") && !cap.includes("FLW-send-invoice"), "each feature is approved on its own");
  });

  it("leaves a domain or the product to approve themselves: they are not units, so an edit anywhere does not stale them", () => {
    assert.equal(root("DOM-invoicing"), "DOM-invoicing");
    assert.equal(root("PROD-ledgerly"), "PROD-ledgerly");
    assert.deepEqual(ids(covered(a.model, a.config, a.model.get("DOM-invoicing"))), ["DOM-invoicing"]);
  });

  it("makes an element under no unit its own root", () => {
    assert.equal(root("REQ-workspace-data-isolation"), "REQ-workspace-data-isolation");
    assert.equal(root("OBL-tax-and-invoicing"), "OBL-tax-and-invoicing");
  });

  it("partitions the definition: every element is covered by exactly one root", () => {
    const owner = new Map();
    for (const el of a.model.elements.values()) {
      const r = approvalRoot(a.model, a.config, el.id);
      assert.ok(covered(a.model, a.config, r).some((e) => e.id === el.id), `${r.id} covers ${el.id}`);
      owner.set(el.id, r.id);
    }
    for (const r of new Set(owner.values())) {
      for (const e of covered(a.model, a.config, a.model.get(r))) assert.equal(owner.get(e.id), r, `${e.id} is covered once, by ${r}`);
    }
  });
});

describe("what an approval is bound to", () => {
  const hashOf = (analysis, id) => approvalHash(analysis.model, analysis.config, analysis.model.get(id));

  it("is the content of everything covered, so an edit anywhere in the unit changes it", () => {
    const root = copyExample();
    const before = analyseRoot(root);
    editText(root, "SCR-invoice-review", (t) => t + "\nAn added sentence.\n");
    assert.notEqual(hashOf(analyseRoot(root), "FEAT-send-invoice"), hashOf(before, "FEAT-send-invoice"));
  });

  it("ignores edits outside the unit: a sibling feature, and the capability's shared elements", () => {
    const root = copyExample();
    const before = analyseRoot(root);
    editText(root, "FLW-pay-invoice", (t) => t + "\nAn added sentence.\n");
    editText(root, "ENT-client", (t) => t + "\nAn added sentence.\n");
    const after = analyseRoot(root);
    assert.equal(hashOf(after, "FEAT-send-invoice"), hashOf(before, "FEAT-send-invoice"));
  });

  it("goes stale on the unit that was edited and no other", () => {
    const root = copyExample();
    editText(root, "FLW-send-invoice", (t) => t + "\nAn added sentence.\n");
    const stale = found(analyseRoot(root), "GOV-approval-hash").map((f) => f.element);
    assert.deepEqual(stale, ["FEAT-send-invoice"], "the capability's own approval is not disturbed by a feature's edit");
  });

  it("goes stale on the capability when something it covers directly changes, and not on its features", () => {
    const root = copyExample();
    editText(root, "ENT-client", (t) => t + "\nAn added sentence.\n");
    assert.deepEqual(found(analyseRoot(root), "GOV-approval-hash").map((f) => f.element), ["CAP-invoicing"]);
  });

  it("is not disturbed by reformatting: blank lines, trailing spaces, comments", () => {
    const root = copyExample();
    editText(root, "FLW-send-invoice", (t) => t.replace("\n## ", "\n\n\n## ").replace(/\n$/, "  \n<!-- a note to self -->\n"));
    assert.equal(found(analyseRoot(root), "GOV-approval-hash").length, 0);
  });
});

describe("what policy asks for", () => {
  it("asks for an approval of each critical unit that claims specified, and says when one exists", () => {
    const units = approvalUnits(a);
    const by = Object.fromEntries(units.map((u) => [u.root, u]));
    assert.equal(by["FEAT-send-invoice"].approved, true);
    assert.equal(by["FEAT-send-invoice"].stale, false);
    assert.equal(by["CAP-collect-payments"].approved, false);
    assert.equal(by["FEAT-pay-invoice-online"].approved, false);
    assert.deepEqual(found(a, "GOV-tier1-approval").map((f) => f.element).sort(), ["CAP-collect-payments", "FEAT-pay-invoice-online"]);
  });

  it("does not ask for the approval of a tier 2 element, or of anything that does not claim specified", () => {
    const roots = new Set(approvalUnits(a).map((u) => u.root));
    assert.ok(!roots.has("FEAT-draft-invoice"), "it claims outlined");
    assert.ok(!roots.has("FEAT-upgrade-plan"), "it is not critical");
  });

  it("asks for more when policy asks for more", () => {
    const root = copyExample();
    editFront(root, "FEAT-upgrade-plan", (f) => (f.maturity = "specified"));
    writeFileSync(`${root}/pds.yaml`, readFileSync(`${root}/pds.yaml`, "utf8") + "policy:\n  approval:\n    required_for_tiers: [1, 2]\n");
    const more = approvalUnits(analyseRoot(root)).map((u) => u.root);
    assert.ok(more.includes("FEAT-upgrade-plan"));
  });

  it("rejects a policy that does not make sense", () => {
    const root = copyExample();
    writeFileSync(`${root}/pds.yaml`, readFileSync(`${root}/pds.yaml`, "utf8") + "policy:\n  approval:\n    required_for_tiers: [4]\n    from: finished\n    units: [WIDGET]\n    colour: red\n");
    const msgs = found(analyseRoot(root), "SCH-project").map((f) => f.msg);
    assert.ok(msgs.some((m) => /required_for_tiers/.test(m)));
    assert.ok(msgs.some((m) => /policy.approval.from/.test(m)));
    assert.ok(msgs.some((m) => /units must be a list/.test(m)));
    assert.ok(msgs.some((m) => /unknown key colour/.test(m)));
  });
});

describe("pds approve", () => {
  const dana = (id, ...more) => ["approve", id, "--by", PERSON, ...more];

  it("approves a unit, binds it to its content, and clears the warning that asked for it", async () => {
    const root = copyExample();
    const r = await pds(dana("FEAT-pay-invoice-online"), { cwd: root });
    assert.equal(r.code, 0, r.err);
    assert.match(r.out, /Approved FEAT-pay-invoice-online as Dana Whitfield on 2026-10-27/);
    assert.match(r.out, /Covers FEAT-pay-invoice-online and the \d+ elements beneath it/);
    const front = frontOf(root, "FEAT-pay-invoice-online");
    assert.deepEqual([front.approval.state, front.approval.by, front.approval.at], ["approved", PERSON, "2026-10-27"]);
    assert.match(front.approval.hash, /^sha256:[0-9a-f]{16}$/);
    assert.equal(front.reviewed, "2026-10-27");
    const after = analyseRoot(root);
    assert.equal(found(after, "GOV-tier1-approval", "FEAT-pay-invoice-online").length, 0);
    assert.equal(found(after, "GOV-approval-hash").length, 0);
  });

  it("records a note with the approval", async () => {
    const root = copyExample();
    assert.equal((await pds(dana("FEAT-pay-invoice-online", "--note", "Subject to the provider's attestation"), { cwd: root })).code, 0);
    assert.equal(frontOf(root, "FEAT-pay-invoice-online").approval.note, "Subject to the provider's attestation");
  });

  it("shows the edit that followed an approval, and approving again fixes it", async () => {
    const root = copyExample();
    editText(root, "FLW-send-invoice", (t) => t + "\nAn added sentence.\n");
    assert.equal(found(analyseRoot(root), "GOV-approval-hash", "FEAT-send-invoice").length, 1);
    const r = await pds(dana("FEAT-send-invoice"), { cwd: root });
    assert.equal(r.code, 0, r.err);
    assert.equal(found(analyseRoot(root), "GOV-approval-hash").length, 0);
  });

  it("refuses anyone who is not a listed approver, and writes nothing", async () => {
    const root = copyExample();
    const before = readRecordText(root, "FEAT-pay-invoice-online");
    const r = await pds(["approve", "FEAT-pay-invoice-online", "--by", "Someone Else"], { cwd: root });
    assert.equal(r.code, 1);
    assert.match(r.err, /Someone Else is not a listed approver \(Dana Whitfield\)/);
    assert.equal(readRecordText(root, "FEAT-pay-invoice-online"), before);
  });

  it("is refused outright when an agent is driving, with or without --force", async () => {
    const root = copyExample();
    const before = readRecordText(root, "FEAT-pay-invoice-online");
    for (const extra of [[], ["--force"]]) {
      const r = await pds(dana("FEAT-pay-invoice-online", ...extra), { cwd: root, env: { PDS_AGENT: "1" } });
      assert.equal(r.code, 1);
      assert.match(r.err, /agents propose, people approve/);
    }
    assert.equal(readRecordText(root, "FEAT-pay-invoice-online"), before);
  });

  it("refuses to approve what claims more than it supports, naming the element", async () => {
    const root = copyExample();
    editFront(root, "SCR-pay-page", (f) => (f.maturity = "verifiable")); // a screen can be complete, but there is nothing to verify about it
    const r = await pds(dana("FEAT-pay-invoice-online"), { cwd: root });
    assert.equal(r.code, 1);
    assert.match(r.err, /SCR-pay-page claims verifiable but the definition supports specified/);
  });

  it("refuses a skeleton, and says what to do", async () => {
    const root = copyExample();
    const r = await pds(dana("DOM-workspaces-and-teams"), { cwd: root });
    assert.equal(r.code, 1);
    assert.match(r.err, /is a skeleton: confirm it first and set origin: human/);
  });

  it("refuses an element that has errors of its own, but not for the approval being absent", async () => {
    const root = copyExample();
    editFront(root, "REQ-pay-page-load-time", (f) => (f.kind = "wish"));
    const r = await pds(dana("FEAT-pay-invoice-online"), { cwd: root });
    assert.equal(r.code, 1);
    assert.match(r.err, /REQ-pay-page-load-time has 1 error: SCH-field-type/);
  });

  it("can be forced, and still says what was overridden", async () => {
    const root = copyExample();
    editFront(root, "SCR-pay-page", (f) => (f.maturity = "verifiable"));
    const r = await pds(dana("FEAT-pay-invoice-online", "--force"), { cwd: root });
    assert.equal(r.code, 0, r.err);
    assert.match(r.out, /Approved despite:/);
    assert.match(r.out, /SCR-pay-page claims verifiable/);
  });

  it("revokes an approval, leaving a draft that policy asks about again", async () => {
    const root = copyExample();
    const r = await pds(["approve", "FEAT-send-invoice", "--revoke"], { cwd: root });
    assert.equal(r.code, 0, r.err);
    assert.equal(frontOf(root, "FEAT-send-invoice").approval, undefined);
    assert.equal(found(analyseRoot(root), "GOV-tier1-approval", "FEAT-send-invoice").length, 1);
    assert.equal((await pds(["approve", "FEAT-send-invoice", "--revoke"], { cwd: root })).code, 1, "nothing left to revoke");
  });

  it("needs an element that exists, and a name", async () => {
    const root = copyExample();
    const missing = await pds(dana("FEAT-send-invoicee"), { cwd: root });
    assert.equal(missing.code, 2);
    assert.match(missing.err, /did you mean FEAT-send-invoice\?/);
    assert.equal((await pds(["approve", "FEAT-send-invoice"], { cwd: root })).code, 2);
    assert.equal((await pds(["approve"], { cwd: root })).code, 2);
  });

  it("will not approve in a project that names no approvers", async () => {
    const root = copyExample();
    writeFileSync(`${root}/pds.yaml`, readFileSync(`${root}/pds.yaml`, "utf8").replace(/^approvers:.*\n/m, ""));
    const r = await pds(dana("FEAT-pay-invoice-online"), { cwd: root });
    assert.equal(r.code, 1);
    assert.match(r.err, /lists no approvers/);
  });
});
