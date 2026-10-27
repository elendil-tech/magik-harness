// GOV: authority and freshness. Who may say a definition is right, whether
// what they approved is still what is written, and whether it has been looked
// at lately.
import { approvalHash, approvalUnits, unitTypes } from "../approval.mjs";
import { isDate } from "../shapes.mjs";

const isObj = (v) => v && typeof v === "object" && !Array.isArray(v);

function daysBetween(a, b) {
  return Math.floor((Date.parse(b + "T00:00:00Z") - Date.parse(a + "T00:00:00Z")) / 86400000);
}

export const checks = {
  "GOV-claim"(ctx) {
    const { meta } = ctx;
    ctx.each(null, (el) => {
      const m = ctx.maturity.get(el.id);
      if (!m) return;
      const declared = meta.rung(m.declared);
      if (declared <= meta.rung(m.byRules)) return;
      const failing = m.results.filter((r) => !r.pass && r.sev === "error" && meta.rung(r.from) <= declared);
      if (!failing.length) {
        // Nothing fails: the claim is above anything this element is checked for.
        ctx.report({ element: el.id, path: el.path, msg: `claims ${m.declared}, but nothing about this ${meta.spec(el.type).name.toLowerCase()} is checked at that rung, so ${m.byRules} is the most it can show`, hint: "lower the claim, or add what would verify it (a test, a verification method)" });
        return;
      }
      const shown = failing.slice(0, 4).map((r) => r.rule);
      ctx.report({
        element: el.id,
        path: el.path,
        msg: `claims ${m.declared} but the definition supports ${m.byRules}: ${failing.length === 1 ? "1 rule fails" : `${failing.length} rules fail`} (${shown.join(", ")}${failing.length > shown.length ? ", ..." : ""})`,
        hint: "write what is missing, or lower the claim",
        details: failing.map((r) => ({ rule: r.rule, from: r.from, msg: r.msg, ask: r.ask })),
      });
    });
  },

  "GOV-approval-hash"(ctx) {
    const { model, config } = ctx;
    ctx.each(null, (el) => {
      const a = el.front.approval;
      if (!isObj(a) || a.state !== "approved") return;
      if (!a.hash) ctx.report({ element: el.id, path: el.path, msg: "is marked approved without a content hash", hint: "approve it with `pds approve`, which records the hash" });
      else if (a.hash !== approvalHash(model, config, el)) {
        const tree = unitTypes(config).has(el.type);
        ctx.report({ element: el.id, path: el.path, msg: `${tree ? "or something under it " : ""}was edited after it was approved`, hint: `review the change${tree ? ` (\`git log -p\` over the files under ${el.id})` : ""} and approve it again, or revert it` });
      }
    });
  },

  "GOV-approval-authority"(ctx) {
    const approvers = ctx.config.approvers;
    ctx.each(null, (el) => {
      const a = el.front.approval;
      if (!isObj(a) || a.state !== "approved") return;
      if (!approvers.length) ctx.report({ element: el.id, path: el.path, msg: "is approved but pds.yaml lists no approvers", hint: "name the people who may approve under approvers" });
      else if (!a.by || !approvers.includes(a.by)) ctx.report({ element: el.id, path: el.path, msg: `is approved by ${a.by ? `“${a.by}”` : "nobody named"}, who is not a listed approver`, hint: `approvers: ${approvers.join(", ")}` });
      if (!isDate(a.at)) ctx.report({ element: el.id, path: el.path, msg: "is approved without a date" });
    });
  },

  // One finding per approval unit, reported on the element a person would approve. A feature
  // is approved once for everything under it; the elements under it are not asked separately.
  "GOV-tier1-approval"(ctx) {
    const { config, model } = ctx;
    const { from } = config.policy.approval;
    for (const u of approvalUnits(ctx)) {
      if (u.approved) continue; // a stale approval is GOV-approval-hash's finding, reported once
      const root = model.get(u.root);
      const own = u.claiming.length === 1 && u.claiming[0] === u.root;
      ctx.report({
        element: root.id,
        path: root.path,
        msg: own
          ? `is tier ${u.tier} and claims ${root.declared}, but nobody has approved it`
          : `is tier ${u.tier}, and it or something under it claims ${from} or better, but nobody has approved it`,
        hint: u.tree ? `one approval covers all ${u.covers} elements in it: pds approve ${root.id} --by NAME` : `pds approve ${root.id} --by NAME`,
      });
    }
  },

  "GOV-skeleton"(ctx) {
    const { meta } = ctx;
    ctx.each(null, (el) => {
      if (meta.field(el, "origin") !== "skeleton") return;
      if (meta.rung(el.declared) > meta.rung("outlined")) ctx.report({ element: el.id, path: el.path, msg: `is a skeleton but claims ${el.declared}`, hint: "confirm it, set origin: human, then raise the claim" });
      if (el.front.approval?.state === "approved") ctx.report({ element: el.id, path: el.path, msg: "is a skeleton and approved: approval means a person confirmed it" });
    });
  },

  "GOV-lifecycle-note"(ctx) {
    ctx.each(null, (el) => {
      const lc = el.front.lifecycle;
      if ((lc === "deprecated" || lc === "retired") && !(typeof el.front.lifecycle_note === "string" && el.front.lifecycle_note.trim())) {
        ctx.report({ element: el.id, path: el.path, msg: `is ${lc} with no lifecycle_note`, hint: "say why, and what replaces it" });
      }
    });
  },

  "GOV-freshness"(ctx) {
    const { meta, model, today } = ctx;
    ctx.each(null, (el) => {
      if (el.front.approval?.state !== "approved") return;
      const tier = model.tierOf(el.id);
      const cadence = meta.tiers[tier].review_every_days;
      const last = [el.front.reviewed, el.front.approval.at].find(isDate);
      if (!last) return ctx.report({ element: el.id, path: el.path, msg: "is approved but has no review date" });
      const age = daysBetween(last, today);
      if (age > cadence) ctx.report({ element: el.id, path: el.path, msg: `was last reviewed ${age} days ago; tier ${tier} is reviewed every ${cadence}`, hint: "confirm it still matches reality, then set reviewed" });
    });
  },

  "GOV-overdue"(ctx) {
    const { meta, today } = ctx;
    ctx.each("ASM", (el) => {
      const d = el.front.validate_before;
      if (meta.field(el, "status") === "open" && isDate(d) && d < today) ctx.report({ element: el.id, path: el.path, msg: `should have been settled by ${d} and is still open` });
    });
    ctx.each("QST", (el) => {
      const d = el.front.due;
      if (meta.field(el, "status") === "open" && isDate(d) && d < today) ctx.report({ element: el.id, path: el.path, msg: `was due ${d} and is still open` });
    });
  },

  "GOV-blocking-question"(ctx) {
    const { meta } = ctx;
    ctx.each(null, (el) => {
      const m = ctx.maturity.get(el.id);
      const cap = m?.caps.find((c) => c.gate === "GATE-blocking-question");
      if (cap && meta.rung(m.declared) >= meta.rung("specified")) ctx.report({ element: el.id, path: el.path, msg: `claims ${m.declared} while open blocking question${cap.by.length > 1 ? "s" : ""} remain: ${cap.by.join(", ")}`, hint: "answer it, or lower the claim" });
    });
  },
};
