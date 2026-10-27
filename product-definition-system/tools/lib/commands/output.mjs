// Commands that show the definition: views, impact, the reference, the meta-model.
import { existsSync, mkdirSync, readdirSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { Failure, UsageError, closest } from "../errors.mjs";
import { columns, plural, shownPath, wrap } from "../format.mjs";
import { renderView, plan, VIEW_IDS, ViewError, BANNER_START } from "../views/index.mjs";
import { impactOf, describePath } from "../impact.mjs";
import { validateMeta } from "../metamodel.mjs";
import { IMPLEMENTATIONS } from "../checks/index.mjs";
import { generateReference } from "../refdocs.mjs";
import { isWithin, realLocation } from "../project.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const REFERENCE_DIR = join(HERE, "..", "..", "..", "docs", "reference");
const GENERATED = BANNER_START;

/** What a link needs in front of a project-relative path to reach it from `fromDir`. */
const toRoot = (fromDir, root) => {
  const r = relative(fromDir, root).split(sep).join("/");
  return r ? r + "/" : "";
};

function show(ctx, id, target, up) {
  try {
    return renderView(ctx.analysis, id, target, { up });
  } catch (e) {
    if (e instanceof ViewError) throw new UsageError(e.message);
    throw e;
  }
}

/** Print a view, or write it to --out. */
function emitView(ctx, name, target) {
  // links back to the records are made from where the file will be written, so they work wherever it goes
  const file = ctx.flags.out ? resolve(ctx.cwd, ctx.flags.out) : null;
  const text = show(ctx, name, target, file ? toRoot(dirname(file), ctx.root) : undefined);
  if (file) {
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, text);
    ctx.out(`Wrote ${shownPath(ctx.cwd, file)}`);
  } else ctx.out(text);
  return 0;
}

// ----------------------------------------------------------------------- view

export const view = {
  summary: "Show one view: a diagram or a table generated from the definition",
  usage: "view [NAME] [ID] [--out FILE]",
  help: "Without a name, lists the views. A view is a projection of the records: change the records and the view follows. Diagrams are Mermaid, which renders in GitHub, most editors and mermaid.live.",
  flags: { out: { type: "string", doc: "Write to this file instead of printing. Relative to where you run the command." } },
  run(ctx) {
    const [name, target] = ctx.args;
    if (!name) {
      const rows = [...ctx.meta.views].map(([id, v]) => [`  ${id}`, v.scope, v.answers]);
      ctx.out(["The views. Point one at an element with: pds view NAME ID", "", ...columns(rows), ""].join("\n"));
      return 0;
    }
    if (!VIEW_IDS.includes(name)) throw new UsageError(`no view ${name}${closest(name, VIEW_IDS) ? `; did you mean ${closest(name, VIEW_IDS)}?` : ""}`);
    return emitView(ctx, name, target);
  },
};

export const spec = {
  summary: "The assembled specification of a feature or capability",
  usage: "spec ID [--out FILE]",
  help: "Shorthand for `pds view spec ID`: every flow, screen, rule, requirement, test and open question of the feature in one document, with its diagrams.",
  flags: { out: { type: "string", doc: "Write to this file instead of printing. Relative to where you run the command." } },
  run(ctx) {
    if (!ctx.args[0]) throw new UsageError("spec needs a feature or capability id, for example: pds spec FEAT-send-invoice");
    return emitView(ctx, "spec", ctx.args[0]);
  },
};

// ---------------------------------------------------------------------- views

function isGenerated(file) {
  try {
    return readFileSync(file, "utf8").startsWith(GENERATED);
  } catch {
    return false;
  }
}

function existingGenerated(dir) {
  const out = [];
  const walk = (d) => {
    if (!existsSync(d)) return;
    for (const name of readdirSync(d, { withFileTypes: true })) {
      const full = join(d, name.name);
      if (name.isDirectory()) walk(full);
      else if (name.name.endsWith(".md") && isGenerated(full)) out.push(full);
    }
  };
  walk(dir);
  return out;
}

