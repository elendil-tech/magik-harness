/**
 * PDS-YAML: the strict YAML subset the toolchain reads and writes.
 *
 * Why a subset and not a library: the toolchain has no dependencies, and a
 * definition repository should read the same in every YAML parser. So the
 * subset is chosen so that any value this module accepts means the same thing
 * to a YAML 1.1 and a YAML 1.2 parser, and anything ambiguous between the two
 * is rejected with a message that says how to fix it.
 *
 * Accepted
 *   - block mappings and block sequences (a sequence may sit at the same
 *     indent as its key), nested to any depth
 *   - single-line flow sequences and mappings:  [a, b]  {k: v, n: [1, 2]}
 *   - plain, 'single' and "double" quoted scalars
 *   - literal and folded block scalars:  |  |-  >  >-
 *   - null / ~ / true / false / integers / decimals (lowercase words only)
 *   - comments introduced by a hash that follows whitespace
 *
 * Rejected, loudly
 *   - tabs for indentation, anchors, aliases, tags, merge keys, directives,
 *     multiple documents, multi-line plain or quoted scalars, duplicate keys
 *   - plain scalars that mean different things in YAML 1.1 and 1.2: yes/no/on/off,
 *     True/NULL, 007, 0x1F, 1_000, 1e3, 1:30, .inf. Quote them. The same goes for a
 *     plain key: `on:` is the boolean true to a 1.1 parser, so `trigger:` is used, not `on:`.
 *
 * Dates such as 2026-10-27 stay strings; the caller validates their shape.
 */

export class YamlError extends Error {
  constructor(message, line) {
    super(line ? `line ${line}: ${message}` : message);
    this.name = "YamlError";
    this.line = line ?? null;
  }
}

const isSeqItem = (t) => t === "-" || t.startsWith("- ");

function stripComment(s) {
  let sq = false;
  let dq = false;
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (dq) {
      if (ch === "\\") i++;
      else if (ch === '"') dq = false;
      continue;
    }
    if (sq) {
      if (ch === "'") {
        if (s[i + 1] === "'") i++;
        else sq = false;
      }
      continue;
    }
    if (ch === '"' || ch === "'") {
      if (i === 0 || " \t[{,".includes(s[i - 1])) {
        if (ch === '"') dq = true;
        else sq = true;
      }
      continue;
    }
    if (ch === "#" && (i === 0 || /\s/.test(s[i - 1]))) return s.slice(0, i);
  }
  return s;
}

/** Index of the colon that ends a mapping key, or -1 when the text is not a `key: value` entry. */
function findKeySplit(t) {
  const c0 = t[0];
  if (c0 === "[" || c0 === "{") return -1;
  let i = 0;
  if (c0 === '"' || c0 === "'") {
    const q = c0;
    for (i = 1; i < t.length; i++) {
      if (q === '"' && t[i] === "\\") {
        i++;
        continue;
      }
      if (t[i] === q) {
        if (q === "'" && t[i + 1] === "'") {
          i++;
          continue;
        }
        break;
      }
    }
    if (i >= t.length) return -1;
    i++;
    while (t[i] === " ") i++;
    return t[i] === ":" && (i + 1 === t.length || t[i + 1] === " ") ? i : -1;
  }
  for (i = 0; i < t.length; i++) if (t[i] === ":" && (i + 1 === t.length || t[i + 1] === " ")) return i;
  return -1;
}

const ESCAPES = { n: "\n", t: "\t", r: "\r", 0: "\0", '"': '"', "\\": "\\", "/": "/", " ": " ", b: "\b", f: "\f" };

