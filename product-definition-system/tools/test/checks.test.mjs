// Every coded check, shown to fire. Each case takes a private copy of the worked
// example (which lints clean of errors), breaks it in one precise way, and
// expects the finding that breakage deserves, on the element it belongs to.
// A check nobody has seen fail is a check nobody can trust, so a check with no
// case here fails the suite.
import assert from "node:assert/strict";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import { IMPLEMENTATIONS } from "../lib/checks/index.mjs";
import { addRecord, analyseRoot, copyExample, editFront, editText, found, LEDGERLY, meta, moveRecord, readRecordText, writeRecordText } from "./helpers.mjs";

const baseline = analyseRoot(LEDGERLY);

/** Append text to a record's body. */
const append = (text) => (t) => t.replace(/\s*$/, "\n") + text;
const SENTENCE = "An added sentence nobody approved.\n";
const withReason = "pds: 1\nname: Ledgerly\nprofile: saas\nadoption: standard\nmodules: [core, tenancy, identity, commercial, integrations, compliance, lifecycle-comms]\napprovers: [Dana Whitfield]\n";

// `element` matches the finding's element; `path` matches the end of its file path (for records
// that never become elements); `msg` must match the message; `once` insists on a single report.
const CASES = [
  // ---- schema
  { code: "SCH-project", path: "pds.yaml", name: "switching a rule off without saying why", apply: (r) => writeFileSync(join(r, "pds.yaml"), withReason + "rules:\n  disable:\n    - {id: QLT-vague, reason: nope}\n"), msg: /give a reason/ },
  { code: "SCH-project", path: "pds.yaml", name: "trying to switch off a check that keeps the definition consistent", apply: (r) => writeFileSync(join(r, "pds.yaml"), withReason + 'rules:\n  disable:\n    - {id: GOV-claim, reason: "We would rather not be told about claims"}\n'), msg: /cannot be switched off/, label: "error-level check" },
  { code: "SCH-frontmatter", path: "TERM-client.md", name: "a record whose frontmatter does not parse", apply: (r) => editText(r, "TERM-client", (t) => t.replace("\n---\n", "\nnote: has: a colon\n---\n")), msg: /does not parse/ },
  { code: "SCH-id-form", path: "TERM-client.md", name: "an id whose slug is not lowercase kebab", apply: (r) => editFront(r, "TERM-client", (f) => (f.id = "TERM-Client")) },
  { code: "SCH-id-file", element: "TERM-client", name: "a record stored in the wrong family folder", apply: (r) => moveRecord(r, "TERM-client", "experience") },
  { code: "SCH-id-unique", element: "TERM-client", name: "two records with one id", apply: (r) => writeFileSync(join(r, "definition", "experience", "TERM-client.md"), readRecordText(r, "TERM-client")) },
  { code: "SCH-envelope", element: "TERM-client", name: "a record with no title", apply: (r) => editFront(r, "TERM-client", (f) => delete f.title), msg: /needs a title/ },
  { code: "SCH-field-type", element: "TERM-client", name: "a maturity that is not on the ladder", apply: (r) => editFront(r, "TERM-client", (f) => (f.maturity = "perfect")) },
  { code: "SCH-field-type", element: "REQ-pay-page-load-time", name: "an enum field with a value outside its list", apply: (r) => editFront(r, "REQ-pay-page-load-time", (f) => (f.kind = "wish")), label: "enum" },
  { code: "SCH-anchor", element: "FLW-pay-invoice", name: "an element anchored under a type that may not hold it", apply: (r) => editFront(r, "FLW-pay-invoice", (f) => (f.anchor = "PERS-solo-designer")) },
  { code: "SCH-singleton", name: "a second product record", apply: (r) => writeFileSync(join(r, "definition", "intent", "PROD-other.md"), readRecordText(r, "PROD-ledgerly").replace("id: PROD-ledgerly", "id: PROD-other")), msg: /only one product/ },
  { code: "SCH-rel-key", element: "ENT-client", name: "a relation name the model does not know", apply: (r) => editFront(r, "ENT-client", (f) => (f.rel = { invented_relation: ["ENT-invoice"] })), msg: /unknown relation invented_relation/ },
  { code: "SCH-rel-key", element: "ENT-client", name: "the derived side of a relation written by hand", apply: (r) => editFront(r, "ENT-client", (f) => (f.rel = { served_by: ["OBJ-paid-faster"] })), msg: /derived side/, label: "derived side" },
  { code: "SCH-rel-pair", element: "ENT-client", name: "a relation between types it does not allow", apply: (r) => editFront(r, "ENT-client", (f) => (f.rel = { governed_by: ["ENT-invoice"] })), once: true, msg: /ENT cannot point governed_by at a ENT/ },
  { code: "SCH-block", path: "FLW-pay-invoice.md", name: "a structured block that is not valid YAML", apply: (r) => editText(r, "FLW-pay-invoice", (t) => t.replace("entry: view", "entry: [view")), msg: /pds-flow/ },
  { code: "SCH-section", element: "FLW-pay-invoice", name: "the same heading twice in one record", apply: (r) => editText(r, "FLW-pay-invoice", append("## Notes\n\nA second notes section with enough words.\n")), msg: /appears twice/ },
  { code: "SCH-summary", element: "TERM-client", name: "a summary longer than a sentence can be", apply: (r) => editFront(r, "TERM-client", (f) => (f.summary = "A client is a business that a workspace sends invoices to. ".repeat(5))), msg: /the limit is 200/ },

  // ---- references
  { code: "REF-target", element: "FEAT-pay-invoice-online", name: "a relation pointing at an element that does not exist", apply: (r) => editFront(r, "FEAT-pay-invoice-online", (f) => (f.rel = { ...f.rel, governed_by: ["RULE-nonexistent"] })), msg: /RULE-nonexistent/ },
  { code: "REF-target", element: "FLW-pay-invoice", name: "a flow step performed by an actor that does not exist", apply: (r) => editText(r, "FLW-pay-invoice", (t) => t.replace("actor: ACT-client", "actor: ACT-ghost")), msg: /ACT-ghost.*step view/, label: "flow step" },
  { code: "REF-mention", element: "TERM-client", name: "a [[wikilink]] to an element that does not exist", apply: (r) => editText(r, "TERM-client", append("See also [[ENT-ghost]].\n")), msg: /ENT-ghost/ },
  { code: "REF-anchor-cycle", name: "anchors that lead back to where they started", apply: (r) => editFront(r, "DOM-invoicing", (f) => (f.anchor = "CAP-invoicing")) },
  { code: "REF-retired", name: "a live element that still points at a retired one", apply: (r) => editFront(r, "ENT-client", (f) => ((f.lifecycle = "retired"), (f.lifecycle_note = "Replaced by a contact record."))), msg: /ENT-client, which is retired/ },
  {
    code: "REF-depth",
    name: "domains nested four deep",
    apply: (r) => {
      editFront(r, "DOM-trust-and-compliance", (f) => (f.anchor = "DOM-invoicing"));
      editFront(r, "DOM-integrations-and-api", (f) => (f.anchor = "DOM-trust-and-compliance"));
      editFront(r, "DOM-insights-and-reporting", (f) => (f.anchor = "DOM-integrations-and-api"));
    },
    element: "DOM-insights-and-reporting",
    msg: /nested 4 levels/,
  },

  // ---- coherence
  { code: "COH-flow-shape", element: "FLW-pay-invoice", name: "a step that continues to a step that does not exist", apply: (r) => editText(r, "FLW-pay-invoice", (t) => t.replace("    next: choose-amount", "    next: nowhere")), msg: /nowhere/ },
  { code: "COH-flow-reach", element: "FLW-pay-invoice", name: "a flow step nothing leads to", apply: (r) => editText(r, "FLW-pay-invoice", (t) => t.replace("    end: abort\n```", "    end: abort\n  - id: orphan\n    does: Never reached\n    end: abort\n```")), msg: /orphan/ },
  { code: "COH-flow-ends", element: "FLW-pay-invoice", name: "a critical flow with no way of failing", apply: (r) => editText(r, "FLW-pay-invoice", (t) => t.replace("end: failure", "end: success").replace("end: abort", "end: success")), msg: /no failure or abort end/ },
  { code: "COH-flow-refs", element: "FLW-pay-invoice", name: "a flow step that moves a transition the state machine does not have", apply: (r) => editText(r, "FLW-pay-invoice", (t) => t.replace('"sent->paid"', '"sent->refunded"')), msg: /sent->refunded/ },
  {
    code: "COH-flow-size",
    element: "FLW-big",
    name: "a flow with more steps than a person can follow",
    apply: (r) => {
      const steps = Array.from({ length: 26 }, (_, i) => (i === 25 ? `  - {id: s${i}, does: Done, end: success}` : `  - {id: s${i}, does: Step ${i}, next: s${i + 1}}`));
      addRecord(r, "FLW-big", { title: "A very long flow", anchor: "FEAT-send-invoice", maturity: "stub" }, "```pds-flow\nentry: s0\nsteps:\n" + steps.join("\n") + "\n```");
    },
    msg: /26 steps/,
  },
  { code: "COH-stm-shape", element: "STM-invoice-lifecycle", name: "a transition into a state that does not exist", apply: (r) => editText(r, "STM-invoice-lifecycle", (t) => t.replace("from: sent, to: void", "from: sent, to: cancelled")), msg: /cancelled/ },
  {
    code: "COH-stm-driven",
    element: "STM-invoice-lifecycle",
    name: "a transition caused by an actor, when no flow performs it",
    apply: (r) => {
      editFront(r, "STM-invoice-lifecycle", (f) => (f.maturity = "verifiable")); // the check applies to what claims to be verifiable
      editText(r, "FLW-send-invoice", (t) => t.replace(/ {4}moves: .*\n/, ""));
    },
    msg: /draft->sent is caused by ACT-account-owner but no flow moves it/,
  },
  { code: "COH-ent-attributes", element: "ENT-client", name: "an entity that says it holds no personal data, with a personal attribute", apply: (r) => editFront(r, "ENT-client", (f) => (f.pii = false)), msg: /holds no personal data/ },
  { code: "COH-payload", element: "EVT-invoice-sent", name: "an event that says it carries no personal data, with a personal field", apply: (r) => editFront(r, "EVT-invoice-sent", (f) => (f.pii = false)), msg: /carries no personal data/ },
  { code: "COH-journey", element: "JRN-first-invoice", name: "a feeling outside the 1 to 5 scale", apply: (r) => editText(r, "JRN-first-invoice", (t) => t.replace("feeling: 3", "feeling: 9")), msg: /feeling must be/ },
  { code: "COH-plan-entitlements", element: "PLAN-team", name: "a limit granted a value that is not a number", apply: (r) => editText(r, "PLAN-team", (t) => t.replace("value: unlimited", "value: lots")), msg: /whole number/ },
  { code: "COH-rule-examples", element: "RULE-invoice-total", name: "a rule shown only where it holds", apply: (r) => editFront(r, "RULE-invoice-total", (f) => (f.examples = f.examples.filter((e) => e.case === "positive"))), msg: /negative or edge/ },
  { code: "COH-screen-states", element: "SCR-invoice-review", name: "a data screen that does not say what loading, empty and error look like", apply: (r) => editFront(r, "SCR-invoice-review", (f) => (f.states = ["ready"])), msg: /loading, empty, error/ },
  { code: "COH-facets", element: "FEAT-send-invoice", name: "a feature declaring false a facet its relations make true", apply: (r) => editFront(r, "FEAT-send-invoice", (f) => (f.facets = { ...f.facets, handles_money: false })), msg: /handles_money/ },
  { code: "COH-role-limits", element: "ROLE-owner", name: "a role needing at least one holder and allowing none", apply: (r) => editFront(r, "ROLE-owner", (f) => (f.max_holders = 0)), msg: /exceeds max_holders/ },
  {
    code: "COH-dependency-cycle",
    name: "two features that each hard-depend on the other",
    apply: (r) => {
      editFront(r, "FEAT-send-invoice", (f) => (f.rel.depends_on = ["FEAT-pay-invoice-online"]));
      editFront(r, "FEAT-pay-invoice-online", (f) => (f.rel = { ...f.rel, depends_on: ["FEAT-send-invoice"] }));
    },
    msg: /form a cycle/,
  },
  { code: "COH-supersedes", element: "FEAT-send-invoice", name: "an element superseded by a successor while it is still active", apply: (r) => editFront(r, "FEAT-draft-invoice", (f) => (f.rel = { ...f.rel, supersedes: ["FEAT-send-invoice"] })), msg: /still active/ },
  { code: "COH-release-scope", element: "RLS-first-release", name: "a release that includes a retired element", apply: (r) => editFront(r, "FEAT-draft-invoice", (f) => ((f.lifecycle = "retired"), (f.lifecycle_note = "Folded into sending."))), msg: /FEAT-draft-invoice, which is retired/ },
  { code: "COH-tier-order", element: "FEAT-send-invoice", name: "a critical feature under a capability marked less important", apply: (r) => editFront(r, "CAP-invoicing", (f) => (f.tier = 3)), msg: /tier 1 but sits under CAP-invoicing, tier 3/ },
  { code: "COH-qst-answer", element: "QST-overpayment", name: "an open question that already carries an answer", apply: (r) => editFront(r, "QST-overpayment", (f) => (f.answer = "Refuse the second payment.")), msg: /open but carries an answer/ },

  // ---- quality
  { code: "QLT-req-form", element: "REQ-pay-page-load-time", name: "a requirement that is not in shall form", apply: (r) => editFront(r, "REQ-pay-page-load-time", (f) => (f.statement = "Invoices appear in 2 seconds.")) },
  { code: "QLT-req-single", element: "REQ-pay-page-load-time", name: "a requirement with two shalls", apply: (r) => editFront(r, "REQ-pay-page-load-time", (f) => (f.statement = "When a client opens the pay page, the system shall show the invoice within 2 seconds and shall record the view.")) },
  { code: "QLT-vague", element: "REQ-pay-page-load-time", name: "a requirement using a word that cannot be tested", apply: (r) => editFront(r, "REQ-pay-page-load-time", (f) => (f.statement = "When a client opens the pay page, the system shall show the invoice quickly.")), msg: /quickly/ },
  { code: "QLT-req-measurable", element: "REQ-pay-page-load-time", name: "a quality requirement with no number in it", apply: (r) => editFront(r, "REQ-pay-page-load-time", (f) => (f.statement = "When a client opens the pay page, the system shall show the invoice promptly.")) },
  { code: "QLT-placeholder", element: "FLW-pay-invoice", name: "a specified record that still says TBD", apply: (r) => editText(r, "FLW-pay-invoice", (t) => t.replace("## Notes\n\n", "## Notes\n\nTBD whether a receipt is also sent by post.\n\n")) },
  { code: "QLT-gherkin", element: "TST-invoice-total", name: "a scenario with two When-Then pairs", apply: (r) => editText(r, "TST-invoice-total", (t) => t.replace("    Then the invoice cannot be saved as ready", "    Then the invoice cannot be saved as ready\n    When the owner tries again\n    Then it still cannot be saved")) },
  { code: "QLT-summary", element: "TERM-client", name: "a summary that only repeats the title", apply: (r) => editFront(r, "TERM-client", (f) => (f.summary = "The client.")) },
  { code: "QLT-term-avoid", element: "UC-invoice-a-client", name: "prose using a word the glossary says to avoid", apply: (r) => editText(r, "UC-invoice-a-client", append("The designer then sends the bill.\n")), msg: /bill/ },
  { code: "QLT-term-duplicate", name: "two glossary entries defining one word", apply: (r) => addRecord(r, "TERM-customer-of-owner", { title: "Client", anchor: "PROD-ledgerly", maturity: "stub" }), msg: /defines “client”/ },
  { code: "QLT-duplicate", name: "two elements with the same title under the same anchor", apply: (r) => addRecord(r, "FEAT-draft-invoice-copy", { title: "Draft an invoice", anchor: "CAP-invoicing", maturity: "stub" }), msg: /same title as FEAT-draft-invoice/ },
  { code: "QLT-sys-reference", name: "a system component record that has grown into a design document", apply: (r) => addRecord(r, "SYS-queue", { title: "Job queue", anchor: "PROD-ledgerly", maturity: "stub" }, "## Notes\n\n" + "design ".repeat(200)), msg: /a reference, not a design/ },
  { code: "QLT-title", element: "TERM-client", name: "a title that is too long to scan", apply: (r) => editFront(r, "TERM-client", (f) => (f.title = "A very long title that goes on and on well past the point where anyone could take it in at a glance")) },

  // ---- governance
  { code: "GOV-claim", element: "FEAT-draft-invoice", name: "claiming a rung the definition does not support", apply: (r) => editFront(r, "FEAT-draft-invoice", (f) => (f.maturity = "verifiable")) },
  { code: "GOV-approval-hash", element: "FEAT-send-invoice", name: "editing an approved element", apply: (r) => editText(r, "FEAT-send-invoice", append(SENTENCE)) },
  { code: "GOV-approval-hash", element: "FEAT-send-invoice", name: "editing something anchored beneath an approved feature", apply: (r) => editText(r, "FLW-send-invoice", append(SENTENCE)), label: "child" },
  { code: "GOV-approval-authority", element: "FEAT-send-invoice", name: "an approval by someone who is not an approver", apply: (r) => editFront(r, "FEAT-send-invoice", (f) => (f.approval = { ...f.approval, by: "Somebody Else" })), msg: /Somebody Else/ },
  { code: "GOV-tier1-approval", element: "FEAT-send-invoice", name: "a critical feature claiming specified with no approval at all", apply: (r) => editFront(r, "FEAT-send-invoice", (f) => delete f.approval), msg: /nobody has approved it/ },
  { code: "GOV-skeleton", element: "DOM-workspaces-and-teams", name: "a skeleton record claiming to be specified", apply: (r) => editFront(r, "DOM-workspaces-and-teams", (f) => (f.maturity = "specified")) },
  { code: "GOV-lifecycle-note", element: "TERM-client", name: "deprecating an element without saying why", apply: (r) => editFront(r, "TERM-client", (f) => (f.lifecycle = "deprecated")) },
  { code: "GOV-freshness", element: "FEAT-send-invoice", name: "an approved critical element not reviewed within its cadence", apply: (r) => editFront(r, "FEAT-send-invoice", (f) => (f.reviewed = "2026-01-01")), msg: /tier 1 is reviewed every 60/ },
  { code: "GOV-overdue", element: "QST-overpayment", name: "an open question past its due date", apply: (r) => editFront(r, "QST-overpayment", (f) => (f.due = "2026-01-15")) },
  { code: "GOV-blocking-question", name: "a blocking open question against an element claiming specified", apply: (r) => editFront(r, "QST-overpayment", (f) => (f.blocking = true)) },

  // ---- probes
  { code: "PRB-disposition", element: "FEAT-send-invoice", name: "a probe answered two ways at once", apply: (r) => editFront(r, "FEAT-send-invoice", (f) => (f.probes.audit = { na: "Not applicable here", addressed: ["TST-confirm-and-send"] })), msg: /exactly one of/ },
  { code: "PRB-disposition", element: "FEAT-send-invoice", name: "a deferral that names no date or question", apply: (r) => editFront(r, "FEAT-send-invoice", (f) => (f.probes.audit = { deferred: "Decided after the beta" })), msg: /needs `until`/, label: "deferral" },
  { code: "PRB-addressed", element: "FEAT-send-invoice", name: "a probe answered by an element of a type it does not accept", apply: (r) => editFront(r, "FEAT-send-invoice", (f) => (f.probes.audit = { addressed: ["TERM-client"] })) },
  { code: "PRB-unknown", element: "FEAT-send-invoice", name: "a probe the catalogue does not have", apply: (r) => editFront(r, "FEAT-send-invoice", (f) => (f.probes.made_up = { na: "Not a real concern" })), msg: /made_up does not exist/ },
];

