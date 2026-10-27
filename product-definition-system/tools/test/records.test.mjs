// Reading a record: frontmatter, sections, structured blocks, [[mentions]], and
// the content hash that approvals are bound to.
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { contentHash, ID_RE, readRecord, splitFrontmatter, stripComments } from "../lib/records.mjs";

const doc = (front, body = "") => `---\n${front}\n---\n${body}`;

describe("ids", () => {
  it("accepts TYPE-kebab-slug and nothing looser", () => {
    for (const ok of ["FEAT-send-invoice", "PROD-x", "ENT-a1-b2", "UC-3"]) assert.match(ok, ID_RE, ok);
    for (const bad of ["feat-send-invoice", "FEAT-Send", "FEAT-", "FEAT_send", "FEAT-send--invoice", "FEAT-send-", "F-x", "FEATURE-x", "FEAT-send invoice", "-x"]) assert.doesNotMatch(bad, ID_RE, bad);
  });
});

describe("comments", () => {
  it("are removed but keep every newline, so line numbers stay true", () => {
    const text = "a\n<!-- one\ntwo -->\nb";
    assert.equal(stripComments(text).split("\n").length, text.split("\n").length);
    assert.equal(stripComments(text).replace(/\n+/g, "|"), "a|b");
  });
});

describe("readRecord", () => {
  it("reads frontmatter and exposes the id", () => {
    const r = readRecord("p.md", doc("id: FEAT-a\ntitle: A thing\ntags: [x, y]", "\n## Purpose\n\nWords here.\n"));
    assert.equal(r.ok, true);
    assert.equal(r.id, "FEAT-a");
    assert.deepEqual(r.front.tags, ["x", "y"]);
  });

  it("reports a missing or broken frontmatter without throwing, and says where", () => {
    const none = readRecord("p.md", "# just prose\n");
    assert.equal(none.ok, false);
    assert.equal(none.problems[0].id, "SCH-frontmatter");
    const broken = readRecord("p.md", doc("id: FEAT-a\nnote: has: a colon"));
    assert.equal(broken.ok, false);
    assert.match(broken.problems[0].msg, /does not parse/);
    assert.equal(broken.problems[0].line, 3, "the line of the offending key, counted from the top of the file");
    const notMap = readRecord("p.md", doc("- a\n- b"));
    assert.equal(notMap.ok, false);
  });

  it("normalises Windows line endings", () => {
    const r = readRecord("p.md", "---\r\nid: FEAT-a\r\ntitle: A\r\n---\r\n\r\n## Purpose\r\n\r\nSome words here.\r\n");
    assert.equal(r.ok, true);
    assert.equal(r.sections.find((s) => s.heading === "Purpose").words, 3);
  });

  it("splits the body at level-2 headings and counts the words under each", () => {
    const r = readRecord("p.md", doc("id: FEAT-a", "\nIntro words.\n\n## Purpose\n\nOne two three four.\n\n### Not a section\n\nstill purpose text\n\n## Rules\n\nShort.\n"));
    assert.deepEqual(r.sections.map((s) => [s.heading, s.words]), [["", 2], ["Purpose", 10], ["Rules", 1]], "a level-3 heading does not start a section; its words count towards the one above");
  });

  it("ignores comments for sections and mentions but keeps the line numbers", () => {
    const r = readRecord("p.md", doc("id: FEAT-a", "\n<!-- ## Hidden\n[[ENT-x]] -->\n## Shown\n\nSee [[ENT-y]].\n"));
    assert.deepEqual(r.sections.map((s) => s.heading), ["", "Shown"]);
    assert.deepEqual(r.mentions, [{ id: "ENT-y", line: 9 }]);
  });

  it("finds [[mentions]], with or without a label, and not inside code", () => {
    const r = readRecord("p.md", doc("id: FEAT-a", "\nSee [[ENT-a]] and [[ENT-b|the other]] but not `[[ENT-c]]` or [[not-an-id]].\n\n```\n[[ENT-d]]\n```\n"));
    assert.deepEqual(r.mentions.map((m) => m.id), ["ENT-a", "ENT-b"]);
  });

  it("treats fenced text as neither prose nor headings", () => {
    const r = readRecord("p.md", doc("id: FEAT-a", "\n## Notes\n\nReal prose.\n\n```text\n## Fake heading\nfake words that must not count\n```\n"));
    assert.deepEqual(r.sections.map((s) => s.heading), ["", "Notes"]);
    assert.equal(r.sections[1].words, 2);
  });

  it("parses pds-* blocks, keeps their text and line, and reports one that is broken", () => {
    const r = readRecord("p.md", doc("id: FLW-a", "\n```pds-flow\nentry: a\nsteps:\n  - {id: a, end: success}\n```\n\n```pds-states\nstates: [oops\n```\n\n```gherkin\nFeature: x\n```\n"));
    const flow = r.blocks.find((b) => b.name === "pds-flow");
    assert.deepEqual(flow.data, { entry: "a", steps: [{ id: "a", end: "success" }] });
    assert.equal(flow.line, 6, "the first line of the block's content, counted from the top of the file");
    const states = r.blocks.find((b) => b.name === "pds-states");
    assert.ok(states.error, "a block that does not parse carries its error");
    assert.equal(r.blocks.find((b) => b.name === "gherkin").data, undefined, "gherkin is kept as text, not parsed as YAML");
  });

  it("reports a fence that is never closed", () => {
    const r = readRecord("p.md", doc("id: FLW-a", "\n```pds-flow\nentry: a\n"));
    assert.match(r.problems.find((p) => p.id === "SCH-block").msg, /never closed/);
  });

  it("allows longer fences, so a block can contain a short one", () => {
    const r = readRecord("p.md", doc("id: FLW-a", "\n````pds-flow\nentry: a\nsteps:\n  - {id: a, does: \"```\", end: success}\n````\n"));
    assert.equal(r.blocks[0].error, undefined);
    assert.equal(r.blocks[0].data.steps[0].end, "success");
  });
});

