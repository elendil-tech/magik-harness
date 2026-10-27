// Reading a record: Markdown with a frontmatter block, named body sections and
// fenced structured blocks. Nothing here knows about the meta-model; it turns
// text into a plain object and reports what it could not read.
import { createHash } from "node:crypto";
import { parseYaml, YamlError } from "./yaml.mjs";

export const ID_RE = /^([A-Z]{2,5})-([a-z0-9]+(?:-[a-z0-9]+)*)$/;
const LINK_RE = /\[\[([^\[\]\n]*)\]\]/g;
const MENTION_RE = /^([A-Z]{2,5}-[a-z0-9]+(?:-[a-z0-9]+)*)(?:\|.*)?$/;
const FENCE_OPEN = /^(`{3,}|~{3,})\s*([^\s`]*)/;

/** Remove HTML comments but keep every newline, so line numbers stay true. */
export function stripComments(text) {
  return text.replace(/<!--[\s\S]*?-->/g, (c) => c.replace(/[^\n]/g, ""));
}

/** Split `---` frontmatter from the body. Returns null when there is none. */
export function splitFrontmatter(text) {
  const m = /^---[ \t]*\n([\s\S]*?)\n---[ \t]*(?:\n|$)/.exec(text);
  if (!m) return null;
  const consumed = m[0];
  return {
    front: m[1],
    frontStartLine: 2,
    body: text.slice(consumed.length),
    bodyStartLine: consumed.split("\n").length,
  };
}

/**
 * Walk the body once: sections (level-2 headings), structured blocks (fences
 * named pds-* or gherkin) and [[ID]] mentions in prose, with the [[...]] that
 * are not shaped like an id (`badLinks`), which would otherwise point at
 * nothing without a word. Fenced text never counts as prose and never starts a
 * heading.
 */
export function readBody(body, startLine = 1) {
  const lines = body.split("\n");
  const sections = [];
  const blocks = [];
  const mentions = [];
  const badLinks = [];
  const problems = [];
  let current = { heading: "", line: startLine, prose: [], raw: [] };
  let fence = null;

  const push = () => {
    sections.push(finishSection(current));
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lineNo = startLine + i;

    if (fence) {
      const close = new RegExp(`^${fence.marker[0]}{${fence.marker.length},}\\s*$`);
      if (close.test(line)) {
        blocks.push(finishBlock(fence, lineNo));
        current.raw.push(line);
        fence = null;
      } else {
        fence.lines.push(line);
        current.raw.push(line);
      }
      continue;
    }

    const open = FENCE_OPEN.exec(line);
    if (open) {
      fence = { marker: open[1], lang: open[2] || "", line: lineNo, lines: [], section: current.heading };
      current.raw.push(line);
      continue;
    }

    const h = /^##\s+(.+?)\s*#*\s*$/.exec(line);
    if (h && !line.startsWith("###")) {
      push();
      current = { heading: h[1].trim(), line: lineNo, prose: [], raw: [] };
      continue;
    }

    current.raw.push(line);
    current.prose.push({ text: line, line: lineNo });
    const noCode = line.replace(/`[^`\n]*`/g, "");
    let m;
    LINK_RE.lastIndex = 0;
    while ((m = LINK_RE.exec(noCode))) {
      const id = MENTION_RE.exec(m[1]);
      if (id) mentions.push({ id: id[1], line: lineNo });
      else badLinks.push({ text: m[0], target: m[1].split("|")[0], line: lineNo });
    }
  }
  if (fence) problems.push({ line: fence.line, msg: `fenced block opened here is never closed` });
  push();
  return { sections, blocks, mentions, badLinks, problems };
}

function finishSection(s) {
  const prose = s.prose.map((p) => p.text).join("\n");
  const words = (prose.replace(/[#>*_\-|`\[\]]/g, " ").match(/[\p{L}\p{N}][\p{L}\p{N}'’-]*/gu) || []).length;
  return { heading: s.heading, line: s.line, prose, lines: s.prose, words, text: s.raw.join("\n") };
}

function finishBlock(f, endLine) {
  const text = f.lines.join("\n");
  const block = { name: f.lang, line: f.line + 1, endLine, text, section: f.section };
  if (f.lang.startsWith("pds-")) {
    try {
      block.data = parseYaml(text, { baseLine: f.line + 1 });
    } catch (e) {
      block.error = e instanceof YamlError ? { msg: e.message, line: e.line } : { msg: String(e.message || e), line: f.line + 1 };
    }
  }
  return block;
}

/**
 * Read one record. `ok` is false when the frontmatter is missing or does not
 * parse; the other fields are still filled in as far as they could be.
 */
export function readRecord(path, rawText) {
  const text = rawText.replace(/\r\n?/g, "\n");
  const rec = {
    path,
    ok: false,
    id: null,
    front: null,
    problems: [],
    body: "",
    sections: [],
    blocks: [],
    mentions: [],
    badLinks: [],
  };
  const split = splitFrontmatter(text);
  if (!split) {
    rec.problems.push({ id: "SCH-frontmatter", line: 1, msg: "the record does not begin with a --- frontmatter block" });
    return rec;
  }
  try {
    const front = parseYaml(split.front, { baseLine: split.frontStartLine });
    if (!front || typeof front !== "object" || Array.isArray(front)) throw new YamlError("frontmatter must be a mapping", split.frontStartLine);
    rec.front = front;
    rec.id = typeof front.id === "string" ? front.id : null;
    rec.ok = true;
  } catch (e) {
    rec.problems.push({ id: "SCH-frontmatter", line: e.line || split.frontStartLine, msg: `frontmatter does not parse: ${e.message}` });
  }
  rec.body = stripComments(split.body);
  const parsed = readBody(rec.body, split.bodyStartLine);
  rec.sections = parsed.sections;
  rec.blocks = parsed.blocks;
  rec.mentions = parsed.mentions;
  rec.badLinks = parsed.badLinks;
  for (const p of parsed.problems) rec.problems.push({ id: "SCH-block", line: p.line, msg: p.msg });
  return rec;
}

/** The prose of a record, for scans: every line outside fenced blocks, with its line number. */
export function proseLines(rec) {
  const out = [];
  for (const s of rec.sections) for (const l of s.lines) out.push({ text: l.text, line: l.line, section: s.heading });
  return out;
}

function sortKeys(v) {
  if (Array.isArray(v)) return v.map(sortKeys);
  if (v && typeof v === "object") {
    const o = {};
    for (const k of Object.keys(v).sort()) o[k] = sortKeys(v[k]);
    return o;
  }
  return v;
}

/**
 * What an approval is bound to: the frontmatter without `approval` and
 * `reviewed`, and the body without comments or layout whitespace. Reformatting
 * a record does not change it; changing what it says does.
 */
export function contentHash(rec) {
  const { approval, reviewed, ...rest } = rec.front || {};
  const body = (rec.body || "")
    .split("\n")
    .map((l) => l.replace(/\s+$/, ""))
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  const canon = JSON.stringify({ front: sortKeys(rest), body });
  return "sha256:" + createHash("sha256").update(canon).digest("hex").slice(0, 16);
}
