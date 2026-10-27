// QLT: what is written is written well enough to be tested and trusted.
import { proseLines } from "../records.mjs";

const asList = (v) => (v === undefined || v === null ? [] : Array.isArray(v) ? v : [v]);

const VAGUE = [
  "fast", "quick", "quickly", "easy", "easily", "intuitive", "user-friendly", "robust", "seamless", "seamlessly",
  "flexible", "scalable", "modern", "efficient", "efficiently", "appropriate", "appropriately", "adequate",
  "reasonable", "reasonably", "optimal", "optimally", "sufficient", "sufficiently", "timely", "etc", "and/or",
  "as needed", "if possible", "where possible", "best practices", "state-of-the-art", "simple", "simply",
];
const VAGUE_RE = new RegExp(`(?<![\\w-])(${VAGUE.map((w) => w.replace(/[/-]/g, "\\$&")).join("|")})(?![\\w-])`, "i");
const PLACEHOLDER_RE = /\b(TBD|TODO|FIXME|XXX|lorem ipsum)\b|\?\?\?|<[^>\n]*\b(name|value|describe|fill|your|insert)\b[^>\n]*>/i;
const VAGUE_FIELDS = { REQ: ["statement"], RULE: ["statement"], TERM: ["definition"], MET: ["definition"], ENTL: ["on_limit"] };

const norm = (s) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
const words = (s) => (String(s).toLowerCase().match(/[a-z0-9]+/g) || []);

function gherkinProblems(text) {
  const rank = { given: 0, when: 1, then: 2 };
  const scenarios = [];
  let cur = null;
  let last = null;
  const problems = [];
  for (const raw of text.split("\n")) {
    const line = raw.trim();
    if (!line || line.startsWith("#") || line.startsWith("@") || line.startsWith("|") || /^(Feature|Background|Rule|Examples|Scenarios):/i.test(line)) continue;
    const sc = /^(Scenario Outline|Scenario|Example):\s*(.*)$/i.exec(line);
    if (sc) {
      cur = { name: sc[2] || "(unnamed)", steps: [] };
      scenarios.push(cur);
      last = null;
      continue;
    }
    const st = /^(Given|When|Then|And|But)\b\s*(.*)$/i.exec(line);
    if (st) {
      if (!cur) {
        problems.push(`step "${line}" appears before any Scenario`);
        continue;
      }
      const kw = st[1].toLowerCase();
      const primary = kw === "and" || kw === "but" ? last : kw;
      if (!primary) problems.push(`scenario "${cur.name}": ${st[1]} cannot be the first step`);
      if (!st[2].trim()) problems.push(`scenario "${cur.name}": ${st[1]} has no text`);
      cur.steps.push(primary);
      if (primary) last = primary;
    }
  }
  if (!scenarios.length) problems.push("has no Scenario");
  for (const s of scenarios) {
    for (const k of ["given", "when", "then"]) if (!s.steps.includes(k)) problems.push(`scenario "${s.name}" has no ${k[0].toUpperCase() + k.slice(1)} step`);
    for (let i = 1; i < s.steps.length; i++) {
      if (s.steps[i] && s.steps[i - 1] && rank[s.steps[i]] < rank[s.steps[i - 1]]) {
        problems.push(`scenario "${s.name}": ${s.steps[i]} comes after ${s.steps[i - 1]}; the order is Given, When, Then`);
        break;
      }
    }
  }
  return problems;
}

