// @ts-check
/**
 * report.js — human and JSON rendering of plans and check results.
 */

/** @typedef {import("./plan.js").PlanItem} PlanItem */

const SYMBOL = /** @type {Record<string,string>} */ ({
  create: "+",
  insert: "+",
  update: "~",
  merge: "~",
  unchanged: "=",
  skip: "=",
  keep: "!",
  conflict: "!",
  remove: "-",
  notice: "i",
});

const LABEL = /** @type {Record<string,string>} */ ({
  create: "create",
  insert: "add to",
  update: "update",
  merge: "merge",
  unchanged: "ok",
  skip: "skip",
  keep: "keep",
  conflict: "conflict",
  remove: "remove",
  notice: "note",
});

/** @param {PlanItem[]} items */
export function summarize(items) {
  /** @type {Record<string, number>} */
  const counts = {};
  for (const it of items) counts[it.action] = (counts[it.action] ?? 0) + 1;
  return counts;
}

/** Skill files are the only grouped items; the runtime and tool config files stand alone. */
const UNGROUPED = new Set(["runtime"]);

/** @param {PlanItem} it */
function isSkillItem(it) {
  return it.type === "file" && Boolean(it.group) && !UNGROUPED.has(/** @type {string} */ (it.group));
}

/**
 * @param {PlanItem[]} items
 * @param {import("./scope.js").Scope} scope
 * @param {{ showUnchanged?: boolean }} [opts]
 * @returns {string[]}
 */
export function formatPlan(items, scope, opts = {}) {
  /** @type {{ item: PlanItem, count: number }[]} */
  const sequence = [];
  /** @type {Map<string, { item: PlanItem, count: number }>} */
  const grouped = new Map();

  // Skill files are shown once per skill and action, not once per file.
  for (const it of items) {
    if (isSkillItem(it)) {
      const k = `${it.group}|${it.action}`;
      const g = grouped.get(k);
      if (g) g.count += 1;
      else {
        const entry = { item: it, count: 1 };
        grouped.set(k, entry);
        sequence.push(entry);
      }
    } else sequence.push({ item: it, count: 1 });
  }

  /** @type {string[]} */
  const lines = [];
  for (const { item, count } of sequence) {
    if ((item.action === "unchanged" || item.action === "skip") && !opts.showUnchanged) continue;
    const sym = SYMBOL[item.action] ?? "?";
    if (item.type === "notice") {
      lines.push(`  ${sym} ${item.level === "warn" ? "WARNING" : "note"}: ${item.reason}`);
      continue;
    }
    const label = (LABEL[item.action] ?? item.action).padEnd(8);
    const isSkill = isSkillItem(item);
    const where = isSkill ? `skill ${item.group} (${count} file${count === 1 ? "" : "s"})` : scope.display(item.abs);
    const why = item.reason && item.action !== "create" && item.action !== "unchanged" ? `  - ${item.reason}` : "";
    lines.push(`  ${sym} ${label} ${where}${why}`);
  }
  return lines;
}

/**
 * @param {PlanItem[]} items
 * @returns {string}
 */
export function formatSummary(items) {
  const c = summarize(items);
  /** @type {string[]} */
  const parts = [];
  const add = (/** @type {string} */ k, /** @type {string} */ label) => {
    if (c[k]) parts.push(`${c[k]} ${label}`);
  };
  add("create", "created");
  add("insert", "added");
  add("update", "updated");
  add("merge", "merged");
  add("remove", "removed");
  add("keep", "kept (modified)");
  add("conflict", "conflict(s)");
  add("unchanged", "already current");
  return parts.length ? parts.join(", ") : "nothing to do";
}

/**
 * JSON-safe plan (no file contents).
 * @param {PlanItem[]} items
 * @param {import("./scope.js").Scope} scope
 */
export function planToJson(items, scope) {
  return items.map((it) => ({
    type: it.type,
    action: it.action,
    path: it.abs ? scope.display(it.abs) : null,
    key: it.key || null,
    reason: it.reason,
    ...(it.group ? { group: it.group } : {}),
    ...(it.level ? { level: it.level } : {}),
  }));
}