describe("each coded check fires on the breakage it exists for", () => {
  for (const c of CASES) {
    it(`${c.code}: ${c.name}`, () => {
      const root = copyExample();
      const select = (analysis) => found(analysis, c.code).filter((f) => (c.element ? f.element === c.element : c.path ? f.path?.endsWith(c.path) : true));
      assert.equal(select(baseline).length, 0, "the example has no such finding to begin with");
      c.apply(root);
      const hits = select(analyseRoot(root));
      assert.ok(hits.length > 0, `expected ${c.code}${c.element ? " on " + c.element : ""}${c.path ? " in " + c.path : ""}`);
      if (c.msg) assert.ok(hits.some((h) => c.msg.test(h.msg)), `the message should match ${c.msg}; got: ${hits.map((h) => h.msg).join(" | ")}`);
      if (c.once) assert.equal(hits.length, 1, `one breakage should be reported once; got: ${hits.map((h) => h.msg).join(" | ")}`);
    });
  }
});

describe("what the checks as a whole must do", () => {
  it("has a case above for every declared check", () => {
    const covered = new Set(CASES.map((c) => c.code));
    assert.deepEqual(meta.checks.map((c) => c.id).filter((id) => !covered.has(id)), [], "a new check needs a case here");
    for (const c of meta.checks) assert.ok(IMPLEMENTATIONS[c.id], `${c.id} is declared but not implemented`);
  });

  it("reports a check that crashes, so a bug in a check never reads as 'all clear'", () => {
    const original = IMPLEMENTATIONS["QLT-title"];
    IMPLEMENTATIONS["QLT-title"] = () => {
      throw new Error("boom");
    };
    try {
      const failed = found(analyseRoot(LEDGERLY), "QLT-title");
      assert.equal(failed.length, 1);
      assert.match(failed[0].msg, /the check itself failed: boom/);
      assert.equal(failed[0].sev, "error");
    } finally {
      IMPLEMENTATIONS["QLT-title"] = original;
    }
  });

  it("lets a vague word through when the same sentence gives the number that makes it testable", () => {
    const root = copyExample();
    editFront(root, "REQ-pay-page-load-time", (f) => (f.statement = "When a client opens the pay page, the system shall show the invoice quickly, within 2 seconds."));
    assert.equal(found(analyseRoot(root), "QLT-vague").length, 0);
  });

  it("stops reporting a rule a project switches off with a stated reason, and only that rule", () => {
    const root = copyExample();
    editFront(root, "REQ-pay-page-load-time", (f) => (f.statement = "When a client opens the pay page, the system shall show the invoice quickly."));
    editFront(root, "TERM-client", (f) => (f.title = "A very long title that goes on and on well past the point where anyone could take it in at a glance"));
    const before = analyseRoot(root);
    assert.ok(found(before, "QLT-vague").length > 0 && found(before, "QLT-title").length > 0);
    writeFileSync(join(root, "pds.yaml"), withReason + 'rules:\n  disable:\n    - {id: QLT-vague, reason: "Marketing copy is allowed to be vague in this product"}\n');
    const after = analyseRoot(root);
    assert.equal(found(after, "QLT-vague").length, 0);
    assert.ok(found(after, "QLT-title").length > 0, "other rules keep running");
    assert.equal(found(after, "SCH-project").length, 0);
  });

  it("reports findings that are a function of the files alone: repairing the file clears the finding", () => {
    const root = copyExample();
    const original = readRecordText(root, "FEAT-send-invoice");
    editText(root, "FEAT-send-invoice", append(SENTENCE));
    assert.ok(found(analyseRoot(root), "GOV-approval-hash", "FEAT-send-invoice").length > 0);
    writeRecordText(root, "FEAT-send-invoice", original);
    assert.equal(found(analyseRoot(root), "GOV-approval-hash").length, 0);
  });

  it("is deterministic: analysing the same files twice gives the same findings in the same order", () => {
    const a = analyseRoot(LEDGERLY).findings.map((f) => `${f.sev} ${f.id} ${f.element} ${f.msg}`);
    const b = analyseRoot(LEDGERLY).findings.map((f) => `${f.sev} ${f.id} ${f.element} ${f.msg}`);
    assert.deepEqual(a, b);
  });
});