/** Reads a double-quoted scalar starting at s[start]; returns [value, indexAfterClosingQuote]. */
function readDouble(s, start, fail) {
  let out = "";
  for (let i = start + 1; i < s.length; i++) {
    const ch = s[i];
    if (ch === "\\") {
      const n = s[++i];
      if (n === "u" || n === "x") {
        const len = n === "u" ? 4 : 2;
        const hex = s.slice(i + 1, i + 1 + len);
        if (!new RegExp(`^[0-9a-fA-F]{${len}}$`).test(hex)) fail(`bad \\${n} escape in a quoted string`);
        out += String.fromCodePoint(parseInt(hex, 16));
        i += len;
      } else if (n in ESCAPES) out += ESCAPES[n];
      else fail(`unsupported escape \\${n ?? ""} in a quoted string`);
    } else if (ch === '"') return [out, i + 1];
    else out += ch;
  }
  return fail("unterminated double-quoted string (multi-line quoted strings are not supported; use a block scalar)");
}

function readSingle(s, start, fail) {
  let out = "";
  for (let i = start + 1; i < s.length; i++) {
    if (s[i] === "'") {
      if (s[i + 1] === "'") {
        out += "'";
        i++;
      } else return [out, i + 1];
    } else out += s[i];
  }
  return fail("unterminated single-quoted string (multi-line quoted strings are not supported; use a block scalar)");
}

function resolvePlain(text, fail) {
  if (text === "null" || text === "~") return null;
  if (text === "true") return true;
  if (text === "false") return false;
  if (/^(?:yes|no|on|off|true|false|null)$/i.test(text)) {
    return fail(`"${text}" means different things in YAML 1.1 and 1.2: put it in quotes (or use lowercase true, false, null)`);
  }
  if (/^[-+]?\d+$/.test(text)) {
    if (/^[-+]?0\d/.test(text)) return fail(`"${text}" has a leading zero (octal in YAML 1.1): put it in quotes`);
    return Number(text);
  }
  if (/^[-+]?(?:\d+\.\d*|\.\d+)(?:[eE][-+]?\d+)?$/.test(text)) return Number(text);
  if (/^[-+]?\d[\d_]*$/.test(text) && text.includes("_")) return fail(`"${text}" is a number with underscores in YAML 1.1: put it in quotes`);
  if (/^[-+]?0[xob][0-9a-fA-F_]+$/i.test(text)) return fail(`"${text}" looks like a number in another base: put it in quotes`);
  if (/^[-+]?\d+(?::[0-5]?\d)+(?:\.\d*)?$/.test(text)) return fail(`"${text}" is a base-60 number in YAML 1.1: put it in quotes`);
  if (/^[-+]?\d+[eE][-+]?\d+$/.test(text)) return fail(`"${text}" is a number in YAML 1.2 and a string in 1.1: put it in quotes`);
  if (/^[-+]?\.(?:inf|nan)$/i.test(text)) return fail(`"${text}" is a special float: put it in quotes`);
  return text;
}

/**
 * A plain (unquoted) key. A key is read as text here, but a YAML 1.1 parser reads `on:` as the boolean
 * true and `1:` as the number one, so a key that any parser could read as something other than a
 * string is refused, with the same advice as for a value.
 */
function plainKey(text, fail) {
  if (/^(?:yes|no|on|off|true|false|null|~)$/i.test(text)) fail(`the key ${text} would be read as a boolean or null by a YAML parser: put it in quotes, or use another name`);
  const v = resolvePlain(text, fail);
  if (typeof v !== "string") fail(`the key ${text} would be read as a number by a YAML parser: put it in quotes, or use another name`);
  return text;
}

class Flow {
  constructor(s, fail) {
    this.s = s;
    this.p = 0;
    this.fail = fail;
  }

  parse() {
    const v = this.value();
    this.ws();
    if (this.p < this.s.length) this.fail(`unexpected "${this.s.slice(this.p, this.p + 12)}" after the closing bracket`);
    return v;
  }

  ws() {
    while (this.s[this.p] === " ") this.p++;
  }

