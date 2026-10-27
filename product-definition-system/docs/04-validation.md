# 04. Validation

How the system decides whether a definition is complete, consistent and honest, and what it does about each. Everything here is configured by the meta-model; nothing about it is typed into this document except what to expect. Exhaustive lists of rules, probes and checks are in the generated [reference](reference/README.md).

The question *"is it complete?"* gets four different kinds of answer, from four mechanisms:

| Mechanism | Asks | Produces |
|---|---|---|
| **Coverage rules** | Does this element say what an element of its type has to say, at this rung? | A **computed maturity** per element |
| **Concern probes** | Has the author considered what is easy to forget? | A **disposition** per applicable probe, which feeds a coverage rule |
| **Gates** | Is something unresolved that makes the rest untrustworthy? | A **cap** on computed maturity |
| **Checks** | Is what is written consistent, well formed and honest? | **Findings**: errors, warnings, notes |

## 1. The ladder

| Rung | Meaning |
|---|---|
| `stub` | Named and placed on the spine. Its purpose is not yet stated. |
| `outlined` | Purpose, scope and the main relations are stated. A reader can tell what it is for and where it sits. |
| `specified` | Complete enough to build from: every field, section and relation required for its type and tier is present, applicable probes are dispositioned and nothing blocking is open. |
| `verifiable` | Specified, and every requirement, rule and flow has a defined way to prove it: acceptance tests, or an explicit non-test method. |

Maturity describes **the definition**, not the delivery. A feature can be `verifiable` and unbuilt, or built and `stub`.

**Declared and computed.** The author writes the rung they claim (`maturity:`). The tool computes the rung the content supports. The computed rung is the highest rung for which every error-severity rule at that rung and below holds, and then it is capped by the gates and by a ceiling. A claim above the computed rung is an error, and three checks between them see every case. `GOV-claim` fires when the rules do not support the claim, and names every rule failing. `GOV-skeleton` and `GOV-blocking-question` fire when the rules would support it and a gate caps it. A claim below the computed rung is allowed: you may be conservative.

**The ceiling.** A rung that nothing is checked at proves nothing. So only a type that has a rule at the top rung can be computed `verifiable`: features, flows, requirements, rules, state machines and obligations, each of which has a rule that asks for a test or an explicit way to prove it. A decision, a glossary term or a persona has nothing to verify, and tops out at `specified`.

**Why four rungs and not a percentage.** A percentage invites averaging a finished payment feature with forty stubs and calling the product 60 % done. The rungs say what an element *is*, and `pds status` counts elements at each, so the stubs stay visible.

## 2. Coverage rules

A rule says which elements it applies to and what must hold of them.

```
$ pds explain COV-FEAT-flow
COV-FEAT-flow  (coverage rule)

Applies to: type FEAT · from specified · tiers 1, 2
Severity:   error
Requires:
  children: {type: FLW, min: 1}
When it fails: has no flow
What to do:
  Walk through the feature as the person or system using it: what starts it, which steps and
  decisions follow, how does it end well and how does it end badly?
```

- **Applies to:** a type (or several), the rung it belongs to (`from`), and optionally the tiers, a module, a `where` or `unless` condition on the element's own fields, the type of its anchor, and (for features) facets.
- **Requires:** one atom, or `all` / `any` / `not` over atoms. An atom is a field present or equal to something, a section present, a block present, a facet, an outgoing or incoming relation with a minimum (and maybe maximum) number of live targets of given types, or children of a type. A relation atom can look at the element alone, its children, or everything beneath it. A section counts as written once it has at least three words, so a bare heading or a lone "TBD" does not satisfy it.
- **Quiet when not adopted.** An atom that only talks about types the project has not adopted is inactive and ignored, and a rule whose whole requirement is inactive does not apply. That is how one rule set serves every adoption level.
- **Severity:** `error` (the default) holds the rung back. `warn` never holds a rung back; it is reported as a warning once the element claims the rung it belongs to. `info` is a suggestion that appears in the queue when it comes due.
- **What to do** is the question `pds ask` puts to the author.

There are two sorts.

- **73 written by hand** (`COV-…`): the cross-element rules. A feature has a flow; a role grants a permission; a permission is granted by a role; an entity is created by something; an event is emitted; an entitlement is granted by a plan and gates something; an obligation is satisfied by something and, for the top rung, verified by something; a critical feature has a risk recorded.
- **206 generated** from the element types (`FLD-…`, `SEC-…`, `BLK-…`): a field required at a rung, a section required at a rung, a structured block required at a rung. They come from `required_at` and `ask` in `element-types.yaml`, so adding a field to a type adds its rule.

`pds ask ID` prints, rung by rung, every rule the element fails, with the question for each. `--all` shows every rung, not only the next.

