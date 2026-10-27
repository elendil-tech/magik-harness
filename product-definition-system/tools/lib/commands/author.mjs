// Commands that write to the definition: start a project, add a record, record an approval.
import { existsSync, mkdirSync, readFileSync, rmSync, statSync, unlinkSync, writeFileSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { Failure, UsageError, closest } from "../errors.mjs";
import { plural, shownPath } from "../format.mjs";
import { CONFIG_FILE, resolveConfig } from "../project.mjs";
import { expandSeeds, slugify } from "../seed.mjs";
import { renderRecord, pathFor } from "../templates.mjs";
import { setFrontKey, removeFrontKey } from "../edit.mjs";
import { ID_RE } from "../records.mjs";
import { approvalHash, covered } from "../approval.mjs";
import { stringifyYaml } from "../yaml.mjs";

function writeNew(root, rel, text) {
  const full = join(root, rel);
  mkdirSync(dirname(full), { recursive: true });
  writeFileSync(full, text);
}

const humanise = (slug) => {
  const s = slug.replace(/-/g, " ");
  return s.charAt(0).toUpperCase() + s.slice(1);
};

// ----------------------------------------------------------------------- init

export const init = {
  summary: "Start a project: pds.yaml, the product record and the profile's skeleton",
  usage: "init [DIR] [--name NAME] [--profile saas|none] [--adoption core|standard|full] [--modules a,b] [--no-skeleton]",
  help: "Writes pds.yaml, the product record and, unless --no-skeleton, a stub for every domain, capability, actor, role, surface, obligation and foundational question the profile expects. Skeleton records are prompts, not decisions: they are capped at outlined until a person confirms them.",
  flags: {
    name: { type: "string", doc: "The product's name (default: the folder name)." },
    profile: { type: "string", doc: "Which profile to start from (default saas; none for an empty project)." },
    adoption: { type: "string", doc: "How much of the model to use: core, standard or full." },
    modules: { type: "list", doc: "Which modules to enable, instead of the profile's." },
    "no-skeleton": { type: "bool", doc: "Write only the product record." },
  },
  run(ctx) {
    const { meta, flags } = ctx;
    const dir = resolve(ctx.cwd, ctx.args[0] ?? ".");
    if (existsSync(dir) && !statSync(dir).isDirectory()) throw new UsageError(`${dir} is a file, not a folder: give the folder to start the project in`);
    if (existsSync(join(dir, CONFIG_FILE))) throw new Failure(`${dir} already has a ${CONFIG_FILE}`);
    const name = flags.name ?? basename(dir);
    const productSlug = slugify(name);
    if (!productSlug) throw new UsageError("the product name needs at least one letter or digit");
    const profileId = flags.profile === undefined ? "saas" : flags.profile === "none" ? undefined : flags.profile;
    if (profileId && !meta.profile(profileId)) throw new UsageError(`unknown profile ${profileId}; known: ${Object.keys(meta.profiles).join(", ")}, or none`);

    const raw = { pds: 1, name };
    if (profileId) raw.profile = profileId;
    const defaults = meta.profile(profileId)?.defaults || {};
    raw.adoption = flags.adoption ?? defaults.adoption ?? "standard";
    raw.modules = flags.modules ?? defaults.modules ?? ["core"];
    raw.approvers = [];
    const { config, problems } = resolveConfig(meta, raw);
    if (problems.length) throw new UsageError(problems.map((p) => p.msg).join("; "));

    const productId = `PROD-${productSlug}`;
    mkdirSync(dir, { recursive: true });
    const header = ["# A product definition. `pds help` lists what you can do with it.", "# approvers: the people who may approve critical elements. Approval is a person's", "# decision; an agent proposes and never approves.", ""].join("\n");
    writeFileSync(join(dir, CONFIG_FILE), header + stringifyYaml(raw));
    writeNew(dir, pathFor(meta, config, productId), renderRecord(meta, "PROD", { id: productId, title: name }));

    let written = 1;
    let skipped = [];
    const patterns = profileId && !flags["no-skeleton"] ? meta.patterns(profileId) : null;
    if (patterns) {
      const expanded = expandSeeds(meta, config, patterns, { productId });
      skipped = expanded.skipped;
      for (const s of expanded.seeds) {
        writeNew(dir, pathFor(meta, config, s.id), renderRecord(meta, s.type, { id: s.id, title: s.title, anchor: s.anchor, origin: "skeleton", fields: s.fields, rel: s.rel, note: s.note }));
        written++;
      }
    }
    const shown = shownPath(ctx.cwd, dir);
    const lines = [`Started ${name} in ${shown}: ${CONFIG_FILE} and ${plural(written, "record")} under ${config.definitionDir}/.`];
    if (patterns) lines.push(`${plural(written - 1, "skeleton record")} (origin: skeleton) are prompts to confirm, correct or delete. ${plural(skipped.length, "seed")} left out because the modules or adoption level do not call for them.`);
    lines.push("", "Next:", ...(shown === "." ? [] : [`  cd ${shown}`]), "  pds status        where things stand", "  pds next          what to write first", `  pds ask ${productId}  the questions that take the product record up the ladder`, "");
    ctx.out(lines.join("\n"));
    return 0;
  },
};

// ------------------------------------------------------------------------ new

export const create = {
  summary: "Create a record from its template",
  usage: "new TYPE NAME [--title TEXT] [--anchor ID] [--summary TEXT]",
  help: "TYPE is an element type such as FEAT, FLW or ENT (pds explain TYPE). NAME is a slug such as send-invoice, giving the id FEAT-send-invoice; or the title itself, such as \"Send an invoice\", from which the slug is made. The anchor, the element it lives under, is inferred when only one candidate exists; otherwise pass --anchor.",
  flags: {
    title: { type: "string", doc: "The name shown everywhere (default: made from the slug)." },
    anchor: { type: "string", doc: "The element it lives under." },
    summary: { type: "string", doc: "One sentence, 200 characters at most." },
  },
  run(ctx) {
    const [typeArg, name] = ctx.args;
    const meta = ctx.meta;
    if (!typeArg || !name) throw new UsageError("new needs a type and a name, for example: pds new FEAT send-invoice --anchor CAP-invoicing");
    const type = typeArg.toUpperCase();
    if (!meta.types.has(type)) throw new UsageError(`unknown element type ${typeArg}${closest(type, [...meta.types.keys()]) ? `; did you mean ${closest(type, [...meta.types.keys()])}?` : `; the types are: ${[...meta.types.keys()].join(", ")}`}`);
    // a slug is used as given; anything else is a title, and the slug is made from it
    let slug = name;
    let title = ctx.flags.title?.trim();
    if (ctx.flags.title !== undefined && (!title || /[\r\n]/.test(title))) throw new UsageError("--title is one line of text, and not empty");
    if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(name)) {
      slug = slugify(name);
      title ??= name.trim();
      if (!slug) throw new UsageError(`cannot make an id from "${name}": ids use the letters a-z and digits. Give the id a slug and keep the name as the title, for example: pds new ${type} my-slug --title "${name}"`);
    }
    const id = `${type}-${slug}`;
    if (!ID_RE.test(id)) throw new UsageError(`${id} is not a valid id`);

    const { config } = ctx.project;
    const { model } = ctx.analysis;
    const spec = meta.spec(type);
    if (model.has(id)) throw new Failure(`${id} already exists: ${model.get(id).path}`);
    if (spec.singleton && model.all(type).length) throw new Failure(`there is already a ${spec.name.toLowerCase()}: ${model.all(type)[0].id}. A product has only one.`);
    if (!config.enabledTypes.has(type)) throw new Failure(`${spec.name} belongs to the ${spec.adoption} adoption level and this project uses ${config.adoption}. Change adoption in ${CONFIG_FILE} to use it.`);

    let anchor = ctx.flags.anchor;
    if (spec.anchors.length === 0) anchor = undefined;
    else if (anchor) {
      const a = model.get(anchor);
      if (!a) throw new UsageError(`no element ${anchor}${closest(anchor, [...model.elements.keys()]) ? `; did you mean ${closest(anchor, [...model.elements.keys()])}?` : ""}`);
      if (!spec.anchors.includes(a.type) && !spec.anchors.includes("*")) throw new UsageError(`a ${type} lives under ${spec.anchors.join(" or ")}, not under a ${a.type} (${anchor})`);
    } else {
      const candidates = model.all(spec.anchors).filter((e) => !model.isRetired(e.id));
      // The usual place is under the first type it may live under (a domain under the product, a
      // capability under a domain), so that is taken when it is unambiguous; nesting is the exception.
      const usual = candidates.filter((e) => e.type === spec.anchors[0]);
      if (candidates.length === 1) anchor = candidates[0].id;
      else if (usual.length === 1) anchor = usual[0].id;
      else throw new UsageError(`a ${type} lives under ${spec.anchors.join(" or ")}, and ${candidates.length ? "there are several" : "there are none yet"}. Pass --anchor${candidates.length ? ` with one of: ${candidates.slice(0, 8).map((c) => c.id).join(", ")}${candidates.length > 8 ? ", ..." : ""}` : ""}`);
    }
    const summary = ctx.flags.summary?.trim();
    if (summary !== undefined && (summary.length > 200 || summary.includes("\n"))) throw new UsageError(`a summary is one line of at most 200 characters; this one is ${summary.length}`);
    const fields = summary ? { summary } : undefined;
    const rel = pathFor(meta, config, id);
    writeNew(ctx.root, rel, renderRecord(meta, type, { id, title: title ?? humanise(slug), anchor, fields }));
    ctx.invalidate();
    ctx.out([`Created ${rel}${anchor ? ` (under ${anchor})` : ""}`, `Next: fill it in, then \`pds ask ${id}\` for what it still needs.`].join("\n"));
    return 0;
  },
};