  value() {
    this.ws();
    const ch = this.s[this.p];
    if (ch === "[") return this.seq();
    if (ch === "{") return this.map();
    if (ch === '"') {
      const [v, end] = readDouble(this.s, this.p, this.fail);
      this.p = end;
      return v;
    }
    if (ch === "'") {
      const [v, end] = readSingle(this.s, this.p, this.fail);
      this.p = end;
      return v;
    }
    let q = this.p;
    while (q < this.s.length && !",]}".includes(this.s[q])) {
      if (this.s[q] === ":" && (this.s[q + 1] === " " || q + 1 === this.s.length)) {
        this.fail('a ": " inside a flow value: put the text in quotes');
      }
      q++;
    }
    const text = this.s.slice(this.p, q).trim();
    if (text === "") this.fail("empty value in a flow collection");
    if ("&*!%@`".includes(text[0])) this.fail(`unsupported YAML indicator "${text[0]}"`);
    this.p = q;
    return resolvePlain(text, this.fail);
  }

  seq() {
    this.p++;
    const out = [];
    this.ws();
    if (this.s[this.p] === "]") {
      this.p++;
      return out;
    }
    for (;;) {
      out.push(this.value());
      this.ws();
      const ch = this.s[this.p++];
      if (ch === ",") {
        this.ws();
        if (this.s[this.p] === "]") {
          this.p++;
          return out;
        }
        continue;
      }
      if (ch === "]") return out;
      this.fail("expected ',' or ']' in a flow sequence");
    }
  }

  key() {
    const ch = this.s[this.p];
    if (ch === '"') {
      const [v, end] = readDouble(this.s, this.p, this.fail);
      this.p = end;
      return v;
    }
    if (ch === "'") {
      const [v, end] = readSingle(this.s, this.p, this.fail);
      this.p = end;
      return v;
    }
    let q = this.p;
    while (q < this.s.length && !(this.s[q] === ":" && (this.s[q + 1] === " " || this.s[q + 1] === "}" || q + 1 === this.s.length))) {
      if (",[]{}".includes(this.s[q])) this.fail("expected 'key: value' in a flow mapping");
      q++;
    }
    const k = this.s.slice(this.p, q).trim();
    if (k === "") this.fail("empty key in a flow mapping");
    this.p = q;
    return plainKey(k, this.fail);
  }

  map() {
    this.p++;
    const out = {};
    this.ws();
    if (this.s[this.p] === "}") {
      this.p++;
      return out;
    }
    for (;;) {
      this.ws();
      const k = this.key();
      if (k === "__proto__") this.fail('the key "__proto__" is not allowed');
      this.ws();
      if (this.s[this.p] !== ":") this.fail("expected ':' after a key in a flow mapping");
      this.p++;
      this.ws();
      const v = this.s[this.p] === "," || this.s[this.p] === "}" ? null : this.value();
      if (Object.hasOwn(out, k)) this.fail(`duplicate key "${k}"`);
      out[k] = v;
      this.ws();
      const ch = this.s[this.p++];
      if (ch === ",") {
        this.ws();
        if (this.s[this.p] === "}") {
          this.p++;
          return out;
        }
        continue;
      }
      if (ch === "}") return out;
      this.fail("expected ',' or '}' in a flow mapping");
    }
  }
}

class Parser {
  constructor(text, baseLine) {
    this.lines = String(text).replace(/\r\n?/g, "\n").split("\n");
    this.i = 0;
    this.base = baseLine;
  }

  failAt(idx) {
    return (msg) => {
      throw new YamlError(msg, this.base + idx);
    };
  }

  /** The next significant line, without consuming it. Skips blank and comment-only lines. */
  peek() {
    for (; this.i < this.lines.length; this.i++) {
      const line = this.lines[this.i];
      if (line.trim() === "" || line.trimStart().startsWith("#")) continue;
      if (/^[ ]*\t/.test(line)) this.failAt(this.i)("tabs are not allowed for indentation");
      const indent = /^ */.exec(line)[0].length;
      const text = stripComment(line.slice(indent)).trimEnd();
      if (text === "") continue;
      return { idx: this.i, indent, text };
    }
    return null;
  }

