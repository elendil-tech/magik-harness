// Commands that write to the definition: start a project, add a record, record an approval.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, dirname, join, resolve, relative } from "node:path";
import { Failure, UsageError, closest } from "../errors.mjs";
import { plural } from "../format.mjs";
import { CONFIG_FILE, resolveConfig } from "../project.mjs";
import { expandSeeds, slugify } from "../seed.mjs";
import { renderRecord, pathFor } from "../templates.mjs";
import { setFrontKey, removeFrontKey } from "../edit.mjs";
import { contentHash, ID_RE } from "../records.mjs";
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
    const shown = relative(ctx.cwd, dir) || ".";
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
    let title = ctx.flags.title;
    if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(name)) {
      slug = slugify(name);
      title ??= name.trim();
      if (!slug) throw new UsageError(`cannot make an id from "${name}": use letters and digits`);
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
      if (candidates.length === 1) anchor = candidates[0].id;
      else throw new UsageError(`a ${type} lives under ${spec.anchors.join(" or ")}, and ${candidates.length ? "there are several" : "there are none yet"}. Pass --anchor${candidates.length ? ` with one of: ${candidates.slice(0, 8).map((c) => c.id).join(", ")}${candidates.length > 8 ? ", ..." : ""}` : ""}`);
    }
    const fields = ctx.flags.summary ? { summary: ctx.flags.summary } : undefined;
    const rel = pathFor(meta, config, id);
    writeNew(ctx.root, rel, renderRecord(meta, type, { id, title: title ?? humanise(slug), anchor, fields }));
    ctx.invalidate();
    ctx.out([`Created ${rel}`, `Next: fill it in, then \`pds ask ${id}\` for what it still needs.`].join("\n"));
    return 0;
  },
};

// -------------------------------------------------------------------- approve

export const approve = {
  summary: "Record that a person read and accepted an element",
  usage: "approve ID --by NAME [--note TEXT] [--force] | approve ID --revoke",
  help: "Approval is bound to the element's content: the hash of what was approved is stored with it, and any later edit shows as GOV-approval-hash until it is approved again. Refuses an element that claims more than it supports, that has errors, or that is a skeleton, unless --force. Only people listed under approvers in pds.yaml may approve. Refused outright when PDS_AGENT is set: agents propose, people approve.",
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

    const refusals = [];
    if (meta.rung(m.declared) > meta.rung(m.byRules)) refusals.push(`it claims ${m.declared} but the definition supports ${m.byRules}`);
    const errors = a.findings.filter((f) => f.element === id && f.sev === "error" && !f.id.startsWith("GOV-approval") && f.id !== "GOV-tier1-approval");
    if (errors.length) refusals.push(`${plural(errors.length, "error")} on it: ${errors.slice(0, 3).map((f) => f.id).join(", ")}${errors.length > 3 ? ", ..." : ""}`);
    if (meta.field(el, "origin") === "skeleton") refusals.push("it is a skeleton: confirm it first and set origin: human");
    if (m.declared === "stub") refusals.push("it only claims stub: there is nothing yet to approve");
    if (refusals.length && !flags.force) throw new Failure(`not approving ${id}:\n${refusals.map((r) => `  - ${r}`).join("\n")}\nFix these, or pass --force if you accept them.`);

    const date = flags.date ?? ctx.today;
    const approval = { state: "approved", by: flags.by, at: date, hash: contentHash(el.rec) };
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
    const lines = [`Approved ${id} as ${flags.by} on ${date}.`, `Bound to its content (${approval.hash}); editing it afterwards shows as GOV-approval-hash until it is approved again.`];
    if (refusals.length) lines.push("Approved despite:", ...refusals.map((r) => `  - ${r}`));
    ctx.out(lines.join("\n"));
    return 0;
  },
};
