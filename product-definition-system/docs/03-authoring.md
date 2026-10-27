# 03. Authoring

How to write records the tool can read, check and draw. The model behind them is in [02](02-architecture.md); what the tool will say about them is in [04](04-validation.md). The exact fields, sections and blocks of each type are in the generated [element-types reference](reference/element-types.md), and `pds explain TYPE` prints one at the terminal.

## 1. The working loop

```sh
pds new FEAT "Send payment reminders" --anchor CAP-invoicing   # a record from its template
$EDITOR definition/structure/FEAT-send-payment-reminders.md    # write under the headings
pds lint --element FEAT-send-payment-reminders                 # what is wrong with it now
pds ask FEAT-send-payment-reminders                            # what it needs to reach the next rung
```

A new record is written at `stub` with a heading for every section it will need, the question each must answer as a comment, and a comment listing the frontmatter still to fill in, by the rung that needs it:

```
---
id: FEAT-send-payment-reminders
title: Send payment reminders
anchor: CAP-invoicing
maturity: stub

# Still to fill in, by the rung that needs it:
# summary: text   (outlined)
# kind: user_facing | background | admin | integration   (outlined)
# tier: 1 | 2 | 3   (outlined)
# owner: text   (specified)
# facets: Yes/no characteristics that decide which probes apply.   (specified)
---

## Purpose and value

<!-- Which user problem does this solve, what outcome should it achieve, what is the business value, and what is explicitly out of scope? [needed for outlined] -->
```

Comments are ignored by the tool, so delete them as you go. `pds new` infers the anchor when only one is possible and otherwise lists the candidates. Nothing about the templates is hand-written per type: they are generated from `element-types.yaml`.

## 2. Files and folders

```
my-product/
  pds.yaml                      the project: name, profile, adoption, modules, approvers, policy, waivers
  definition/
    intent/PROD-my-product.md
    actors/ROLE-owner.md
    structure/FEAT-send-invoice.md
    ...                         one folder per family; one file per element
  views/                        generated; never edited
```

- **One element, one file**, in the folder of its family (`SCH-id-file` checks this). A file named `README.md` or starting with `_` is ignored, so a family folder can have a note.
- The `definition/` and `views/` folder names can be changed in `pds.yaml` (`definition_dir`, `views_dir`).
- One record per file keeps diffs small and merges clean.

## 3. Ids

`TYPE-slug`: a known type prefix (2 to 5 capitals), a hyphen, and a lowercase kebab slug of letters and digits (`FEAT-send-invoice`, `RULE-invoice-total`). The id **equals the file name**.