  document() {
    const first = this.peek();
    if (!first) return null;
    if (first.text.startsWith("%")) this.failAt(first.idx)("directives are not supported");
    if (first.text === "---" || first.text === "...") this.failAt(first.idx)("document markers are not supported here");
    const value = this.block(first.indent);
    const rest = this.peek();
    if (rest) this.failAt(rest.idx)("unexpected content: check the indentation");
    return value;
  }

  block(indent) {
    const cur = this.peek();
    if (isSeqItem(cur.text)) return this.sequence(cur.indent);
    if (findKeySplit(cur.text) >= 0) return this.mapping(cur.indent);
    this.i = cur.idx + 1;
    return this.inline(cur.text, cur.idx);
  }

  splitEntry(text, idx) {
    const c = findKeySplit(text);
    if (c < 0) this.failAt(idx)(`expected "key: value", found "${text.length > 40 ? `${text.slice(0, 40)}...` : text}"`);
    const keyRaw = text.slice(0, c).trim();
    let key = keyRaw;
    if (keyRaw[0] === '"') key = readDouble(keyRaw, 0, this.failAt(idx))[0];
    else if (keyRaw[0] === "'") key = readSingle(keyRaw, 0, this.failAt(idx))[0];
    else if ("&*!%@`?|>#".includes(keyRaw[0])) this.failAt(idx)(`unsupported YAML indicator "${keyRaw[0]}" at the start of a key`);
    else key = plainKey(keyRaw, this.failAt(idx));
    if (key === "") this.failAt(idx)("empty key");
    if (key === "__proto__") this.failAt(idx)('the key "__proto__" is not allowed');
    return { key, rest: text.slice(c + 1).trim() };
  }

  mapping(indent) {
    const out = {};
    for (;;) {
      const cur = this.peek();
      if (!cur || cur.indent < indent) break;
      if (cur.indent > indent) this.failAt(cur.idx)("unexpected indentation");
      if (isSeqItem(cur.text)) this.failAt(cur.idx)("a '- ' list item where a 'key:' was expected");
      const { key, rest } = this.splitEntry(cur.text, cur.idx);
      if (Object.hasOwn(out, key)) this.failAt(cur.idx)(`duplicate key "${key}"`);
      this.i = cur.idx + 1;
      out[key] = this.mappingValue(rest, indent, cur.idx);
    }
    return out;
  }

  mappingValue(rest, indent, idx) {
    if (rest === "") {
      const next = this.peek();
      if (next && next.indent > indent) {
        if (!isSeqItem(next.text) && findKeySplit(next.text) < 0) {
          this.failAt(next.idx)("expected a nested mapping or list here (use '|' or '>' for multi-line text)");
        }
        return this.block(next.indent);
      }
      if (next && next.indent === indent && isSeqItem(next.text)) return this.sequence(indent);
      return null;
    }
    if (rest[0] === "|" || rest[0] === ">") return this.blockScalar(rest, indent, idx);
    return this.inline(rest, idx);
  }

  sequence(indent) {
    const out = [];
    for (;;) {
      const cur = this.peek();
      if (!cur || cur.indent < indent) break;
      if (cur.indent > indent) this.failAt(cur.idx)("unexpected indentation");
      if (!isSeqItem(cur.text)) break;
      const after = cur.text === "-" ? "" : cur.text.slice(2).trimStart();
      if (after === "") {
        this.i = cur.idx + 1;
        const next = this.peek();
        if (next && next.indent > indent) {
          if (!isSeqItem(next.text) && findKeySplit(next.text) < 0) this.failAt(next.idx)("expected a nested mapping or list under '-'");
          out.push(this.block(next.indent));
        } else out.push(null);
        continue;
      }
      if (isSeqItem(after) || findKeySplit(after) >= 0) {
        const line = this.lines[cur.idx];
        this.lines[cur.idx] = `${line.slice(0, indent)} ${line.slice(indent + 1)}`;
        out.push(this.block(cur.indent + (cur.text.length - after.length)));
        continue;
      }
      this.i = cur.idx + 1;
      if (after[0] === "|" || after[0] === ">") out.push(this.blockScalar(after, indent, cur.idx));
      else out.push(this.inline(after, cur.idx));
    }
    return out;
  }