export const views = {
  summary: "Generate every view into the views folder",
  usage: "views [--out DIR] [--check]",
  help: "Writes the product-wide views and one specification per feature and capability. Files that were generated earlier and no longer correspond to anything are removed; files you wrote yourself, which lack the generated banner, are never touched. With --check, writes nothing and fails when the folder is out of date.",
  flags: {
    out: { type: "string", doc: "The folder to write to, relative to where you run the command (default: views_dir from pds.yaml)." },
    check: { type: "bool", doc: "Fail if the generated views are out of date; write nothing." },
  },
  run(ctx) {
    const a = ctx.analysis;
    const misplaced = ctx.flags.out ? undefined : ctx.project.problems.find((p) => p.key === "views_dir");
    if (misplaced) throw new Failure(`pds.yaml: ${misplaced.msg}. Fix it, or give the folder with --out.`);
    const dir = ctx.flags.out ? resolve(ctx.cwd, ctx.flags.out) : join(ctx.root, a.config.viewsDir);
    // the definition folder is read as records, so generated files must not go in it, and it must not be swept for stale ones
    const records = realLocation(join(ctx.root, a.config.definitionDir));
    const target = realLocation(dir);
    if (isWithin(records, target) || isWithin(target, records)) throw new UsageError(`${shownPath(ctx.cwd, dir)} is the definition folder, or has it inside, or is inside it. The definition folder is read as records, so generated views belong somewhere else.`);
    const files = plan(a, { up: toRoot(dir, ctx.root) });
    const stale = existingGenerated(dir).filter((f) => !files.has(relative(dir, f).split(/[\\/]/).join("/")));
    const changed = [];
    for (const [name, text] of files) {
      const full = join(dir, name);
      if (!existsSync(full) || readFileSync(full, "utf8") !== text) changed.push(name);
    }
    if (ctx.flags.check) {
      if (!changed.length && !stale.length) {
        ctx.out(`The ${files.size} generated views are up to date.`);
        return 0;
      }
      const more = (list, shown) => (list.length > shown ? [`  ... and ${list.length - shown} more`] : []);
      ctx.out([`The generated views are out of date: ${plural(changed.length, "file")} differ${changed.length === 1 ? "s" : ""}, ${plural(stale.length, "stale file")}.`, ...changed.slice(0, 8).map((f) => `  changed  ${f}`), ...more(changed, 8), ...stale.slice(0, 4).map((f) => `  stale    ${relative(dir, f)}`), ...more(stale, 4), "Run: pds views"].join("\n"));
      return 1;
    }
    for (const name of changed) {
      const full = join(dir, name);
      mkdirSync(dirname(full), { recursive: true });
      writeFileSync(full, files.get(name));
    }
    for (const f of stale) unlinkSync(f);
    ctx.out(`${plural(files.size, "view file")} in ${shownPath(ctx.cwd, dir)}/: ${changed.length} written, ${files.size - changed.length} unchanged${stale.length ? `, ${stale.length} stale removed` : ""}.`);
    return 0;
  },
};

// --------------------------------------------------------------------- impact

export const impact = {
  summary: "What has to be reviewed if this element changes",
  usage: "impact ID [--json] [--strong-hops N] [--weak-hops N]",
  help: "Walks the relations from the element. Strong links mean must review, weak links mean should review. Strong links are followed further than weak ones; the limits and the strength of every relation are in the meta-model.",
  flags: {
    json: { type: "bool", doc: "Machine-readable output." },
    "strong-hops": { type: "int", doc: "How far strong links are followed." },
    "weak-hops": { type: "int", doc: "How far weak links are followed." },
  },
  run(ctx) {
    const [id] = ctx.args;
    if (!id) throw new UsageError("impact needs an element id, for example: pds impact ENT-invoice");
    const { model } = ctx.analysis;
    if (!model.has(id)) throw new Failure(`no element ${id}${closest(id, [...model.elements.keys()]) ? `; did you mean ${closest(id, [...model.elements.keys()])}?` : ""}`, 2);
    const result = impactOf(model, id, { strongHops: ctx.flags["strong-hops"], weakHops: ctx.flags["weak-hops"] });
    if (ctx.flags.json) {
      ctx.out(JSON.stringify(result, null, 2));
      return 0;
    }
    const { start, reached, owners } = result;
    const lines = [`A change to ${start.id} (${start.title}) reaches ${plural(reached.length, "element")}${owners.length ? `, owned by ${plural(owners.length, "feature or capability", "features and capabilities")}` : ""}.`, ""];
    for (const [label, strength] of [["Must review", "strong"], ["Should review", "weak"]]) {
      const group = reached.filter((r) => r.strength === strength);
      lines.push(`${label} (${group.length})`);
      if (!group.length) lines.push("  none");
      for (const r of group) lines.push(`  ${r.id}  ${r.title}`, `      ${describePath(r.path)}`);
      lines.push("");
    }
    if (owners.length) lines.push("Who owns what is affected", ...columns(owners.map((o) => [`  ${o.id}`, o.title, o.strength])), "");
    ctx.out(lines.join("\n"));
    return 0;
  },
};