```
$ pds ask FEAT-draft-invoice
FEAT-draft-invoice · Draft an invoice · Feature
supports outlined · tier 1 · origin human
under Ledgerly › Invoicing and clients › Invoicing

To reach specified
  1. has no flow  (COV-FEAT-flow)
     Walk through the feature as the person or system using it: what starts it, which steps and
     decisions follow, how does it end well and how does it end badly?
  2. has no requirement  (COV-FEAT-requirement)
  …
```

## 3. Probes

A **concern probe** is a standing question that is easy to forget and expensive to forget late. The 27 in the model are the reference of what a SaaS feature should have thought about: failure paths, first use and the empty state, concurrency and duplicates, deletion and retention, audit trail, limits and quotas, lists and bulk actions, import and export, accessibility, localisation, performance, observability, rollout, analytics, abuse, and, by module, personal data, tenant isolation, tenant states, sessions and revoked access, plan gating, billing impact, usage metering, dependency failure, event delivery, API contract, support access, and message preferences.

**When one applies** to a feature is data (`pds explain PROBE`):

```
$ pds explain personal-data
personal-data  (concern probe: Personal data)

Applies to: features, tiers 1, 2, 3; facets handles_pii · module compliance
The question:
  Why is the data collected and on which basis? Is it the minimum needed? Can the person see,
  correct, export and erase it, and how long is it kept?
```

- by **tier** (by default only tiers 1 and 2; a tier-3 feature is not asked unless the probe says so);
- by **kind** of feature (`user_facing`, `background`, `admin`, `integration`);
- by **facet**: all of `facet`, any of `any_facet`, none of `not_facet`;
- by **module**: a probe in a module that the project has not switched on is not asked.

**Facets** are what make this automatic. A facet is a yes/no characteristic of a feature, **derived from the graph** where possible: a feature that has a screen has `has_ui`; one that creates, updates or deletes an entity has `writes_data`; one that accesses an entity flagged `pii: true` has `handles_pii`; `monetary: true` gives `handles_money`; `tenant_scoped: true` gives `tenant_data`; an entity with a lifecycle or a state machine gives `stateful`; a dependency on an external system or integration gives `external_dependency`; a message gives `sends_messages`. Three cannot be derived and are declared (`async`, `user_content`, `public`). The scope of a feature is the feature plus what is anchored directly on it.

**Dispositions.** Each applicable probe needs one, on the feature, under `probes`:

```yaml
probes:
  concurrency: {addressed: [RULE-invoice-number-sequence, FLW-send-invoice]}
  lists: {na: "Sending acts on one invoice from its own review screen."}
  audit: {deferred: "The first release keeps state and dates but no log of who did what.", until: QST-audit-log}
```

A missing disposition is an error-severity rule (`PRB-<probe>`) at `specified`: **the feature cannot be computed as specified until it is dispositioned.** A disposition has to be well formed (`PRB-disposition`), `addressed` has to point at existing elements of the types the probe accepts (`PRB-addressed`), and the probe has to exist (`PRB-unknown`).

**What probes are not.** A probe cannot judge the answer. `na` with a reason of five characters passes the tool and fails a review. The value is that omission becomes an explicit, signed, searchable statement ("we decided audit is out for the first release, until this question is answered") instead of a silence. Review `na` and `deferred` dispositions the way you review an exception.