describe("splitFrontmatter", () => {
  it("needs the opening fence on the first line", () => {
    assert.equal(splitFrontmatter("\n---\nid: a\n---\n"), null);
    assert.equal(splitFrontmatter("---\nid: a\n---\nbody").body, "body");
  });
});

describe("contentHash", () => {
  const base = readRecord("p.md", doc("id: FEAT-a\ntitle: A\nkind: user_facing", "\n## Purpose\n\nOne sentence here.\n"));
  const hash = (text) => contentHash(readRecord("p.md", text));

  it("is stable under reformatting: key order, comments, trailing space and blank lines", () => {
    assert.equal(hash(doc("kind: user_facing\ntitle: A\nid: FEAT-a", "\n## Purpose\n\n\n\nOne sentence here.   \n<!-- a note -->\n")), contentHash(base));
  });

  it("ignores the approval and the review date, which are not content", () => {
    assert.equal(hash(doc("id: FEAT-a\ntitle: A\nkind: user_facing\nreviewed: 2026-01-01\napproval: {state: approved, by: X, at: 2026-01-01, hash: sha256:abc}", "\n## Purpose\n\nOne sentence here.\n")), contentHash(base));
  });

  it("changes when a word of the body changes, or any other frontmatter value", () => {
    assert.notEqual(hash(doc("id: FEAT-a\ntitle: A\nkind: user_facing", "\n## Purpose\n\nOne sentence there.\n")), contentHash(base));
    assert.notEqual(hash(doc("id: FEAT-a\ntitle: B\nkind: user_facing", "\n## Purpose\n\nOne sentence here.\n")), contentHash(base));
    assert.notEqual(hash(doc("id: FEAT-a\ntitle: A\nkind: user_facing\ntier: 1", "\n## Purpose\n\nOne sentence here.\n")), contentHash(base));
  });

  it("is short, prefixed with its algorithm and deterministic", () => {
    assert.match(contentHash(base), /^sha256:[0-9a-f]{16}$/);
    assert.equal(contentHash(base), contentHash(base));
  });
});