// ----------------------------------------------------------------------- docs

export const docs = {
  summary: "Generate the reference documentation from the meta-model",
  usage: "docs [--out DIR] [--check]",
  help: "The reference lists every element type, relation, rule, check, probe, view and module with counts computed from the meta-model, so it cannot disagree with it. With --check it writes nothing and fails when the committed files are out of date.",
  flags: {
    out: { type: "string", doc: "The folder to write to, relative to where you run the command (default: docs/reference in the tool)." },
    check: { type: "bool", doc: "Fail if the reference is out of date; write nothing." },
  },
  run(ctx) {
    const dir = ctx.flags.out ? resolve(ctx.cwd, ctx.flags.out) : REFERENCE_DIR;
    const files = generateReference(ctx.meta);
    const changed = [...files].filter(([name, text]) => !existsSync(join(dir, name)) || readFileSync(join(dir, name), "utf8") !== text).map(([name]) => name);
    if (ctx.flags.check) {
      if (!changed.length) {
        ctx.out(`The ${files.size} reference files are up to date.`);
        return 0;
      }
      ctx.out([`The reference is out of date: ${changed.join(", ")}.`, "Run: pds docs"].join("\n"));
      return 1;
    }
    mkdirSync(dir, { recursive: true });
    for (const name of changed) writeFileSync(join(dir, name), files.get(name));
    ctx.out(`${plural(files.size, "reference file")} in ${shownPath(ctx.cwd, dir)}/: ${changed.length} written, ${files.size - changed.length} unchanged.`);
    return 0;
  },
};

// ----------------------------------------------------------------------- meta

export const meta = {
  summary: "Check the meta-model against itself, or list what it defines",
  usage: "meta check | meta list [types|relations|rules|probes|views|modules|profiles]",
  help: "`meta check` verifies that the meta-model is consistent: every relation is read by something, every rule can be satisfied, every declared check and view is implemented, every skeleton seed is valid.",
  flags: {},
  run(ctx) {
    const [sub, what] = ctx.args;
    const m = ctx.meta;
    if (sub === "check") {
      const problems = validateMeta(m, { checks: Object.keys(IMPLEMENTATIONS), views: VIEW_IDS });
      if (!problems.length) {
        ctx.out(`The meta-model is consistent: ${m.types.size} element types, ${m.relations.size} relations, ${m.rules.length + m.implicitRules.length} rules, ${m.checks.length} checks, ${m.probes.length} probes, ${m.views.size} views.`);
        return 0;
      }
      ctx.out([...problems.map((p) => `  ${p}`), "", plural(problems.length, "problem")].join("\n"));
      return 1;
    }
    if (sub === "list") {
      const sets = {
        types: () => [...m.types.values()].map((t) => [`  ${t.code}`, t.name, t.adoption, m.families[t.family].title]),
        relations: () => [...m.relations.values()].map((r) => [`  ${r.name}`, `(${r.inverse})`, r.doc.split(". ")[0]]),
        rules: () => [...m.rules].map((r) => [`  ${r.id}`, r.applies.from, r.msg]),
        probes: () => m.probes.map((p) => [`  ${p.id}`, p.module || "core", p.title]),
        views: () => [...m.views].map(([id, v]) => [`  ${id}`, v.scope, v.title]),
        modules: () => Object.entries(m.modules).map(([id, v]) => [`  ${id}`, v.title, v.doc]),
        profiles: () => Object.values(m.profiles).map((p) => [`  ${p.id}`, p.defaults.adoption, p.title]),
      };
      if (!what || !sets[what]) throw new UsageError(`meta list needs one of: ${Object.keys(sets).join(", ")}`);
      ctx.out(columns(sets[what]()).join("\n"));
      return 0;
    }
    throw new UsageError("meta needs a subcommand: check or list");
  },
};