A project can switch a probe off, with a reason ([§7](#7-waivers)).

## 4. Gates

A gate caps what an element can be computed at, whatever else is true of it.

| Gate | Caps at | When |
|---|---|---|
| `GATE-skeleton` | `outlined` | The element's `origin` is `skeleton`: a starting point nobody has confirmed. To lift it a person reads it, corrects it and sets `origin: human`. |
| `GATE-blocking-question` | `outlined` | An open question with `blocking: true` concerns the element, or anything anchored beneath it. So a question reaches what it concerns and every element above that on the spine (a parent is not specified while something inside it is in question), and not what is anchored beneath what it concerns. Answer it (or decide it does not block) to lift it. |
| `GATE-retired` | none | A retired element is excluded from coverage and from the queue. |

A gate is why `pds init` can write 99 records and still report 0 % depth: the skeleton is capped, and cannot be argued above it by writing prose into it.

## 5. Checks

63 coded checks, in six classes. Each is declared in `rules.yaml` with a severity and a sentence of explanation; `pds explain ID` prints it.

| Class | Count | Is about | Examples |
|---|---|---|---|
| **SCH** schema | 14 | Is the record well formed? | `SCH-frontmatter` parses; `SCH-id-file` file is named after the id and in its family's folder; `SCH-field-type` values match their type; `SCH-anchor` the anchor exists and may hold this type; `SCH-rel-pair` a relation connects types it allows; `SCH-block` a block parses |
| **REF** references | 5 | Does every pointer land? | `REF-target`; `REF-mention` for `[[ID]]`; `REF-anchor-cycle`; `REF-retired`; `REF-depth` |
| **COH** coherence | 20 | Does the model make sense in itself? | the flow, state-machine, entity, journey, plan, rule, screen, facet, role, dependency, supersession, release and tier checks listed in [03](03-authoring.md) |
| **QLT** quality | 12 | Is it written well enough to use? | requirement form, measurability, one obligation per requirement; vague words; placeholders; gherkin order; glossary terms to avoid; near-duplicate titles; summaries that repeat the title |
| **GOV** governance | 9 | Is it honest and accepted? | `GOV-claim`, `GOV-skeleton`, `GOV-approval-hash`, `GOV-approval-authority`, `GOV-tier1-approval`, `GOV-freshness`, `GOV-overdue`, `GOV-blocking-question`, `GOV-lifecycle-note` |
| **PRB** probes | 3 | Is each disposition real? | `PRB-disposition`, `PRB-addressed`, `PRB-unknown` |

**Severities.** `error` means the definition is wrong or dishonest and must be fixed. `warn` means work is owed (an approval not given, a review overdue, a rule that is advisory). `info` is shown only with `--verbose`. Retired elements are skipped by every check except schema and references. A check can be limited to elements that claim a rung: a quality check on a stub would be noise.

```
$ pds lint
definition/structure/CAP-collect-payments.md
  warn   GOV-tier1-approval  is tier 1, and it or something under it claims specified or better, but nobody has approved it
          → one approval covers all 12 elements in it: pds approve CAP-collect-payments --by NAME

0 errors, 2 warnings
181 elements: 79 stub · 4 outlined · 77 specified · 21 verifiable
```

`pds lint` exits `1` on any error, and with `--strict` on any warning. `--json` gives the same findings for a machine, `--element ID` narrows to one element, `--verbose` adds notes. `pds status`, `pds next` and `pds ask` report and exit `0` however much is wrong: only `lint` fails on findings.

Two checks read today's date, `GOV-freshness` and `GOV-overdue`, and the model marks them `calendar: true`. `--today DATE` (or `PDS_TODAY`) pins the date for a repeatable run, which is what the tests do. The generated views leave the findings of those two out, so that they are the same on any day ([05 §6](05-views.md#6-rules-the-generator-follows)).

Every check is covered by a test that breaks the example in exactly one way and asserts that check fires, and a helper refuses to assert on a code that does not exist, so a test cannot pass by naming a check that was renamed away.

## 6. Tiers

A **tier** says how deep an element has to go in proportion to the cost of being wrong, and it is how effort is rationed.

| Tier | Name | Test | Review every |
|---|---|---|---|
| 1 | Critical | Money moves, access is granted, data can be lost or exposed, a legal duty applies, or the core promise of the product depends on it. | 60 days |
| 2 | Important | A common workflow, or a visible part of the core experience. | 120 days |
| 3 | Supporting | Low risk, easy to reverse, or cosmetic. | 240 days |

A tier is set on an element and **inherited down the anchor chain** when absent. The default is 2. A child cannot be more critical than what it sits under (`COH-tier-order`). The tier decides:

- **which probes apply** (tier 3 features are not asked the default probes);
- **which sections and rules apply** (a rule or section can be limited to some tiers; a runbook-style "release and maintenance" section is for tiers 1 and 2);
- **whether approval is required** (default: tier 1);
- **how long an approval stays fresh** (`GOV-freshness` warns when `reviewed` is older than the tier's period);
- **which order the queue works in**, critical before supporting.

**Assigning tiers is a human judgement** and the one the tool cannot make: it does not know where your money moves. The `saas` profile pre-assigns tier 1 to the five domains where it usually does (identity and access, workspaces and teams, the core product, billing and plans, trust, privacy and compliance). Review them.

## 7. Waivers

A project may waive a **coverage rule** or an **advisory check** (warning or note), with a reason, and may switch a **probe** off, with a reason. It may not waive an error-level check: those are what keep a definition consistent and honest.

```yaml
# pds.yaml
rules:
  disable:
    - {id: COV-FEAT-screen, reason: "This product is API-only; there are no screens."}
probes:
  disable:
    - {id: localisation, reason: "English only until the 2027 expansion."}
```

A waiver needs a reason of at least a short sentence, must name something that exists, and is validated every time `pds.yaml` is read (`SCH-project`). Waivers are visible in the project file, in version control, and are one place to look when a definition looks suspiciously complete.

## 8. Approval

**Approval is authority**, separate from completeness. It says a named person read this and accepted it, and it is bound to what they read.

```
$ pds approve FEAT-pay-invoice-online --by "Dana Whitfield" --note "Reviewed with payments lead"
Approved FEAT-pay-invoice-online as Dana Whitfield on 2026-10-27.
Covers FEAT-pay-invoice-online and the 15 elements beneath it, bound to their content (sha256:fa602dc38da72a99).
Editing any of it afterwards shows as GOV-approval-hash until it is approved again.
```

- **The unit is the unit of build.** A feature's approval covers the feature and everything anchored beneath it that no nested unit covers. One review signs off one specification. Which types are units is `policy.approval.units` (default `CAP`, `FEAT`).
- **It is bound to a hash of content.** Edit anything inside the unit and `GOV-approval-hash` reports it until the unit is approved again. `pds impact` says what else to look at.
- **Only listed people.** `approvers` in `pds.yaml` is the list. `pds approve` refuses a name not on it.
- **Agents cannot.** With `PDS_AGENT` set, `pds approve` refuses outright, even with `--force`. The environment is the tripwire for an agent that has been told what it may not do and would do it anyway.
- **It refuses to approve a dishonest unit.** Anything in the unit that claims more than it supports, has errors, or is a skeleton blocks the approval unless `--force` is given, and the reasons are still printed. A stub has nothing to approve.
- **`--revoke` returns the element to draft.**
- **When it is required** is policy: `required_for_tiers` (default `[1]`) from the rung `from` (default `specified`). A critical element that claims `specified` and has no approval is `GOV-tier1-approval`, a warning, because the work is owed rather than wrong.

```
$ pds approve FEAT-pay-invoice-online --by "Sam Ortiz"
pds: Sam Ortiz is not a listed approver (Dana Whitfield)

$ PDS_AGENT=1 pds approve FEAT-pay-invoice-online --by "Dana Whitfield" --force
pds: approval was refused because PDS_AGENT is set. It records that a person read and accepted the element: agents propose, people approve.

$ pds approve DOM-billing-and-plans --by "Dana Whitfield"
pds: not approving DOM-billing-and-plans:
  - it is a skeleton: confirm it first and set origin: human
  - it only claims stub: there is nothing yet to approve
Fix these, or pass --force if you accept them.
```

## 9. Reading the output

**`pds status`** is the dashboard: elements by maturity, depth by family and by tier, findings, what needs attention, and the next few things to do. *Depth* is the average **computed** rung as a share of the top rung (stub counts 0, outlined a third, specified two thirds, verifiable all of it), so a skeleton that has not been confirmed counts as the stub it is, whatever it claims. It is a gauge for direction, not a target: the rungs and their counts are the information, and `pds status` prints both. An excerpt from the worked example (the lines between are the depth of each family):

```
181 elements · depth 41% █████░░░░░░░
  stub 79 · outlined 4 · specified 77 · verifiable 21

  Tier 1 · Critical   90  53% ████░░░░
  Tier 2 · Important  91  28% ██░░░░░░

Findings: 0 errors, 2 warnings

Needs attention
  - 79 unconfirmed skeleton elements: prompts nobody has confirmed yet
  - 2 approvals not yet given: critical work that claims specified or better has no person's sign-off
  - 49 of 68 applicable concern probes answered
```

**`pds next`** is the queue. It climbs the ladder **breadth first**: everything is outlined before anything is specified. Within a rung it goes **top-down** through the spine (product, domains, capabilities, features, then the satellites), then critical before supporting, then by id. For each element it lists the gates first (they explain why nothing else can move), then the rules that stand in the way of the **next** rung, each with the question that gets it written. `--element ID` limits it to an element and what is beneath it; `--json` is for an agent.

Why breadth first: a missing domain discovered after fifty features are specified is expensive. A missing domain discovered while everything is outlined is a new stub.

**`pds ask ID`** is the same list for one element, with `--all` for every rung. It is the interview a person or an agent works through.

## 10. What validation cannot do

Said plainly, so it is not mistaken for something it is not.

- It checks that a requirement is well formed, not that it is a good requirement; that a probe is answered, not that the answer is sound; that an element has an owner, not that the owner agrees.
- Vague-word and placeholder checks are lists of words. They catch the lazy cases. They cannot read.
- A skeleton confirmed without being read is a skeleton confirmed. `origin: human` is a statement by a person, as is an approval. The tool makes those statements visible, attributable and dated; it cannot make them true.
- Tier assignment and the list of approvers are judgements the tool takes as given.
- A definition can be complete, consistent and wrong. Evidence (`EVD`), assumptions (`ASM`) with dates to validate, and decisions (`DEC`) with alternatives exist so that "wrong" is at least visible; they do not remove it.