- The slug is a **mnemonic frozen at creation**. It never has to follow later changes of title, so you can rename a feature on a whim and nothing breaks. Choose a slug that means something, not a number.
- Ids are never reused. Retire an element rather than deleting it ([§12](#12-changing-things)).
- Ids are ASCII (titles and prose are not limited; see [08](08-buildout.md#known-limits)).
- If you must change one, use `pds rename OLD NEW`. Never find-and-replace: the command rewrites every reference in every record (anchor, `rel`, `[[wikilinks]]`, prose), re-seals approvals that were valid so the rename does not look like an edit, re-checks everything, and changes nothing if it would introduce an error.

## 4. The frontmatter

Every record carries the **envelope**. A type adds its own fields (listed per type in the reference). The rung beside each field is when it becomes required; before that it is optional.

| Key | Required from | Meaning |
|---|---|---|
| `id` | stub | `TYPE-slug`, equal to the file name |
| `title` | stub | The human name. At most 80 characters, no trailing full stop. Free to change. |
| `anchor` | stub | The one element this lives under. Everything but the product has exactly one. |
| `maturity` | stub | The rung you claim. The rules compute the rung the content supports; claiming more is an error. |
| `summary` | outlined | One sentence, at most 200 characters, on one line. It appears in tables and cards, so it has to say more than the title does. |
| `tier` | | 1 critical, 2 important, 3 supporting. Inherited from the anchor chain when absent. A child cannot be more critical than its parent. |
| `owner` | | The person or team accountable for keeping it true. |
| `approval` | | Written by `pds approve`, never by hand. |
| `lifecycle` | | `active` (default), `deprecated`, `retired`. Not active needs `lifecycle_note`: why, and what replaces it. |
| `origin` | | `human` (default), `agent`, `skeleton`, `import`. |
| `reviewed` | | The last date a human confirmed it still matches reality. Tiers set how long that may be (60, 120 or 240 days). |
| `links` | | References to things **outside** the definition: designs, tickets, code, contracts. |
| `rel` | | Typed relations to other elements ([§6](#6-relations)). |
| `tags`, `aliases` | | Free labels; other names it has been known by. Use tags sparingly: structure belongs in relations. |

Dates are `YYYY-MM-DD`. Frontmatter keys the type does not define are an error (`SCH-envelope`), so a typo in a key is caught rather than silently ignored.

## 5. The body

The body is Markdown with `##` headings. A type says which headings it needs, from which rung, for which tiers, and the question each answers. A heading may appear once (`SCH-section`). Write facts a reader can act on; delete the comment once it is answered.

**What to write.** The sections ask for things like *what must already be true when this is reached*, *what happens that the flows and rules do not already say* (concurrency, duplicate requests, partial completion), and *how it is switched off*. They do not ask for marketing. If you cannot answer, do not write a plausible answer: write an open question ([§11](#11-saying-what-you-do-not-know)).

**Style that the checks enforce.**

- Requirements, rules and definitions avoid unmeasurable words: *fast, easy, intuitive, robust, seamless, user-friendly, flexible, scalable, appropriate* (`QLT-vague`). Say how fast, for whom, under what load.
- Nothing that claims *specified* contains `TBD`, `TODO`, `XXX`, lorem ipsum or an unfilled `<placeholder>` (`QLT-placeholder`).
- Use the glossary. A `TERM` can list words to avoid, and prose that uses one is flagged (`QLT-term-avoid`).
- Two siblings of one type with near-identical titles are flagged as probable duplicates (`QLT-duplicate`).

## 6. Relations

Hierarchy is `anchor`. Everything else is a typed relation, written **once, on the element it leaves**, under `rel`:

```yaml
rel:
  audience: [ACT-account-owner]
  requires: [PERM-send-invoice]
  governed_by: [RULE-invoice-total, RULE-invoice-number-sequence]
  gated_by: [ENTL-monthly-invoices]
  depends_on: [INT-email-sending]
  emits: [EVT-invoice-sent]
  accesses:
    - {to: ENT-invoice, ops: [create, read, update]}
    - ENT-client
```

- The **inverse** (`served_by`, `touched_by`, ...) is derived. Writing one is an error that points at the other side (`SCH-rel-key`).
- A relation may only connect the types its definition allows (`SCH-rel-pair`). `pds explain RELATION` shows them, and the [reference](reference/relations.md) lists all 36.
- A relation target must exist and be of an allowed type (`REF-target`). When it does not, the finding says what it thinks you meant.
- **A fact in a structured block is not also written under `rel`.** A flow step that names `at: SCR-invoice-review` already means the flow `touches` the screen. Writing it twice would create the copy that later disagrees.
- An active element should not depend on a retired one, except to record history (`supersedes`, `concerns`, `evidenced_by`) (`REF-retired`).

**Wikilinks.** `[[FEAT-send-invoice]]` or `[[FEAT-send-invoice|the send feature]]` in prose is a `mentions` relation. It must name an existing element (`REF-mention`). Use a wikilink to point a reader at something; use `rel` for a fact the model depends on (this feature *requires* that permission).

## 7. Structured blocks

Where content has to be machine-readable (a flow's steps, a state machine's transitions, an entity's attributes) it is written as a fenced block with a recognised name. Everything around the block stays prose. A block that does not parse, or lacks a key its type requires, is an error (`SCH-block`).

### `pds-flow`, in a flow (`FLW`)

```pds-flow
trigger: The owner chooses Send on a finished draft
entry: review
steps:
  - id: review
    actor: ACT-account-owner
    at: SCR-invoice-review
    does: Checks the recipient, the totals and the due date, then confirms
    uses: [RULE-invoice-total]
    decide:
      - {when: The owner confirms, next: check-limit}
      - {when: The owner goes back to edit, next: cancelled}
  - id: send
    does: The system takes the next invoice number, marks the invoice sent and queues the email, in one transaction
    uses: [RULE-invoice-number-sequence]
    accesses: {ENT-invoice: [update]}
    moves: {STM-invoice-lifecycle: ["draft->sent"]}
    emits: [EVT-invoice-sent]
    next: deliver
  - id: done
    does: The owner sees the invoice as sent
    end: success
```

Each step has an `id` and exactly one of `next`, `decide` (a list of `when` and `next`), `end` (`success`, `failure` or `abort`) or `call` (another flow). Optionally: `does` (what happens, in a sentence), `actor` (an actor, role or persona), `at` (the touchpoint: a screen, message, surface, API or external system), `uses` (rules, integrations, APIs), `accesses` (entities, each with operations from `create`, `read`, `update`, `delete`), `moves` (a state-machine transition, written `"from->to"`) and `emits` (events). The tool derives from this the relations `audience`, `touches`, `governed_by`, `depends_on`, `accesses`, `drives` and `emits`, draws the flow, and checks it:

- ids are unique, every `next` exists, and the entry exists (`INT-flow-shape`);
- every step is reachable from the entry and every path reaches an end (`INT-flow-reach`);
- a flow of an important or critical feature has a success end and a failure or abort end (`INT-flow-ends`);
- every actor, screen, rule, entity, event and transition named exists and has the right type, and `moves` names a real transition (`INT-flow-refs`);
- no more than 25 steps; split longer flows into called flows (`INT-flow-size`).

### `pds-states`, in a state machine (`STM`)

```pds-states
states:
  - {id: draft, label: Draft, kind: initial, note: Being written; the client cannot see it}
  - {id: sent, label: Sent}
  - {id: paid, label: Paid, kind: terminal}
transitions:
  - {from: draft, to: sent, trigger: The owner sends it, by: ACT-account-owner, guard: [RULE-invoice-number-sequence], emits: [EVT-invoice-sent]}
  - {from: sent, to: paid, trigger: A payment brings the balance to zero, by: system}
```

Exactly one `initial` state; every transition names defined states; a terminal state has no way out; every state is reachable (`INT-stm-shape`). Every transition says who or what causes it (`by`): `system`, or an actor. One caused by an actor must be moved by at least one flow step, through `moves` (`INT-stm-driven`), so a state machine cannot describe a transition that nothing in the product ever performs. `trigger` says in words what causes the move. The key is `trigger`, not `on`; see [§13](#13-the-yaml-subset).

### `pds-attributes`, in an entity (`ENT`)

```pds-attributes
attributes:
  - {name: id, type: id, required: true, unique: true}
  - {name: client_email, type: email, required: true, pii: true, note: Copied from the client when sent}
  - {name: total, type: money, required: true, note: Computed from the lines}
associations:
  - {to: ENT-client, kind: many_to_one, label: billed to}
```

Names are unique and associations point at entities. An entity whose fields say it holds no personal data cannot have a personal attribute, and one that does hold personal data must be classified `confidential` or higher (`INT-ent-attributes`). The entity's own flags (`pii`, `monetary`, `tenant_scoped`, `has_lifecycle`) are what derive a feature's facets and so which probes apply.

### `pds-journey`, in a journey (`JRN`)

A list of stages, each with `id`, `name`, `goal`, `actions`, the `flows` it spans, the `touchpoints` involved (screens, messages, surfaces), a `feeling` from 1 to 5, and a `pain` and `opportunity`. The journey map is drawn from it, and `feeling` is plotted as the score of the stage (1 the worst moment, 5 the best). Stage ids are unique, and the flows and touchpoints named exist (`INT-journey`).

### `pds-payload`, in an event (`EVT`)

A list of `fields` with `name`, `type`, `required` and `pii`. An event that says it carries no personal data cannot have a personal field (`INT-payload`).

### `gherkin`, in a test (`TST`)

Kept as text: a `Feature:` with scenarios, each `Given`, `When`, `Then` in that order, none empty (`QLT-gherkin`). A test says what it `verifies` under `rel`.

## 8. Requirements and rules

**A requirement (`REQ`)** is one testable sentence in one of the EARS forms. The check wants one sentence containing *shall* that begins with *The*, *When*, *While*, *If* or *Where* (`QLT-req-form`), and wants it to state one thing, not several obligations joined by *and* after *shall* (`QLT-req-single`).

| Form | Pattern | Example |
|---|---|---|
| Always true | The system shall … | The system shall store every invoice amount in the smallest currency unit. |
| Event | When *trigger*, the system shall … | When the owner chooses Send, the system shall require explicit confirmation on a screen that shows the recipient's name, email address and the invoice total. |
| State | While *state*, the system shall … | While a workspace is suspended, the system shall refuse new invoices. |
| Unwanted | If *condition*, then the system shall … | If the payment provider does not respond within 10 seconds, then the system shall keep the invoice unpaid and tell the payer to retry. |
| Optional | Where *feature is present*, the system shall … | Where a workspace has enabled reminders, the system shall email the client three days before the due date. |

A **quality** requirement (speed, availability, security, accessibility) needs a number, a unit or a threshold that can be tested (`QLT-req-measurable`). "The system shall be fast" fails; "The system shall return the first page of invoices within 400 ms at the 95th percentile for workspaces of up to 10,000 invoices" passes. A constraint says where it comes from; a requirement that is not tested says how it will be shown to hold.

**A business rule (`RULE`)** states a calculation, validation, limit or decision, and carries **worked examples**: at least one positive and at least one negative or edge case, each with a `given` and a `then` (`INT-rule-examples`).

```yaml
statement: A line amount is its quantity times its unit price rounded half up to the cent; …
examples:
  - case: positive
    given: Three hours at 85.00 with 21% tax
    then: The line amount is 255.00, the tax 53.55 and the total 308.55
  - case: edge
    given: A quantity of 0.333 hours at 85.00 with 21% tax
    then: The line amount is 28.31 (28.305 rounded half up), the tax 5.95 (5.9451 rounded) and the total 34.26
  - case: negative
    given: A line with a negative quantity
    then: The invoice cannot be saved as ready; credits are made with a credit note, which is not yet supported
```

## 9. Choosing an element type

| You want to record | Use |
|---|---|
| Why the product exists; what it must achieve | `PROD`, `OBJ` |
| A need or pain people have, and the evidence for it | `OPP`, `EVD` |
| A group of customers; a made-up person who stands for them | `SEG`, `PERS` |
| What people use instead today | `ALT` (full adoption) |
| A bounded area of the product | `DOM` |
| What the product can do in an area | `CAP` |
| A deliverable behaviour | `FEAT` |
| Who or what takes part | `ACT` |
| What a kind of actor may do | `ROLE` (held by actors), `PERM` (granted by roles) |
| How customers are separated from each other | `TEN` |
| Where the product is used from (web app, mobile app, admin console) | `SRF` |
| A step-by-step interaction, and the goal it serves | `FLW`, `UC` |
| A page, dialog or panel | `SCR` |
| An email, notification, in-app message | `MSG` |
| A person's whole path across flows and touchpoints | `JRN` |
| A sentence that must be true | `REQ` |
| A calculation, validation, limit or decision | `RULE` |
| Something that has states | `STM` |
| A thing the product keeps information about | `ENT` |
| Something that happens that others react to | `EVT` |
| An interface outsiders call; a third party; how you connect to it | `API`; `EXT`; `INT` |
| A word with a precise meaning here | `TERM` |
| A price plan; what a plan includes | `PLAN`; `ENTL` |
| A duty from law, contract or standard | `OBL` |
| How it will be shown to work | `TST` |
| What could go wrong | `RISK` |
| What is measured | `MET` |
| How it is run when it breaks | `RUN` (full adoption) |
| What implements it, for reference | `SYS` (full adoption) |
| A rule of thumb the product follows | `PRIN` (full adoption) |
| Why you chose A over B | `DEC` |
| Something you are taking as true without proof | `ASM` |
| Something you do not know yet | `QST` |
| What was learned from the world | `EVD` |
| A slice that ships together | `RLS` |

Where each type may live (what it may be anchored on) is in the [reference](reference/element-types.md) under "Lives under", and `pds explain TYPE` prints it. `pds new` lists the candidates when it cannot choose.

## 10. Probes and facets on a feature

A feature declares the **facets** it cannot derive and answers the **probes** that apply to it (see [04](04-validation.md#probes)):

```yaml
facets: {async: true, user_content: true, public: false}
probes:
  failure-paths: {addressed: [FLW-send-invoice]}
  lists: {na: "Sending acts on one invoice from its own review screen; finding invoices is a separate feature."}
  audit: {deferred: "The first release keeps an invoice's state and dates but no log of who did what.", until: QST-audit-log}
  localisation: {deferred: "The first release is English only.", until: 2027-06-30}
```

- **`addressed`** names the elements that address the concern. They must exist and be of a type the probe accepts (`pds explain PROBE` lists them: for example tenant isolation is addressed by a requirement, a rule or a test) (`PRB-addressed`).
- **`na`** says why it does not apply. A reason is required (`PRB-disposition`).
- **`deferred`** says why, and until when: an open question, a release or a decision, or a date (`PRB-disposition`). A deferral is visible, and a question it waits on is chased by its own due date (`GOV-overdue`).
- Exactly one of the three per probe, and only probes that exist (`PRB-unknown`).
- A facet the graph shows to be true cannot be declared false (`INT-facets`).

## 11. Saying what you do not know

The system is honest about gaps only if the author is. Three records exist for it:

- **`QST` open question.** Something that must be answered before part of the definition can be trusted. `blocking: true` caps everything it `concerns` (and what is above that) at *outlined* until it is answered. `status` is `open`, `answered` (with `answer`) or `dropped`. A question has `asked_of` and a `due` date; past due and still open is a warning (`GOV-overdue`).
- **`ASM` assumption.** Something taken as true without proof: `confidence`, `if_wrong` (what happens if it is not), `validate_by` (how it will be tested) and `validate_before` (when). Past that date while open is a warning.
- **`DEC` decision.** Why A was chosen over B, with the alternatives and consequences. A decision makes a rule or requirement `derives_from` something.

**Never fill a section to make a record look finished.** A skeleton record is a prompt; leave it a skeleton until a person has read it, corrected it and set `origin: human`.

## 12. Changing things

| To | Do |
|---|---|
| Change the wording of something approved | Edit it, run `pds impact ID` to see what else to review, then `pds approve` again. Until then `GOV-approval-hash` shows. |
| Rename an id | `pds rename OLD NEW` |
| Stop using something but keep the history | `lifecycle: deprecated`, then `retired`, each with `lifecycle_note` saying why and what replaces it; the replacement says `supersedes: [OLD]` (`INT-supersedes`) |
| Remove something that was wrong from the start | Delete the file, and fix what referenced it (`pds lint` lists them) |
| Move something to another home | Change `anchor`, and move the file if its family changed (`SCH-id-file`) |
| Split a feature | Create the new ones, move the satellites by changing their anchors, then retire the old one with a note naming its successors |
| Waive a rule or an advisory check | `pds.yaml`, under `rules: {disable: [{id, reason}]}`, with a reason. Error-level checks cannot be waived. |

Retired elements are kept and excluded from coverage and from the queue. An active element should not depend on one (`REF-retired`).

## 13. The YAML subset

The frontmatter and the blocks are written in a **strict subset of YAML**, parsed by the tool itself so that the same text means the same thing to any YAML parser, in any language, in any year.

**Accepted:** block and single-line flow mappings and sequences (`[a, b]`, `{k: v}`); plain, `'single'` and `"double"` quoted scalars; literal and folded block scalars (`|`, `>`); `null`, `~`, `true`, `false`, integers and decimals, in lowercase; comments after a space.

**Refused, with a message that says how to fix it:**

- Tabs for indentation, anchors, aliases, tags, merge keys, directives, multiple documents, duplicate keys, and scalars that span several lines unless they are block scalars.
- **Plain scalars that YAML 1.1 and 1.2 read differently:** `yes`, `no`, `on`, `off`, `True`, `NULL`, `007`, `0x1F`, `1_000`, `1e3`, `1:30`, `.inf`. Quote them: `"yes"`, `"007"`.
- **Plain keys with the same problem:** `on:` is the boolean `true` to a 1.1 parser, so a state transition's key is `trigger`, not `on`. Numeric keys are refused too, so the tier keys in `model.yaml` are written `"1"`, `"2"`, `"3"`.
- Inside a flow mapping, a plain key needs a space after the colon: `{k: v}`, not `{k:v}`.

**Dates** such as `2026-10-27` stay strings; the tool checks their shape. A value with a colon followed by a space, or one that starts with a quote, bracket or hash, should be quoted.

This is checked for real: `scripts/yaml-parity` parses every YAML source in the repository (205 when it was last run) with this tool and with PyYAML and fails if the results differ.

## 14. A short style guide

1. **Write for someone who has not been in the meeting.** If a rule depends on a convention, say it or link the term.
2. **One fact, one place.** If you are about to write it a second time, link to the first.
3. **Be specific about numbers and who.** Who sees what, under what condition, within how long.
4. **Write the unhappy path with the happy one.** A flow with no failure end is flagged for a reason.
5. **Name the actor.** "The system shall…" is fine for what the system does; for what a person does, say which person.
6. **Say what is out of scope.** A boundary written down saves a meeting later.
7. **Leave a gap visible rather than fill it badly.** A question, an assumption or a deferral with a date is a finished sentence; a plausible guess is a future incident.
8. **Titles name things, summaries say what they are for.** If the summary repeats the title, it is not a summary (`QLT-summary`).
9. **Link to the outside, never to inside copies.** `links` points at designs, tickets and code; the definition is not duplicated there.
10. **Prefer a small, accurate definition to a large, hopeful one.** The tool counts what is unconfirmed.
