// What an approval covers, what it is bound to, and which approvals policy asks for.
//
// The unit of approval is the unit of build. Approving a feature is a person
// saying "I read this specification and it is right", and the specification of
// a feature is the feature plus everything anchored beneath it: its flows,
// screens, rules, requirements and tests. So an approval of a unit type covers
// that tree and is bound to a hash of all of it. Edit any element inside and
// the approval is visibly stale; no one has to approve twenty satellites one
// by one.
//
// Every element is covered by exactly one unit: its nearest ancestor of a unit
// type, or itself when it has none. A unit covers itself and what is anchored
// beneath it that no nested unit already covers, so a capability's approval
// covers the capability and the entities and rules shared at its level, and
// each of its features is approved on its own. Domains and the product are not
// units by default: an approval of one would cover so much that every edit
// anywhere would make it stale.
import { createHash } from "node:crypto";
import { contentHash } from "./records.mjs";

/** The element types whose approval covers what is anchored beneath them. */
export const unitTypes = (config) => new Set(config.policy.approval.units);

/** The element whose approval covers `id`: the nearest unit above it, else the element itself. */
export function approvalRoot(model, config, id) {
  const units = unitTypes(config);
  for (const e of [model.get(id), ...model.ancestors(id)]) if (e && units.has(e.type)) return e;
  return model.get(id);
}

/** What an approval of `el` covers: itself and, for a unit type, what is beneath it that no nested unit covers. */
export function covered(model, config, el) {
  if (!unitTypes(config).has(el.type)) return [el];
  return [el, ...model.descendants(el.id).filter((d) => approvalRoot(model, config, d.id) === el)];
}

/** The content an approval of `el` is bound to. */
export function approvalHash(model, config, el) {
  if (!unitTypes(config).has(el.type)) return contentHash(el.rec);
  const canon = covered(model, config, el)
    .map((e) => `${e.id} ${contentHash(e.rec)}`)
    .sort()
    .join("\n");
  return "sha256:" + createHash("sha256").update(canon).digest("hex").slice(0, 16);
}

/**
 * Every approval that policy asks for, and where it stands. An approval is
 * asked for when something it would cover claims the rung where approval
 * starts to bind (policy.approval.from) and the unit is of a required tier.
 */
export function approvalUnits(a) {
  const { model, meta, maturity, config } = a;
  const { required_for_tiers: tiers, from } = config.policy.approval;
  const units = new Map();
  for (const [id, m] of maturity) {
    if (meta.rung(m.declared) < meta.rung(from)) continue;
    const root = approvalRoot(model, config, id);
    if (!tiers.includes(model.tierOf(root.id))) continue;
    if (!units.has(root.id)) units.set(root.id, { root: root.id, tier: model.tierOf(root.id), claiming: [] });
    units.get(root.id).claiming.push(id);
  }
  for (const u of units.values()) {
    const root = model.get(u.root);
    const approval = root.front.approval;
    u.approved = approval?.state === "approved";
    u.stale = u.approved && approval.hash !== approvalHash(model, config, root);
    u.covers = covered(model, config, root).filter((e) => !model.isRetired(e.id)).length;
    u.tree = unitTypes(config).has(root.type);
  }
  return [...units.values()];
}