  blockScalar(header, parentIndent, idx) {
    const m = /^([|>])(-?)$/.exec(header);
    if (!m) this.failAt(idx)(`unsupported block scalar header "${header}" (use |, |-, > or >-)`);
    const folded = m[1] === ">";
    const strip = m[2] === "-";
    const body = [];
    let contentIndent = null;
    let j = this.i;
    for (; j < this.lines.length; j++) {
      const line = this.lines[j];
      if (line.trim() === "") {
        body.push("");
        continue;
      }
      if (/^[ ]*\t/.test(line)) this.failAt(j)("tabs are not allowed for indentation");
      const ind = /^ */.exec(line)[0].length;
      if (contentIndent === null) {
        if (ind <= parentIndent) break;
        contentIndent = ind;
      }
      if (ind < contentIndent) break;
      if (folded && ind > contentIndent) this.failAt(j)("more-indented lines inside a folded '>' scalar are not supported; use '|'");
      body.push(line.slice(contentIndent));
    }
    this.i = j;
    while (body.length && body[body.length - 1] === "") body.pop();
    if (body.length === 0) return strip ? "" : "";
    let text;
    if (!folded) text = body.join("\n");
    else {
      text = "";
      let blanks = 0;
      for (const l of body) {
        if (l === "") {
          blanks++;
          continue;
        }
        if (text === "") text = "\n".repeat(blanks) + l;
        else text += blanks > 0 ? "\n".repeat(blanks) + l : ` ${l}`;
        blanks = 0;
      }
    }
    return strip ? text : `${text}\n`;
  }

  inline(text, idx) {
    const fail = this.failAt(idx);
    const c = text[0];
    if (c === '"') {
      const [v, end] = readDouble(text, 0, fail);
      if (end !== text.length) fail("unexpected text after the closing quote");
      return v;
    }
    if (c === "'") {
      const [v, end] = readSingle(text, 0, fail);
      if (end !== text.length) fail("unexpected text after the closing quote");
      return v;
    }
    if (c === "[" || c === "{") return new Flow(text, fail).parse();
    if ("&*!%@`".includes(c)) fail(`unsupported YAML indicator "${c}" (anchors, aliases and tags are not supported)`);
    if (text.startsWith("- ")) fail("a list item cannot start on the same line as its key; put it on the next line");
    if (text.includes(": ") || text.endsWith(":")) fail('plain text that contains ": " must be put in quotes');
    return resolvePlain(text, fail);
  }
}

/** Parses a PDS-YAML document. An empty document is `null`. `baseLine` shifts reported line numbers. */
export function parseYaml(text, { baseLine = 1 } = {}) {
  return new Parser(text, baseLine).document();
}

// ---------------------------------------------------------------------------
// Writing

function plainNeedsQuotes(s, inFlow) {
  if (s === "" || /^\s|\s$/.test(s) || /[\n\r\t\0]/.test(s)) return true;
  if ("-?:,[]{}#&*!|>'\"%@`".includes(s[0])) return true;
  if (s.includes(": ") || s.includes(" #") || s.endsWith(":")) return true;
  if (inFlow && /[,[\]{}]/.test(s)) return true;
  try {
    return resolvePlain(s, (m) => {
      throw new Error(m);
    }) !== s;
  } catch {
    return true;
  }
}

function scalar(v, inFlow = false) {
  if (v === null || v === undefined) return "null";
  if (typeof v === "boolean") return v ? "true" : "false";
  if (typeof v === "number") {
    if (!Number.isFinite(v)) throw new YamlError("cannot write a non-finite number");
    return String(v);
  }
  if (typeof v !== "string") throw new YamlError(`cannot write a ${typeof v} as a scalar`);
  return plainNeedsQuotes(v, inFlow) ? JSON.stringify(v) : v;
}