export const checks = {
  "QLT-req-form"(ctx) {
    ctx.each("REQ", (el) => {
      const s = typeof el.front.statement === "string" ? el.front.statement.trim() : "";
      if (!s) return;
      if (!/^(The|When|While|If|Where)\b/.test(s) || !/\bshall\b/.test(s)) ctx.report({ element: el.id, path: el.path, msg: "is not in requirement form", hint: "e.g. “When an invoice is sent, the system shall email the client within 60 seconds.”" });
    });
  },

  "QLT-req-measurable"(ctx) {
    ctx.each("REQ", (el) => {
      if (ctx.meta.field(el, "kind") !== "quality") return;
      const s = typeof el.front.statement === "string" ? el.front.statement : "";
      if (s && !/\d/.test(s)) ctx.report({ element: el.id, path: el.path, msg: "is a quality requirement with no number in it", hint: "say how much: a time, a percentage, a count, a size" });
    });
  },

  "QLT-req-single"(ctx) {
    ctx.each("REQ", (el) => {
      const s = typeof el.front.statement === "string" ? el.front.statement : "";
      if ((s.match(/\bshall\b/g) || []).length > 1) ctx.report({ element: el.id, path: el.path, msg: "says shall more than once: one requirement states one thing", hint: "split it, so each can be tested and traced on its own" });
    });
  },

  "QLT-vague"(ctx) {
    ctx.each(Object.keys(VAGUE_FIELDS), (el) => {
      for (const f of VAGUE_FIELDS[el.type]) {
        const text = el.front[f];
        if (typeof text !== "string") continue;
        for (const sentence of text.split(/(?<=[.!?])\s+/)) {
          const m = VAGUE_RE.exec(sentence);
          if (m && !/\d/.test(sentence)) ctx.report({ element: el.id, path: el.path, msg: `${f}: “${m[1]}” cannot be tested`, hint: "replace it with a number, a limit or an observable behaviour" });
        }
      }
    });
  },

  "QLT-placeholder"(ctx) {
    ctx.each(null, (el) => {
      for (const [k, v] of Object.entries(el.front)) {
        if (typeof v === "string" && PLACEHOLDER_RE.test(v)) ctx.report({ element: el.id, path: el.path, msg: `${k} still holds a placeholder: “${PLACEHOLDER_RE.exec(v)[0]}”` });
      }
      for (const l of proseLines(el.rec)) {
        const m = PLACEHOLDER_RE.exec(l.text);
        if (m) ctx.report({ element: el.id, path: el.path, line: l.line, msg: `placeholder left in the text: “${m[0]}”` });
      }
    });
  },

  "QLT-gherkin"(ctx) {
    ctx.each("TST", (el) => {
      if (["exploratory", "checklist"].includes(ctx.meta.field(el, "kind"))) return;
      const b = el.rec.blocks.find((x) => x.name === "gherkin");
      if (!b) return; // missing is a coverage gap
      for (const msg of gherkinProblems(b.text)) ctx.report({ element: el.id, path: el.path, line: b.line, msg: `gherkin: ${msg}` });
    });
  },

  "QLT-summary"(ctx) {
    ctx.each(null, (el) => {
      const s = el.front.summary;
      if (typeof s !== "string" || !s.trim()) return;
      if (norm(s) === norm(el.title) || words(s).length < 4) ctx.report({ element: el.id, path: el.path, msg: "summary says no more than the title", hint: "say what it is for, in one sentence" });
    });
  },

  "QLT-term-avoid"(ctx) {
    const { model } = ctx;
    for (const term of model.all("TERM")) {
      const avoid = asList(term.front.avoid).filter((w) => typeof w === "string" && w.trim());
      if (!avoid.length || model.isRetired(term.id)) continue;
      const root = model.get(term.anchor);
      const scope = root ? [root, ...model.descendants(root.id)] : [];
      for (const bad of avoid) {
        const re = new RegExp(`(?<![\\w-])${bad.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?![\\w-])`, "i");
        for (const el of scope) {
          if (el.id === term.id || model.isRetired(el.id)) continue;
          const hits = [];
          if (re.test(el.title)) hits.push({ line: undefined, where: "title" });
          for (const l of proseLines(el.rec)) if (re.test(l.text)) hits.push({ line: l.line, where: "text" });
          for (const h of hits.slice(0, 2)) ctx.report({ element: el.id, path: el.path, line: h.line, msg: `uses “${bad}” where the glossary says “${term.title}”`, hint: `${term.id} lists “${bad}” as a word to avoid` });
        }
      }
    }
  },

  "QLT-term-duplicate"(ctx) {
    const { model } = ctx;
    const terms = model.all("TERM").filter((t) => !model.isRetired(t.id));
    const overlap = (a, b) => a.anchor === b.anchor || model.ancestors(a.id).some((x) => x.id === b.anchor) || model.ancestors(b.id).some((x) => x.id === a.anchor);
    const names = (t) => [t.title, ...asList(t.front.aliases)].map(norm).filter(Boolean);
    for (let i = 0; i < terms.length; i++) {
      for (let j = i + 1; j < terms.length; j++) {
        const a = terms[i];
        const b = terms[j];
        if (!overlap(a, b)) continue;
        const shared = names(a).filter((n) => names(b).includes(n));
        if (shared.length) ctx.report({ element: b.id, path: b.path, msg: `defines “${shared[0]}”, which ${a.id} already defines in an overlapping scope` });
      }
    }
  },

  "QLT-duplicate"(ctx) {
    const { model } = ctx;
    const groups = new Map();
    for (const el of model.elements.values()) {
      if (model.isRetired(el.id) || el.type === "TERM") continue;
      const key = `${el.type}|${el.anchor}|${words(el.title).sort().join(" ")}`;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(el);
    }
    for (const list of groups.values()) {
      for (const el of list.slice(1)) ctx.report({ element: el.id, path: el.path, msg: `has the same title as ${list[0].id} under the same anchor`, hint: "merge them, or give each a title that tells them apart" });
    }
  },

  "QLT-sys-reference"(ctx) {
    ctx.each("SYS", (el) => {
      const n = el.rec.sections.reduce((a, s) => a + s.words, 0);
      if (n > 150) ctx.report({ element: el.id, path: el.path, msg: `has ${n} words of body; a system component is a reference, not a design`, hint: "keep the design in your engineering documents and link it from `links`" });
    });
  },

  "QLT-title"(ctx) {
    ctx.each(null, (el) => {
      if (el.title.length > 80) ctx.report({ element: el.id, path: el.path, msg: `title is ${el.title.length} characters; keep it under 80` });
      else if (/\.$/.test(el.title.trim())) ctx.report({ element: el.id, path: el.path, msg: "title ends with a full stop" });
    });
  },
};
