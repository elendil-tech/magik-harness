# 06. Procedures

How to use the system, as procedures. There are three ways in, depending on where you start, and a rhythm for keeping a definition true once you have one.

| You have | Use | Result |
|---|---|---|
| An idea or a new product | [Define](#1-define-a-new-product) | A definition built top-down, widest first |
| A product that already exists | [Recover](#2-recover-a-product-that-already-exists) | A definition built from what is observable, with the gaps counted |
| A definition and a change | [Evolve](#3-evolve-a-defined-product) | The change, its blast radius, and the sign-off redone |

Everything runs from the command line of the tool, `node tools/pds.mjs` (written `pds` below). It needs Node 20 or later and installs nothing. Add `--root DIR` to any command to point it at a project, or run it from inside the project's folder.

## 1. Define a new product

The shape of the work: **start wide and shallow, then go deeper where it costs most to be wrong.** The tool's queue is built to enforce that order, so most of the procedure is "do what `pds next` says."

### Step 0. Decide what is in scope

One project is **one product**. Two products that share a codebase are two projects. (Multi-product is a known limit; see [the build-out](08-buildout.md#7-known-limits).) If the thing you are defining is a feature of an existing product, you are doing Evolve.

### Step 1. Start the project

```sh
pds init ledgerly --name "Ledgerly"            # the saas profile, standard adoption
pds init ledgerly --adoption core              # fewer types, to start small
pds init ledgerly --no-skeleton                # only the product record
```

This writes `pds.yaml`, the product record, and, unless told not to, a **skeleton**: a stub for each domain, capability, actor, role, surface, obligation and foundational question a SaaS product usually has. Every skeleton record says `origin: skeleton`. It is a prompt, not a decision: the tool will not let it count as defined until a person has read it.

Then open `pds.yaml` and decide three things, because they are decisions and no default is right for everyone:

1. **`approvers`**: the people who may sign off critical work. An empty list means nobody can, and the tool will say so.
2. **`adoption`**: `core` (17 types), `standard` (38) or `full` (42). Start lower than you think you need. Moving up later needs no migration: rules about types you have not adopted are ignored until you adopt them, and then they ask for what they ask for.
3. **`modules`**: which of the optional areas apply (tenancy, identity, commercial, integrations, public API, compliance, back office, lifecycle messaging). A module you leave out removes its skeleton records, its rules and its probes.

### Step 2. Go round once, widest first

Work through the queue.

```sh
pds status               # where you are
pds next                 # the next few elements, and what each lacks
pds ask DOM-billing-and-plans    # the interview for one element
pds new FEAT "Send reminders" --anchor CAP-invoicing   # a record from its template: FEAT-send-reminders
pds lint --element FEAT-send-reminders                 # check just this one
```

**The queue is breadth first.** Everything reaches `outlined` before anything is `specified`. For a new product this means roughly:

| Pass | What you are doing | In practice |
|---|---|---|
| 1. **Outline the whole** (rung: outlined) | Say what each thing is, in one sentence, everywhere | Confirm or discard each skeleton record. Write the product's purpose and objectives, the actors, the domains, and the capabilities under them. A summary and a few fields each. |
| 2. **Choose what is critical** | Assign tiers | Set `tier: 1` on the domains and capabilities where money moves, access is granted, data can be lost or exposed, a legal duty applies, or the core promise depends on it. Review the profile's guesses. |
| 3. **Specify what is critical** (rung: specified) | Make tier 1 buildable | For each tier 1 feature: its flows, screens, rules with examples, requirements, the entities it touches, the permissions it needs. Answer its concern probes. Then a person approves it. |
| 4. **Specify the rest** | Same, proportionally | Tier 2 the same way. Tier 3 only as far as it is worth. |
| 5. **Make it verifiable** (rung: verifiable) | Say how it will be proved | Tests that verify the requirements, a way to measure the objectives, the evidence behind assumptions. |

You do not have to follow the table; the tool does not enforce it. The queue just orders the work so that you find a missing domain while everything is a stub, not after fifty features are specified under the wrong one.

### Step 3. Confirm each skeleton record

For each, one of three things:

- **Keep it.** Read it, correct it, and set `origin: human`. Now it counts.
- **Replace it.** Rename it to what your product really calls this (`pds rename`), then confirm it.
- **Drop it.** If the product genuinely has no such thing, set `lifecycle: retired` with a `lifecycle_note` saying why, or delete the file. Anything anchored beneath it has to move or go too, and `pds lint` finds whatever is left pointing at it.

Dropping is a decision, and a recorded one beats a silent one. For a thing the product does not do but a reader would expect (no trial period, no refunds), a short `DEC` explains it in one paragraph.

### Step 4. Write each element

The two documents to have open: [authoring](03-authoring.md) for how, and `pds ask ID` for what. The loop for each element:

1. `pds ask ID`: what is the next rung asking for?
2. Write it. Prefer the structured block where there is one (flow steps, states, attributes), because views are drawn from them.
3. `pds lint --element ID`: did you break anything?
4. Say honestly what it now supports. Do not raise `maturity` by hand beyond what `pds ask` says is supported: the tool will call it out (`GOV-claim`).

### Step 5. Look at it

```sh
pds views            # write every view and specification
```

Open the flow diagrams, the screen map, the permission matrix and the coverage report. **This is the step that finds mistakes the text did not.** A flow with no way to fail, a permission nobody holds, a screen no flow reaches: each shows up as a hole in a picture. Fix them in the records, regenerate.

### Step 6. Approve

A person with their name in `approvers` runs:

```sh
pds approve FEAT-send-invoice --by "Dana Whitfield" --note "Reviewed with finance"
```

An approval covers the feature and everything anchored beneath it, bound to a hash of the content: edit anything and the approval goes stale, visibly. See [validation, §8](04-validation.md#8-approval).

### Done, for now

The definition is *done enough to build from* when, for the tiers you have decided matter:

- `pds lint` has **no errors**, and every warning is either fixed or a decision you can explain;
- no element **claims** more than it supports;
- **no blocking question** is open about what you are about to build (the feature, or anything inside it);
- each tier 1 unit is **approved and current**;
- tier 1 and 2 features have their **concern probes answered or waived with a reason**.

Whatever else is still `stub` is *visible*, and listed in the coverage report. That is the point: an incomplete definition that says so is more useful than one that looks complete.

### Targets by tier

A reasonable aim, to adjust. The tool does not enforce these, and `pds status` shows how far each tier has got.

| Tier | Reaches | Approval | Review |
|---|---|---|---|
| 1 · Critical | `verifiable` for features, flows, rules and requirements | a named person, and kept current | every 60 days |
| 2 · Important | `specified`; `verifiable` where it has flows or rules | optional (set in policy) | every 120 days |
| 3 · Supporting | `outlined`, or `specified` if cheap | not required | every 240 days |

## 2. Recover a product that already exists

The difference is that you are not designing; you are *discovering* what is true. So the order flips: start from what can be observed, and let the structure appear.

1. **`pds init`**, with the skeleton on. For an existing product the skeleton's value is as a checklist of what to look for.
2. **Inventory the observable things first**, each as an outlined record with one honest sentence:
   - the surfaces (web app, mobile, admin, public site, API) and the **screens** on them: the navigation menu and the sitemap are the list;
   - the **plans and what each includes**: the pricing page and the billing settings;
   - the **roles and what they can do**: the team-settings page and the permission checks in the code;
   - the **entities**: the database schema is a head start, though a table is not always an entity;
   - the **messages** the product sends, the **events** it emits, the **third parties** it calls or is called by.
3. **Group them upward.** Features come from what people use the screens for; capabilities group features; domains group capabilities. This is the structure the product *already has*. Resist improving it now. Where the structure is wrong, record that as a `DEC` or `QST` and fix it in Evolve.
4. **Write the flows by walking them.** Run the product and click through each critical one, recording what you see: the steps, the places it can fail, what the person is told. Do not write the flow from memory or from the code; people misremember, and code does not know what the person sees.
5. **Capture the rules with examples**, from the code and from the people who know why. Where code and people disagree, that is a finding: record it as a `QST`, blocking if it matters.
6. **Mark where it came from.** `origin: import` on records recovered from documents or code, `origin: agent` on records drafted by one. It changes no rule, and a reader can tell a recovered statement from a decided one.
7. **Keep the gaps.** Where you cannot find out, leave the element a `stub` or an `outlined` with a `QST`. The point of the exercise is that what is unknown becomes countable.
8. **Then approve what matters**, as in Define: critical elements need a person to confirm that the record matches reality.

There is no importer yet. It is on the [roadmap](08-buildout.md#8-roadmap); today recovery is by hand, or by an agent following [the agent protocol](07-agents.md), with a person confirming.

## 3. Evolve a defined product

A definition is only useful while it is true. Changes come in several kinds.

### A change to something that exists

```sh
pds impact FEAT-send-invoice       # before: what has to be reviewed if this changes?
# ... edit the records ...
pds lint                           # after: did it break anything?
pds views                          # refresh the pictures
pds approve FEAT-send-invoice --by "..."   # if it was approved: it is stale now
```

`pds impact` follows the relations from the element: *strong* links (this element's behaviour depends on the other) up to two hops, *weak* links one hop, and says why each element is on the list. It is the review list for a pull request, and the answer to *"what else does this touch?"*

An approval **goes stale** when anything it covers is edited (`GOV-approval-hash`). That is a reminder, not a punishment: look at what changed, and approve again.

### A new feature or capability

`pds new FEAT name --anchor CAP-x`, then Define, Step 4 onwards, for that element only. `pds next --element CAP-x` limits the queue to it and what is under it.

### Renaming

```sh
pds rename FEAT-send-invoice FEAT-issue-invoice --dry-run
pds rename FEAT-send-invoice FEAT-issue-invoice --title "Issue an invoice"
```

An id is the handle everything else points at, so a rename is one operation: the file moves, every reference (anchor, `rel`, `[[links]]`, prose) is rewritten, and approvals stay valid. If it would introduce a new error, it changes nothing. Then `pds views`.

### Retiring and replacing

Set `lifecycle: deprecated` (still in use, going away) or `retired` (gone), and write a `lifecycle_note` saying why and what replaces it; the tool asks for one (`GOV-lifecycle-note`). A retired element drops out of coverage and the views but stays in its file. If something replaces it, record `supersedes` from the new one.

### Changing your mind about a decision

Do not rewrite a decision; replace it. Write a new `DEC` with the reasons, and record `supersedes` from it to the old one. Then mark the old one `status: superseded` and `lifecycle: deprecated`, with a `lifecycle_note` pointing at the new one. The tool insists on that last step (`COH-supersedes`, `GOV-lifecycle-note`), and the old record stays as what was believed at the time.

### Releases

A `RLS` record `includes` the features in a release. `pds view release RLS-name` shows its scope and how ready each part is. It is a good moment to run the whole rhythm below.

## 4. The rhythm

| When | Do | Why |
|---|---|---|
| **Every change** | `pds lint --element ID` | catch it while it is small |
| **Every working session** | `pds status`, then `pds next` | know where you are and what is next |
| **Every pull request** | the [checks](#6-the-checks-for-a-pull-request), and `pds impact` on what changed | the diff of the definition, and of the views, is the review |
| **Every release** | `pds view release`; clear stale approvals; read the coverage report's blind spots | a release is the cheapest moment to notice drift |
| **By tier** | re-confirm each approved element: 60 / 120 / 240 days | `GOV-freshness` says when; confirm it still matches reality, then set `reviewed` |
| **Each quarter** | read the concern probes you have waived, and the `deferred` ones with an `until` | a waiver is a promise to look again |
| **When the product changes shape** | adopt a higher level or add a module in `pds.yaml` | the new rules apply at once, and the queue shows what they ask |

## 5. Who does what

| | Does | Cannot |
|---|---|---|
| **A person** | decides, confirms skeletons, assigns tiers, approves if listed | |
| **An agent** | drafts records, answers `pds ask`, runs `lint`, proposes | **approve** (`PDS_AGENT` set makes `pds approve` refuse, even with `--force`), or edit `pds.yaml` |
| **The tool** | says what is missing, what changed, what is stale | judge whether a statement is true or good |

`pds.yaml` holds the approvers, the policy and the waivers. It is **human-owned**: it is what an agent must not change on its own authority, since a waiver there silences a check. A pull request that touches it deserves a reader. A code-owners rule for that one file is a cheap way to make sure of it.

## 6. The checks for a pull request

The definition lives in git as plain files, so changing it is an ordinary change: a branch, a pull request, a review. Three commands make that review mean something. They take seconds, so run them on your own machine first and let the shared check run them once, when the pull request is ready:

- **`pds lint`** fails the check if there is any error (add `--strict` to fail on warnings too);
- **`pds views --check`** fails if the generated views no longer match the records, so a reviewer never reads a stale picture;
- for a change to the tool or the meta-model itself, **`pds docs --check`** and **`npm test`** (or `npm run check` for everything).

Keep the shared check to those. It is a milestone check, not a place to find out what is wrong, and it should not run for a change that touched no definition.

The generated views are in the diff. A reviewer who does not read the YAML can still read a flow diagram, a permission table or the coverage report, and see what the change did to them.