const isScalar = (v) => v === null || v === undefined || ["string", "number", "boolean"].includes(typeof v);
const isMultiline = (v) => typeof v === "string" && /\n/.test(v);

function flowOf(v) {
  if (Array.isArray(v)) return `[${v.map(flowOf).join(", ")}]`;
  if (v && typeof v === "object") {
    const parts = Object.entries(v).map(([k, x]) => `${scalar(k, true)}: ${flowOf(x)}`);
    return parts.length ? `{${parts.join(", ")}}` : "{}";
  }
  return scalar(v, true);
}

/** Short collections of scalars (and small maps of them) read well on one line; lists of records do not. */
function canFlow(v, depth = 0) {
  if (Array.isArray(v)) return depth < 2 && v.every((x) => (isScalar(x) && !isMultiline(x)) || (depth > 0 && canFlow(x, depth + 1)));
  if (v && typeof v === "object") return depth < 2 && Object.values(v).every((x) => (isScalar(x) && !isMultiline(x)) || canFlow(x, depth + 1));
  return false;
}

function check(v) {
  if (Array.isArray(v)) v.forEach(check);
  else if (v && typeof v === "object") Object.values(v).forEach(check);
  else if (!isScalar(v)) throw new YamlError(`cannot write a ${typeof v}`);
}

/**
 * Writes a value as PDS-YAML. Keys keep insertion order. Short collections of
 * scalars are written in flow style, everything else in block style.
 */
export function stringifyYaml(value, { flowMax = 78 } = {}) {
  const out = [];
  const emit = (v, indent, lead) => {
    const pad = " ".repeat(indent);
    if (Array.isArray(v)) {
      if (v.length === 0) return out.push(`${lead}[]`);
      v.forEach((item, n) => {
        const prefix = n === 0 && lead !== "" ? lead : pad;
        if (isScalar(item)) {
          if (isMultiline(item)) {
            out.push(`${prefix}- |`);
            for (const l of item.replace(/\n$/, "").split("\n")) out.push(`${pad}  ${l}`.trimEnd());
          } else out.push(`${prefix}- ${scalar(item)}`);
        } else if (canFlow(item) && `${pad}- ${flowOf(item)}`.length <= flowMax) out.push(`${prefix}- ${flowOf(item)}`);
        else emit(item, indent + 2, `${prefix}- `);
      });
      return undefined;
    }
    if (v && typeof v === "object") {
      const entries = Object.entries(v).filter(([, x]) => x !== undefined);
      if (entries.length === 0) return out.push(`${lead}{}`);
      entries.forEach(([k, x], n) => {
        const prefix = n === 0 && lead !== "" ? lead : pad;
        const key = scalar(k);
        if (isScalar(x)) {
          if (isMultiline(x)) {
            out.push(`${prefix}${key}: |${x.endsWith("\n") ? "" : "-"}`);
            for (const l of x.replace(/\n$/, "").split("\n")) out.push(`${pad}  ${l}`.trimEnd());
          } else out.push(`${prefix}${key}: ${scalar(x)}`);
        } else if (canFlow(x) && `${pad}${key}: ${flowOf(x)}`.length <= flowMax) out.push(`${prefix}${key}: ${flowOf(x)}`);
        else if (Array.isArray(x) && x.length === 0) out.push(`${prefix}${key}: []`);
        else if (!Array.isArray(x) && Object.keys(x).length === 0) out.push(`${prefix}${key}: {}`);
        else {
          out.push(`${prefix}${key}:`);
          emit(x, indent + 2, "");
        }
      });
      return undefined;
    }
    out.push(`${lead}${scalar(v)}`);
    return undefined;
  };
  check(value);
  emit(value, 0, "");
  return `${out.join("\n")}\n`;
}
