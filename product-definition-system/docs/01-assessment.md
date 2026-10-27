# 01. Assessment of the original proposal

The question was: *is the proposal complete, is there objective room to optimise it, and what are the gaps?* This document answers it, ranks what it found, and says where each remedy lives and how to check it.

Where it says the proposal "does not" do something, it means the proposal **as written**: a catalogue of documents, templates, checklists, techniques and advice. If your copy has a mechanism described here as absent, say so and the finding changes.

## Verdict

**As a statement of what to think about, the proposal is close to complete. As a system you can rely on, it is not, and the missing part is not more content. It is machinery.**

- It covers the right ground: zoom levels from vision to detail, the aspects of a SaaS (actors, structure, flows, data, rules, commercial, assurance), a document set, visual techniques, templates, a flow recipe, a checklist, a procedure, principles and a skill block.
- It has no way to answer *"is my definition complete?"* except opinion. Every other weakness follows from that: nothing computes coverage, nothing checks that the layers agree with each other, nothing makes an omission visible, nothing records who accepted what, nothing keeps documents and diagrams from drifting, nothing says what changes when you change something. A framework that asks the author to be disciplined will be followed exactly as long as the author is.

Three direct answers:

| Question | Answer |
|---|---|
| **Is it complete?** | Complete as a catalogue. Incomplete as a system: twelve structural gaps, four of which (F1 to F4) mean a definition built from it **cannot be trusted** however carefully it is written. |
| **Objective improvements?** | Yes, and each is measurable: coverage becomes a computed number, consistency becomes a count of failing checks, omissions become a list of unanswered probes, drift becomes a failing `views --check`. [Section 4](#4-what-was-measured). |
| **Gaps to address?** | Ranked in [section 3](#3-findings-ranked). All twelve have a remedy built and tested in this folder. [Section 7](#7-what-is-still-open) lists what is not solved. |

"Complete" needs a definition before it can be claimed. Here it is, and it is the one the tool computes: **an element is complete for its type and tier when every rule that applies at that rung passes and every concern probe that applies has a disposition. The product is complete when every element has reached the rung its tier asks for.** What no tool can establish is that the definition is *right*: that the product is the one the market wants, or that a requirement is wise. The system checks structure, coverage, consistency and honesty. It does not check truth. [Section 7](#7-what-is-still-open) says more.

## 1. What was assessed, and how

The proposal's parts, as they were pasted: zoom levels L0 to L5 with a hierarchy and a graph; six layers; a catalogue of sixteen documents; a visualisation toolkit of eight techniques; a universal nine-section element template; specialised templates (product definition, taxonomy, actor and permission, feature specification); an eight-step user-flow recipe with a touchpoint inventory; a forty-item coverage checklist; tooling advice; a nine-step operating procedure; ten principles with a definition of done; a reusable skill block; and a recommendation of five foundational artefacts.

It was read against what was asked for, in the asker's words:

> define my product completely from the highest level, into lower levels, following a structured reliable framework that provides full definition coverage … a definition element and a visualization element … a skill/recipe that allows me to describe the product or its feature in full coverage, including relations … a template that gives me a full coverage skeleton to define a SaaS at all levels.

Reading alone finds the gaps a reader can see. The rest only appear when you try to **run** the framework, so it was built: a meta-model, a tool, and a worked example of a small invoicing SaaS defined end to end ([`examples/ledgerly`](../examples/ledgerly/README.md)). Everything this document calls implemented has a command to run or a test that proves it.

**One limit on the crosswalks below.** The sixteen documents were not recoverable verbatim when this was written, so mappings are by *kind of artefact* and by *part of the proposal*, not by DOC number. Paste the list and it becomes an exact table.

## 2. What the proposal gets right, and where it lives now

None of this is discarded. It is kept, and most of it becomes checkable.

| In the proposal | Kept as | Where |
|---|---|---|
| Zoom from vision to detail | The **spine**: product, domain, capability, feature (zoom 0 to 3); the inside of a feature is zoom 4 | [02](02-architecture.md) |
| Aspects or layers of a product | **Eleven families**, each a folder: intent, actors, structure, experience, behaviour, information, commercial, realisation, assurance, operations, change | [02](02-architecture.md) |
| Hierarchy and a relation graph | `anchor` for the hierarchy; 36 typed relations for the graph, stored once | [02](02-architecture.md), [reference](reference/relations.md) |
| Templates per kind of thing | One template per element type, with the question each section must answer; `pds new` writes it | [03](03-authoring.md), [reference](reference/element-types.md) |
| User flows and touchpoints | `FLW` records with a structured `pds-flow` block; `JRN` journeys; generated flow diagram, journey map, touchpoint inventory | [05](05-views.md) |
| Actor and permission model | `ACT`, `ROLE`, `PERM`; the permission matrix is generated and checked against the flows | [05](05-views.md) |
| Visual techniques | The ones that are a function of the data are generated (maps, flows, states, ER, journeys, matrices). The ones that are design artefacts (wireframes, mock-ups, brand) cannot be generated from a definition, so a record points at them with `links` | [05](05-views.md) |
| A coverage checklist | Rules, probes and checks the tool evaluates. The *intent*, that nothing important is forgotten, is kept; the human tick is replaced | [04](04-validation.md) |
| An operating procedure | A loop driven by a queue, with three entry points: define, recover, evolve | [06](06-procedures.md) |
| Principles and a definition of done | The ones that can be enforced are checks; the definition of done is the maturity ladder, per tier | [04](04-validation.md) |
| A reusable skill block | A skill and a protocol that an agent follows, with guard rails the tool enforces | [07](07-agents.md), [`skills/pds-define`](../skills/pds-define/SKILL.md) |
| Five foundational artefacts first | What `pds init` writes and `pds next` asks for first: the product, its objectives, its actors and roles, its domains and capabilities, and the foundational open questions | [06](06-procedures.md) |
| A full-coverage skeleton | `pds init`: 99 records for the SaaS profile, honest about being prompts | [README](../README.md) |

### Against the asker's own requirements

| Requirement | The proposal | Now |
|---|---|---|
| Define completely, top to bottom | Describes the levels. Cannot say when you have arrived. | Maturity per element, computed. `pds status` gives depth by family; `pds next` gives the work. |
| Structured, reliable, full coverage | Structured: yes. Reliable: depends on discipline. Coverage: a checklist ticked by the author. | 279 coverage rules, 27 probes, 63 checks. A claim above what the content supports is an error. |
| A visualisation element | Techniques to draw. Drawn by hand, so they drift. | 21 views generated from the records. `pds views --check` fails when one is stale. |
| A recipe for a product or a feature, with relations | A skill block. Relations by convention. | Typed relations, checked. `pds ask ID` is the interview; `pds spec ID` assembles the answer into one document. |
| Works at every level | Yes, as a description. | Yes. The same record format and the same checks at every zoom. |
| A full-coverage skeleton template | Templates for each document. | An instantiated skeleton (`pds init`) that cannot pass itself off as finished. |

## 3. Findings, ranked

Severity: **S1** means a definition built this way cannot be trusted. **S2** means it decays or misleads as it ages. **S3** means it is harder to use than it needs to be.

Each finding names the remedy and the command or test that shows it.

### S1: cannot be trusted

**F1. Coverage is asserted, not computed.**
A checklist the author ticks measures the author's confidence. Nothing distinguishes "named" from "described" from "buildable" from "provable", so a product can be *done* the day every box is ticked and still be unbuildable.
*Remedy.* A four-rung ladder (`stub`, `outlined`, `specified`, `verifiable`) per element. The author declares a rung; 279 rules compute the rung the content supports; claiming more is an error (`GOV-claim`). Only types that have something to verify can reach the top rung, so "verifiable" cannot be earned vacuously.
*Check.* `pds status` shows the Ledgerly example at 181 elements: 79 stub, 4 outlined, 77 specified, 21 verifiable, with the stubs counted rather than hidden. Break one claim and `pds lint` says so ([demo below](#what-it-looks-like-when-something-is-wrong)).

**F2. The layers are never checked against each other.**
A flow names actors, screens, rules, entities, events and states. A permission matrix names roles and actions. Nothing says the flow's screen exists, that the actor in step 3 may do what step 3 does, that the state machine has a way in, that a rule is used anywhere. Documents agree on the day they are written and diverge afterwards.
*Remedy.* A typed graph, 63 coded checks in six classes (schema 14, references 5, integrity 20, quality 12, governance 9, probes 3) and 73 hand-written coverage rules that read the graph. The checks catch what only a model can: a reference to something that does not exist (with a "did you mean"), flow steps no path reaches, a flow with no failure end, a state machine with an unreachable state or a transition nothing drives, an entity that says it holds no personal data and has a personal attribute, a rule with no worked examples, hard dependencies that form a cycle. The coverage rules catch what is missing across the layers: a permission no role grants, a role no actor holds, an entity nothing creates, an event nothing emits, an entitlement no plan grants, an obligation nothing satisfies.
*Check.* Every one of the 63 checks has a test that breaks the example in exactly one way and asserts that check fires (`tools/test/checks.test.mjs`). `pds meta check` proves the reverse: every relation, rule and view is read by something.

**F3. Omissions are invisible.**
A template can only prompt for what is on it. "What happens when the payment provider is down?", "who sees another tenant's data?", "is this audited?" appear in no section, so a careful author fills every box and still ships the hole. A graph cannot find a missing node either.
*Remedy.* **Concern probes.** Twenty-seven standing questions: failure paths, first use, concurrency and duplicates, deletion and retention, audit trail, limits, accessibility, localisation, performance, observability, rollout, abuse, and, when the module is on, personal data, tenant isolation, plan gating, billing impact, dependency failure, API contract and more. Each applies to features by tier, kind and *facet*. A facet is read off the graph: a feature that touches an entity flagged as holding personal data gets the personal-data probe, and one that touches tenant-scoped data gets tenant isolation, with no one having to remember to ask. Each applicable probe needs a disposition: `addressed` (and by which elements), `na` (and why), or `deferred` (and until when). A missing disposition holds the feature below *specified*.
*Check.* `pds explain failure-paths` and [`docs/reference/probes.md`](reference/probes.md) list them. In the example, 49 of 68 applicable probes are answered; the other 19 are on features that are still only outlined, and `pds ask` lists them as the questions that stand between the feature and *specified*.

**F4. Completeness can be faked.**
A skeleton full of plausible placeholder text looks finished. A definition written by an assistant looks finished. Neither has been thought about by a person.
*Remedy.* Provenance (`origin`: human, agent, skeleton, import) and two gates that cap what an element can be computed at. A skeleton is capped at *outlined* until a person confirms it (`GATE-skeleton`). An open question marked blocking caps everything it concerns, and everything above that (`GATE-blocking-question`). Checks flag `TBD`, `TODO` and lorem ipsum in anything claiming *specified* (`QLT-placeholder`) and unmeasurable words such as "fast", "intuitive" and "seamless" in requirements and rules (`QLT-vague`). `pds status` counts unconfirmed skeleton records.
*Check.* A fresh `pds init` reports **depth 0%** with 98 unconfirmed skeleton records, not 100% for having 99 files.

### S2: decays or misleads

**F5. No governance: acceptance is not recorded and does not survive change.**
Who agreed this, when, in what state? After an edit, is the agreement still valid? The proposal has no place for the answer.
*Remedy.* Approval is a separate dimension from completeness, bound to a **content hash**, recorded by a named person from a list in `pds.yaml`. An edit under an approved element shows as stale (`GOV-approval-hash`) until it is approved again. The unit of approval is the unit of build: approving a feature covers the feature and everything anchored beneath it, so one review signs off one specification. Criticality tiers (1 to 3) say where approval is required. Agents cannot approve: with `PDS_AGENT` set, `pds approve` refuses even with `--force`.
*Check.* `tools/test/approval.test.mjs`.

**F6. No identity or evolution model.**
Documents refer to each other by title or number. Rename a feature and the references rot; split one and nothing tells you what pointed at it; delete one and the history is gone.
*Remedy.* Stable ids (`FEAT-send-invoice`, equal to the file name, never reused). Titles can change freely. `pds rename` moves the file, rewrites every reference (anchor, relations, `[[wikilinks]]`, prose), re-seals approvals that were valid before so a rename does not look like an edit, re-checks the whole definition, and changes nothing if it would introduce an error. Lifecycle (`active`, `deprecated`, `retired`) keeps history and removes retired elements from coverage.
*Check.* The `pds rename` tests in `tools/test/cli.test.mjs`, including one that proves a rename that would make the definition worse puts every file back exactly.

**F7. The same fact lives in several documents.**
A permission appears in the matrix, in the feature spec and in the flow. A catalogue of sixteen documents is a catalogue of overlapping copies, and they disagree by the second revision.
*Remedy.* One record per fact, relations stored once on one side with the inverse derived. Documents are *views*: the feature specification, the permission matrix and the traceability table are generated from the same records.
*Check.* `pds spec FEAT-send-invoice` assembles the feature and the 13 elements anchored beneath it into one document. Edit a rule and every view and specification that mentions it changes the next time they are generated.

**F8. Diagrams are drawn by hand, so they drift.**
A flow diagram is correct on the day it is drawn.
*Remedy.* 21 views generated as Markdown and Mermaid (GitHub renders them). They carry a banner, are never edited, and `pds views --check` fails when one no longer matches the records. Output is deterministic.
*Check.* `tools/test/views.test.mjs`, which also walks every relative link between generated files and fails on one that does not resolve; `npm run check` runs `pds views --check` on the example.

**F9. No impact analysis.**
"If I change this rule, what must be re-reviewed?" is the question every change raises, and it is answered from memory.
*Remedy.* `pds impact ID` walks the graph with per-relation strength. Strong links are followed two hops and weak links one; a path is as strong as its weakest edge; a change to a container does not flood the product. The output is a must-review list, a should-review list and who owns each.
*Check.* `tools/test/impact.test.mjs`, including mutation tests that fail if the weakest-edge rule is dropped.

### S3: harder than it needs to be

**F10. One size for every product and every element.**
A single template set is too heavy for a three-person product and too shallow for the payment flow.
*Remedy.* Three levels of **adoption** (core 17 element types, standard 38, full 42), nine optional **modules** (tenancy, identity, commercial, integrations, public API, compliance, back office, lifecycle messaging), and three **tiers** that set how deep each element must go in proportion to the cost of being wrong. Rules and probes that depend on something a project has not adopted go quiet instead of failing. A project can move up a level without rewriting anything.

**F11. A linear procedure for work that is a loop.**
Nine steps, once. Real definition work is a queue: write the top, find what is thin, deepen the important thing, discover a missing domain, repeat.
*Remedy.* `pds next` is the queue: breadth first (everything is outlined before anything is specified), then top down through the spine, critical before supporting. `pds ask ID` is the interview for one element. [06](06-procedures.md) has the three entry points.

**F12. No guard rails for agents.**
A skill block tells an assistant what to produce. It does not tell it what it must never do: invent a requirement to fill a section, mark its own work approved, quietly rewrite what a person signed off.
*Remedy.* A protocol ([07](07-agents.md)) and enforcement where enforcement is possible: unknowns become open questions and assumptions instead of invented requirements; `origin: agent` is recorded; approval refuses under `PDS_AGENT`; `pds next` and `pds ask` give the agent its work and its questions.

### What it looks like when something is wrong

Each of these is a real run against a scratch copy of the example, changed in one place.

A typo in a flow step's screen:

```
definition/experience/FLW-send-invoice.md
  error  REF-target  line 17  touches SCR-invoice-reviw (in the pds-flow, step review): no such element
          → did you mean SCR-invoice-review?
```

A branch that goes nowhere:

```
  error  INT-flow-shape  line 17  step check-limit: decide[0] next "sendd" is not a step
  error  INT-flow-reach  line 17  step send cannot be reached from the entry
  error  INT-flow-reach  line 17  step deliver cannot be reached from the entry
```

A claim the content does not support:

```
definition/structure/DOM-billing-and-plans.md
  error  GOV-claim     claims specified but the definition supports stub: 4 rules fail (FLD-ALL-summary, …)
  error  GOV-skeleton  is a skeleton but claims specified
          → confirm it, set origin: human, then raise the claim
```

An edit after approval:

```
definition/structure/FEAT-send-invoice.md
  error  GOV-approval-hash  or something under it was edited after it was approved
          → review the change (`git log -p` over the files under FEAT-send-invoice) and approve it again, or revert it
```

What a change touches:

```
$ pds impact RULE-invoice-total
A change to RULE-invoice-total (How an invoice total is calculated) reaches 6 elements, owned by 2 features and capabilities.

Must review (4)
  FEAT-send-invoice  Send an invoice
  FLW-send-invoice   Send an invoice
  TST-invoice-total  Invoice totals are calculated and rounded as specified
  TST-confirm-and-send  Confirming sends the invoice exactly once
Should review (2)
  CAP-invoicing       Invoicing
  OBL-tax-and-invoicing  Tax and invoicing rules
```

## 4. What was measured

| Claim | How it is measured | Result |
|---|---|---|
| Every coded check can fire | One test per check breaks the example one way | 63 of 63 |
| The model agrees with the code, both ways | `pds meta check` | passes: every relation, rule, probe, view and seed is consistent |
| Views are deterministic and current | `pds views --check` | 70 files for the example, none stale |
| Links between generated files resolve | a test walks every relative link in the example's generated files | all of them (589 when this was written) |
| The YAML subset is portable | `scripts/yaml-parity`: parse every YAML source in two parsers | 205 of 205 identical with PyYAML 6.0.3 |
| The example exercises the model | the example uses 37 of the 38 types at standard adoption (all but `API`) | lint: 0 errors, 2 warnings that name real work |
| It runs where people run it | the suite | passes on Node 20, 22, 24 and 25 |
| It scales | synthetic definitions, in-memory | 2,000 records in 77 ms, 8,000 in about 280 ms (3.5 times for 4 times the records); `pds lint` on 20,000 records in 1.3 s |

### What building it taught

Gaps that only appear when the framework is operated. Each was found by running it, fixed, and pinned by a test. They are listed because any implementation of the proposal will meet them.

| Found when | The gap it shows | Resolution |
|---|---|---|
| A feature's ER diagram and state diagram came out empty | Scoping by *containment* is wrong. A feature uses entities that live in a domain. A view must follow what is *accessed*. | Views scope by anchored **and** accessed elements |
| First impact analysis flagged half the product | Walking every relation equally is useless. | Strength per relation; containment-aware (down from a container is strong, up is weak) |
| Renaming an approved feature invalidated every approval | A rename is an identity-preserving operation, not an edit. | `pds rename` re-seals hashes; rolls back on a new error |
| Approving a single flow at a time was unusable | The unit of review is not the unit of record. | Approval units: the unit of approval is the unit of build |
| `on:` in a state transition parsed as the boolean `true` in another YAML parser | Any YAML-based template meets YAML's 1.1 and 1.2 ambiguities (`on`, `yes`, `no`, `007`, `1:30`). | A strict subset that refuses ambiguous values and keys; transitions use `trigger:`; parity-checked against PyYAML |
| Specification links broke one folder deeper | Generated documents have to compute relative links from where they are written. | Links are computed from the output location; every link is tested |
| A decision or a glossary term could be declared *verifiable* | A rung that nothing is checked at proves nothing. | Only types with a rule at the top rung can reach it |
| The maturity computation scaled with the square of the record count (8,000 records took 8.5 s against 0.56 s for 2,000) | Cost has to be tested, not assumed. | A type index and a once-per-model lookup for the blocking-question gate; a scale test fails if the ratio regresses |
| A hand-edit changed line endings in half a file | Tools that edit records must preserve the file's own conventions. | Edits keep CRLF |

## 5. Objective optimisations of the content model

Beyond mechanism, five changes to how the content is organised. Each is measurable.

1. **Separate depth from aspect.** The proposal has levels (depth) and layers (kind). A business rule is *both* deep (inside a feature) and a behaviour. Treating the two axes as one invites the question "does a rule live at L4 or in the behaviour layer?". Here the answer is both: zoom 4 *and* the behaviour family. *Measure:* every element has exactly one anchor and one family, and `pds meta check` enforces it.
2. **Documents become views.** Sixteen stored documents become records plus generated views, so each fact is written once. *Measure:* the example's 70 generated files (19 product-wide views, 46 capability specifications, 4 feature specifications and an index) contain nothing written by hand.
3. **Type-specific templates in place of one universal template.** A template that fits every element has to be written for the most general one, so for any particular type some sections do not fit (what is the success metric of a permission?). Filler is the result. Each type gets the sections that make sense for it, each with the question it answers, and a section can be limited to the tiers that need it. A universal part remains: every record carries the same envelope (id, title, summary, anchor, maturity, tier, approval, lifecycle, origin, owner). *Measure:* 42 types, 206 field, section and block rules generated from them.
4. **Breadth before depth.** Outline every domain and capability before specifying any feature. Missing domains then appear early and cheaply. *Measure:* `pds next` orders the queue this way, and the example shows all spine elements above *stub*.
5. **Effort in proportion to risk.** Not every element needs a sign-off, a runbook and an audit trail. Tiers decide. *Measure:* tier 1 is required to be approved; in the example, six elements are, and the two tier-1 elements that claim *specified* without approval produce warnings.

## 6. Content areas a SaaS definition has to cover

These are the areas easiest to under-cover in a document catalogue. Each has first-class element types and, where it matters, rules and probes that switch on with a module. They are listed so that you can check them against your own catalogue. `pds explain NAME` says what any of the rules, checks and probes named here means.

| Area | Element types | Module | What bites |
|---|---|---|---|
| Multi-tenancy and data isolation | `TEN`, `REQ`, `TST` | tenancy | probes `tenant-isolation` and `tenant-states` on features that touch tenant-scoped data |
| Identity, roles, permissions | `ACT`, `ROLE`, `PERM` | identity | `COV-PERM-granted`, `COV-ROLE-held`, `COV-ACT-role`, `COV-FEAT-permission`; probe `session-and-revocation` |
| Plans, entitlements, metering | `PLAN`, `ENTL` | commercial | `COV-ENTL-granted`, `COV-ENTL-gates`, `INT-plan-entitlements`; probes `plan-gating`, `billing-impact`, `usage-metering` |
| Legal and regulatory duties | `OBL` | compliance | `COV-OBL-satisfied`, `COV-OBL-verified` |
| Personal data and money | `ENT` fields `pii` and `monetary`; the `handles_pii` and `handles_money` facets | compliance, commercial | `INT-ent-attributes`; probe `personal-data`; probes that apply to any feature that moves money |
| Integrations and failure behaviour | `EXT`, `INT`, `API`, `EVT` | integrations, public-api | `COV-EXT-integration`, `COV-EVT-emitted`; probes `dependency-failure`, `event-delivery`, `api-contract` |
| Messages to people | `MSG` | lifecycle-comms | probe `messaging-preferences` on any feature that sends a message |
| State and lifecycle | `STM` | core | `INT-stm-shape`, `INT-stm-driven`, `COV-ENT-lifecycle` |
| Measuring and operating | `MET`, `RUN`, `SYS` | core, full | `COV-MET-source`, `COV-MET-used`; probes `observability`, `analytics`, `rollout` |
| What was decided, assumed, asked, learned | `DEC`, `ASM`, `QST`, `EVD` | core | `GATE-blocking-question`, `GOV-overdue`, `COV-ASM-evidence`, `COV-EVD-cited` |
| What ships when | `RLS` | core | `COV-FEAT-planned`, `COV-RLS-scope`, `INT-release-scope`; the `release` view |
| Staff and support surfaces | `SRF`, `ROLE` | back-office | probe `support-access` |

## 7. What is still open

An honest account, so that nothing here is mistaken for done.

**In the tool.** Not built, and none of it changes the model: baselines and diffs between releases (the `RLS` record and the content hashes are the foundation); `pds migrate` for schema changes, which will be needed the first time an element type is renamed (`pds: 1` in `pds.yaml` is the version hook); import from existing documents and trackers; a browser viewer; links from tests and code back into the definition; more than one product in one repository; localisation of the definition itself. [08 Build-out](08-buildout.md) has the roadmap.

**In what a tool can know.** It checks that a requirement is *well formed* (it uses an EARS form, names its actor, has a verification), not that it is *wise*. It checks that a probe is answered, not that the answer is good. It checks that an element has an owner, not that the owner agrees. It compares prose to a short list of vague words, and cannot read it. The checks make a bad definition hard to hide. They do not make a good one.

**In the example.** Ledgerly is invented. Its approvals are fixture data made by the maintainer to demonstrate the mechanism. Its prices, interviews and compliance notes are plausible, not advice.

**Not yet verified.** The generated Mermaid has been checked for structure by tests, and not yet rendered in a browser for visual review. See the end of [08](08-buildout.md#verification-status) for the current state.

**Decisions that are yours to make:**

1. *Who approves.* `pds.yaml` lists `approvers`. The tool cannot decide whose sign-off counts.
2. *Which tier each domain is.* The profile suggests; you know where money moves and data is exposed.
3. *Whether to run the checks in CI.* `pds lint --strict`, `pds views --check` and `pds docs --check` take about a second at normal scale, so one job per pull request would be enough. They run locally first either way. Nothing here adds a workflow.
4. *Whether to adopt the SaaS profile as is.* It is one profile among possible ones (`meta-model/profiles/`); a marketplace or an API-only product would want its own.
5. *The DOC-01 to DOC-16 list.* Paste it and the crosswalk in section 2 becomes exact.
