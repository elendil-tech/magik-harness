// Plain-text formatting for the command line. No colour and no cursor tricks:
// the output has to read the same in a terminal, a log and a test.

export const plural = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

export function bar(fraction, width = 12) {
  const filled = Math.max(0, Math.min(width, Math.round(fraction * width)));
  return "█".repeat(filled) + "░".repeat(width - filled);
}

/** Wrap text to a width, indenting every line. */
export function wrap(text, width = 92, indent = "", first = indent) {
  const out = [];
  let line = "";
  const lead = () => (out.length ? indent : first);
  for (const word of String(text).split(/\s+/).filter(Boolean)) {
    if (line && lead().length + line.length + 1 + word.length > width) {
      out.push(lead() + line);
      line = word;
    } else line = line ? `${line} ${word}` : word;
  }
  if (line) out.push(lead() + line);
  return out;
}

/** Rows of cells as aligned columns. */
export function columns(rows, { gap = 2, indent = "" } = {}) {
  if (!rows.length) return [];
  const widths = rows[0].map((_, c) => Math.max(...rows.map((r) => String(r[c] ?? "").length)));
  return rows.map((r) => indent + r.map((cell, c) => (c === r.length - 1 ? String(cell ?? "") : String(cell ?? "").padEnd(widths[c] + gap))).join("").trimEnd());
}

export const SEV_LABEL = { error: "error", warn: "warn ", info: "info " };

/** Findings grouped by file, in the order they arrive. */
export function formatFindings(findings, { verbose = false } = {}) {
  const shown = findings.filter((f) => verbose || f.sev !== "info");
  const byPath = new Map();
  for (const f of shown) {
    const key = f.path || "(project)";
    if (!byPath.has(key)) byPath.set(key, []);
    byPath.get(key).push(f);
  }
  const lines = [];
  for (const [path, list] of byPath) {
    lines.push(path);
    for (const f of list) {
      lines.push(`  ${SEV_LABEL[f.sev] || f.sev}  ${f.id}${f.line ? `  line ${f.line}` : ""}  ${f.msg}`);
      if (f.hint) lines.push(...wrap(f.hint, 96, "            ", "          → "));
    }
    lines.push("");
  }
  return lines;
}

/** Gaps grouped by element, in queue order, for `pds next` and `pds ask`. */
export function formatGaps(gaps, { elements = 5, items = Infinity } = {}) {
  const groups = [];
  const byKey = new Map();
  for (const g of gaps) {
    const key = `${g.element}|${g.rung}`;
    let group = byKey.get(key);
    if (!group) {
      group = { element: g.element, type: g.type, title: g.title, tier: g.tier, rung: g.rung, items: [] };
      byKey.set(key, group);
      groups.push(group);
    }
    group.items.push(g);
  }
  const lines = [];
  groups.slice(0, elements).forEach((g, i) => {
    lines.push(`${i + 1}. ${g.element} · ${g.title} · tier ${g.tier} · towards ${g.rung}`);
    for (const item of g.items.slice(0, items)) {
      lines.push(`   - ${item.msg}  (${item.rule}${item.sev === "info" ? ", suggested" : ""})`);
      if (item.ask && items === Infinity) lines.push(...wrap(item.ask, 96, "       "));
    }
    if (g.items.length > items) lines.push(`   … and ${g.items.length - items} more`);
    lines.push("");
  });
  return { lines, total: groups.length };
}

/** A maturity record as one phrase: "outlined" or "outlined, claims specified". */
export function maturityPhrase(m) {
  if (!m) return "retired";
  return m.declared === m.computed ? m.computed : `${m.computed}, claims ${m.declared}`;
}