// --------------------------------------------------------------------- rename

const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

export const rename = {
  summary: "Rename an element: its id, its file and every reference to it",
  usage: "rename OLD NEW [--title TEXT] [--dry-run]",
  help: "Ids are the stable handle everything else points at, so a rename is one operation, never a find-and-replace: the record moves to its new filename, every reference in every record (anchor, rel, [[wikilinks]], prose) is rewritten, approvals that were valid before stay valid (their hash is re-sealed), and the whole definition is checked again. If the rename would introduce a new error nothing is changed. The type prefix cannot change. Run `pds views` afterwards to refresh generated views.",
  flags: {
    title: { type: "string", doc: "Also give the element a new title." },
    "dry-run": { type: "bool", doc: "Show what would change without changing it." },
  },
  run(ctx) {
    const [oldId, newId] = ctx.args;
    if (!oldId || !newId) throw new UsageError("rename needs the current id and the new one, for example: pds rename DOM-core-product DOM-invoicing");
    const a = ctx.analysis;
    const { model, meta, config } = a;
    const el = model.get(oldId);
    if (!el) throw new Failure(`no element ${oldId}${closest(oldId, [...model.elements.keys()]) ? `; did you mean ${closest(oldId, [...model.elements.keys()])}?` : ""}`, 2);
    const m = ID_RE.exec(newId);
    if (!m) throw new UsageError(`${newId} is not a valid id: a type prefix, a hyphen, then lowercase words joined by hyphens, like DOM-invoicing`);
    if (m[1] !== el.type) throw new UsageError(`a rename keeps the type: ${oldId} is a ${el.type}, so the new id must start with ${el.type}-`);
    if (newId === oldId) throw new UsageError("the new id is the same as the old one");
    if (model.has(newId) || ctx.project.files.has(pathFor(meta, config, newId))) throw new Failure(`${newId} already exists`);

    if (ctx.flags.title && el.front.approval?.state === "approved") {
      throw new Failure(`${oldId} is approved, and a new title changes what was approved. Revoke the approval first (pds approve ${oldId} --revoke), or rename without --title.`);
    }

    // The token is the whole id: DOM-core must not match inside DOM-core-product.
    const src = `(?<![A-Za-z0-9-])${escapeRe(oldId)}(?![A-Za-z0-9-])`;
    const mentions = (text) => new RegExp(src).test(text);
    const rewrite = (text) => text.replace(new RegExp(src, "g"), newId);
    const abs = (path) => join(ctx.root, path);
    const write = (path, text) => {
      mkdirSync(dirname(abs(path)), { recursive: true });
      writeFileSync(abs(path), text);
    };

    const before = new Map(ctx.project.files);
    if (existsSync(abs(CONFIG_FILE))) before.set(CONFIG_FILE, readFileSync(abs(CONFIG_FILE), "utf8"));
    const oldPath = el.path;
    const newPath = pathFor(meta, config, newId);

    // What changes: every file that holds the id, and the record itself, which also moves.
    const after = new Map();
    let references = 0;
    for (const [path, text] of before) {
      if (path !== oldPath && !mentions(text)) continue;
      if (path !== oldPath) references++;
      let next = rewrite(text);
      if (path === oldPath && ctx.flags.title) next = setFrontKey(next, "title", stringifyYaml({ title: ctx.flags.title }).trimEnd().split("\n"));
      after.set(path, next);
    }

    // An approval that held before the rename still holds after it: the edit is mechanical, not a
    // change of meaning. The ones that hold now are re-sealed once the files are rewritten.
    const holding = [...model.elements.values()].filter((e) => e.front.approval?.state === "approved" && e.front.approval.hash === approvalHash(model, config, e));
    const touched = holding.filter((e) => covered(model, config, e).some((c) => after.has(c.path)));

    const summary = [`${oldPath} -> ${newPath}`, `${plural(references, "other file")} ${references === 1 ? "refers" : "refer"} to it`];
    if (touched.length) summary.push(`${plural(touched.length, "approval")} re-sealed, still valid`);
    if (ctx.flags["dry-run"]) {
      ctx.out([`Would rename ${oldId} to ${newId}:`, ...summary.map((s) => `  - ${s}`)].join("\n"));
      return 0;
    }

    const errorsBefore = a.counts.error;
    // Everything below either completes or leaves the files exactly as they were, whether it is
    // stopped by what the new errors say or by the file system (a read-only file, a name too long).
    const written = new Set(after.keys()); // by the paths they had before
    const somethingThere = existsSync(abs(newPath)); // not ours to remove if it was there already
    const putBack = () => {
      if (!somethingThere) rmSync(abs(newPath), { force: true });
      for (const path of written) {
        try {
          write(path, before.get(path));
        } catch {
          // keep going: put back as much as can be put back
        }
      }
      ctx.invalidate();
    };
    let now;
    try {
      for (const [path, text] of after) write(path === oldPath ? newPath : path, text);
      unlinkSync(abs(oldPath));
      ctx.invalidate();
      for (const e of touched) {
        const { model: m2, config: c2 } = ctx.analysis;
        const el2 = m2.get(e.id === oldId ? newId : e.id);
        const hash = approvalHash(m2, c2, el2);
        if (hash === el2.front.approval.hash) continue;
        const file = abs(el2.path);
        written.add(e.id === oldId ? oldPath : e.path);
        writeFileSync(file, setFrontKey(readFileSync(file, "utf8"), "approval", stringifyYaml({ approval: { ...el2.front.approval, hash } }, { flowMax: 240 }).trimEnd().split("\n")));
        ctx.invalidate();
      }
      now = ctx.analysis;
    } catch (e) {
      putBack();
      throw e;
    }
    if (now.counts.error > errorsBefore || !now.model.has(newId) || now.model.has(oldId)) {
      putBack();
      throw new Failure(`renaming ${oldId} to ${newId} would introduce ${plural(now.counts.error - errorsBefore, "new error")}, so nothing was changed. Try --dry-run, then \`pds lint\`.`, 3);
    }
    const views = existsSync(abs(config.viewsDir));
    ctx.out([`Renamed ${oldId} to ${newId}:`, ...summary.map((s) => `  - ${s}`), ...(views ? ["Run `pds views` to refresh the generated views."] : [])].join("\n"));
    return 0;
  },
};

