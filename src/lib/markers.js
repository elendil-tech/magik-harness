// @ts-check
/**
 * markers.js — managed text blocks inside files the user also edits
 * (AGENTS.md, CLAUDE.md, .gitignore, ~/.codex/AGENTS.md).
 *
 * A block is the region between a start and an end marker line. The installer
 * owns only that region; text outside it is never touched.
 *
 *   html style:  <!-- NAME:start v=2.0.0 -->  ...  <!-- NAME:end -->
 *   hash style:  # NAME:start v=2.0.0         ...  # NAME:end
 */

import { detectEol, sha256, toLf } from "./fsx.js";

/** @typedef {"html"|"hash"} BlockStyle */

/** @param {string} s */
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * @param {BlockStyle} style
 * @param {string} name
 * @param {string} version
 */
export function startMarker(style, name, version) {
  return style === "html" ? `<!-- ${name}:start v=${version} -->` : `# ${name}:start v=${version}`;
}

/** @param {BlockStyle} style @param {string} name */
export function endMarker(style, name) {
  return style === "html" ? `<!-- ${name}:end -->` : `# ${name}:end`;
}

/** @param {BlockStyle} style @param {string} name */
function startRe(style, name) {
  const n = esc(name);
  return style === "html"
    ? new RegExp(`^\\s*<!--\\s*${n}:start(?:\\s+v=([\\w.+-]+))?\\s*-->\\s*$`)
    : new RegExp(`^\\s*#\\s*${n}:start(?:\\s+v=([\\w.+-]+))?\\s*$`);
}

/** @param {BlockStyle} style @param {string} name */
function endRe(style, name) {
  const n = esc(name);
  return style === "html" ? new RegExp(`^\\s*<!--\\s*${n}:end\\s*-->\\s*$`) : new RegExp(`^\\s*#\\s*${n}:end\\s*$`);
}

/**
 * @typedef {Object} FoundBlock
 * @property {number} startLine   index into the line array
 * @property {number} endLine     index (inclusive)
 * @property {string} name        the marker name that matched
 * @property {string|null} version
 * @property {string} body        text between the markers, LF-normalised, no trailing newline
 */

/**
 * @param {string} text
 * @param {BlockStyle} style
 * @param {string[]} names   marker names to look for, in order
 * @returns {FoundBlock|null}
 */
export function findBlock(text, style, names) {
  const lines = text.split(/\r?\n/);
  for (const name of names) {
    const s = startRe(style, name);
    const e = endRe(style, name);
    for (let i = 0; i < lines.length; i++) {
      const m = s.exec(lines[i]);
      if (!m) continue;
      for (let j = i + 1; j < lines.length; j++) {
        if (e.test(lines[j])) {
          return { startLine: i, endLine: j, name, version: m[1] ?? null, body: lines.slice(i + 1, j).join("\n") };
        }
      }
    }
  }
  return null;
}

/** Hash of a block body (EOL-insensitive). @param {string} body */
export function bodyHash(body) {
  return sha256(toLf(body).replace(/\s+$/g, ""));
}

/**
 * @typedef {Object} UpsertResult
 * @property {string} text
 * @property {"create"|"insert"|"update"|"unchanged"} action
 * @property {FoundBlock|null} previous
 */

/**
 * Insert or replace a block. Existing text outside the block is preserved.
 * @param {string} text  current file content ("" when the file does not exist)
 * @param {Object} o
 * @param {BlockStyle} o.style
 * @param {string} o.name
 * @param {string} o.version
 * @param {string} o.body      block body without markers
 * @param {"top"|"bottom"} [o.position]
 * @returns {UpsertResult}
 */
export function upsertBlock(text, o) {
  const eol = detectEol(text || "\n");
  const bodyLines = toLf(o.body).replace(/\s+$/g, "").split("\n");
  const block = [startMarker(o.style, o.name, o.version), ...bodyLines, endMarker(o.style, o.name)];
  const found = text ? findBlock(text, o.style, [o.name]) : null;

  if (found) {
    const lines = text.split(/\r?\n/);
    const next = [...lines.slice(0, found.startLine), ...block, ...lines.slice(found.endLine + 1)].join(eol);
    const same = next === text;
    return { text: next, action: same ? "unchanged" : "update", previous: found };
  }

  if (!text.trim()) return { text: block.join(eol) + eol, action: "create", previous: null };

  const body = text.replace(/\s+$/g, "");
  const next =
    o.position === "bottom" ? `${body}${eol}${eol}${block.join(eol)}${eol}` : `${block.join(eol)}${eol}${eol}${text.replace(/^\s+/g, "")}`;
  return { text: next, action: "insert", previous: null };
}

/**
 * Remove a block (and one adjacent blank line). Returns the text unchanged when absent.
 * @param {string} text
 * @param {BlockStyle} style
 * @param {string[]} names
 * @returns {{ text: string, removed: boolean, previous: FoundBlock|null }}
 */
export function removeBlock(text, style, names) {
  const found = findBlock(text, style, names);
  if (!found) return { text, removed: false, previous: null };
  const eol = detectEol(text);
  const lines = text.split(/\r?\n/);
  let from = found.startLine;
  let to = found.endLine;
  if (lines[to + 1] !== undefined && lines[to + 1].trim() === "") to += 1;
  else if (from > 0 && lines[from - 1].trim() === "") from -= 1;
  const rest = [...lines.slice(0, from), ...lines.slice(to + 1)].join(eol);
  return { text: rest.trim() ? rest.replace(/\s+$/g, "") + eol : "", removed: true, previous: found };
}
