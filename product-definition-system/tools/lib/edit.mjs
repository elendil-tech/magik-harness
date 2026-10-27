// Surgical edits to a record's front matter. Authors write these files by hand,
// so a tool edit must change one key and leave comments, order and the body as
// they were.

function fences(lines) {
  if (lines[0]?.trimEnd() !== "---") throw new Error("the record has no front matter");
  const close = lines.findIndex((l, i) => i > 0 && l.trimEnd() === "---");
  if (close < 0) throw new Error("the front matter is never closed with ---");
  return close;
}

/** Index range [start, end) of a top-level key and the lines that belong to it. */
function keyRange(front, key) {
  const re = new RegExp(`^${key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*:`);
  const start = front.findIndex((l) => re.test(l));
  if (start < 0) return null;
  let end = start + 1;
  for (let i = start + 1; i < front.length; i++) {
    const l = front[i];
    if (/^[ \t]/.test(l) || /^-(\s|$)/.test(l)) end = i + 1;
    else if (l.trim() === "" || l.trimStart().startsWith("#")) continue;
    else break;
  }
  return [start, end];
}

/**
 * Replace a top-level key with `valueLines`, or add it after `maturity` (else at the end).
 * A file with Windows line endings keeps them: the lines written end the way the others do.
 */
export function setFrontKey(text, key, valueLines) {
  const lines = text.split("\n");
  const close = fences(lines);
  const front = lines.slice(1, close);
  const cr = text.includes("\r\n") ? "\r" : "";
  const value = valueLines.map((l) => l + cr);
  const range = keyRange(front, key);
  if (range) front.splice(range[0], range[1] - range[0], ...value);
  else {
    const m = keyRange(front, "maturity");
    front.splice(m ? m[1] : front.length, 0, ...value);
  }
  return [lines[0], ...front, ...lines.slice(close)].join("\n");
}

/** Remove a top-level key. Returns the text unchanged when the key is absent. */
export function removeFrontKey(text, key) {
  const lines = text.split("\n");
  const close = fences(lines);
  const front = lines.slice(1, close);
  const range = keyRange(front, key);
  if (!range) return text;
  front.splice(range[0], range[1] - range[0]);
  return [lines[0], ...front, ...lines.slice(close)].join("\n");
}