// -------------------------------------------------------------------- approve

export const approve = {
  summary: "Record that a person read and accepted an element",
  usage: "approve ID --by NAME [--note TEXT] [--force] | approve ID --revoke",
  help: "Approval is bound to content: the hash of what was approved is stored with it, and any later edit shows as GOV-approval-hash until it is approved again. The unit of approval is the unit of build: approving a feature covers the feature and everything anchored beneath it (its flows, screens, rules, requirements, tests), so one review signs off one specification. Elements under no feature are approved on their own. Refuses when anything covered claims more than it supports, has errors, or is a skeleton, unless --force. Only people listed under approvers in pds.yaml may approve. Refused outright when PDS_AGENT is set: agents propose, people approve.",
  flags: {
    by: { type: "string", doc: "Who is approving. Must be listed under approvers in pds.yaml." },
    note: { type: "string", doc: "A short reason or condition to record with the approval." },
    date: { type: "string", doc: "The approval date (default: today)." },
    force: { type: "bool", doc: "Approve despite the refusals above. The reasons are still printed." },
    revoke: { type: "bool", doc: "Remove the approval and return the element to draft." },
  },
  run(ctx) {
    const [id] = ctx.args;
    const { flags, env } = ctx;
    if (!id) throw new UsageError("approve needs an element id, for example: pds approve FEAT-send-invoice --by gianluca");
    if (env.PDS_AGENT) throw new Failure("approval was refused because PDS_AGENT is set. It records that a person read and accepted the element: agents propose, people approve.");
    const a = ctx.analysis;
    const { model, meta, config } = a;
    const el = model.get(id);
    if (!el) throw new Failure(`no element ${id}${closest(id, [...model.elements.keys()]) ? `; did you mean ${closest(id, [...model.elements.keys()])}?` : ""}`, 2);
    const full = join(ctx.root, el.path);
    const before = readFileSync(full, "utf8");

    if (flags.revoke) {
      if (!el.front.approval) throw new Failure(`${id} has no approval to revoke`);
      writeFileSync(full, removeFrontKey(before, "approval"));
      ctx.invalidate();
      ctx.out(`Revoked the approval of ${id}. It is a draft again.`);
      return 0;
    }

    if (!flags.by) throw new UsageError("approve needs --by NAME: who is approving");
    if (!config.approvers.length) throw new Failure(`pds.yaml lists no approvers. Name the people who may approve, for example:\n  approvers: [${flags.by}]`);
    if (!config.approvers.includes(flags.by)) throw new Failure(`${flags.by} is not a listed approver (${config.approvers.join(", ")})`);
    const m = a.maturity.get(id);
    if (!m) throw new Failure(`${id} is retired and cannot be approved`);

    // An approval of a feature covers everything under it, so everything under it has to hold up.
    const scope = covered(model, config, el).filter((e) => a.maturity.has(e.id));
    const refusals = [];
    for (const e of scope) {
      const em = a.maturity.get(e.id);
      const who = e.id === id ? "it" : e.id;
      if (meta.rung(em.declared) > meta.rung(em.byRules)) refusals.push(`${who} claims ${em.declared} but the definition supports ${em.byRules}`);
      const errors = a.findings.filter((f) => f.element === e.id && f.sev === "error" && !f.id.startsWith("GOV-approval") && f.id !== "GOV-tier1-approval");
      if (errors.length) refusals.push(`${who} has ${plural(errors.length, "error")}: ${errors.slice(0, 3).map((f) => f.id).join(", ")}${errors.length > 3 ? ", ..." : ""}`);
      if (meta.field(e, "origin") === "skeleton") refusals.push(`${who} is a skeleton: confirm it first and set origin: human`);
    }
    if (m.declared === "stub") refusals.push("it only claims stub: there is nothing yet to approve");
    if (refusals.length && !flags.force) throw new Failure(`not approving ${id}:\n${refusals.map((r) => `  - ${r}`).join("\n")}\nFix these, or pass --force if you accept them.`);

    const date = flags.date ?? ctx.today;
    const approval = { state: "approved", by: flags.by, at: date, hash: approvalHash(model, config, el) };
    if (flags.note) approval.note = flags.note;
    let text = setFrontKey(before, "approval", stringifyYaml({ approval }, { flowMax: 240 }).trimEnd().split("\n"));
    text = setFrontKey(text, "reviewed", [`reviewed: ${date}`]);
    writeFileSync(full, text);
    ctx.invalidate();

    const bad = ctx.analysis.findings.filter((f) => f.element === id && f.id.startsWith("GOV-approval"));
    if (bad.length) {
      writeFileSync(full, before);
      ctx.invalidate();
      throw new Failure(`approval did not hold, so nothing was changed: ${bad.map((f) => f.msg).join("; ")}`, 3);
    }
    const lines = [`Approved ${id} as ${flags.by} on ${date}.`, scope.length > 1 ? `Covers ${id} and the ${scope.length - 1} elements beneath it, bound to their content (${approval.hash}).` : `Bound to its content (${approval.hash}).`, "Editing any of it afterwards shows as GOV-approval-hash until it is approved again."];
    if (refusals.length) lines.push("Approved despite:", ...refusals.map((r) => `  - ${r}`));
    ctx.out(lines.join("\n"));
    return 0;
  },
};
