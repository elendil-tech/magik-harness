# 09. Decisions

Why the system is built the way it is, and what was not taken. The designs in [02](02-architecture.md) to [07](07-agents.md) say *what*; this page says *why*, so that someone who wants to change one knows what it was holding up.

Each entry has the same parts. **Decided** is the choice. **Because** is the reason that carried it. **Not taken** is what it was weighed against; these are the alternatives that were real candidates, argued from the problem and not from a record of having tried them. **Costs** is what the choice makes worse, because every choice does.

To change a decision, add an entry that says it replaces the old one and leave the old one where it is, the way a decision record in a definition is superseded and not edited.

## The shape of the model

### D1. One tree and its satellites, not levels and layers

**Decided.** A product is one decomposition tree (product, domain, capability, feature) with everything else anchored on it, in eleven families, joined by a typed graph. Depth is a position on the tree. Aspect is the family.

**Because.** The proposal has two axes, depth (L0 to L5) and kind (six layers), and they cross: a business rule is both deep and a piece of behaviour. Forced onto one axis it has to choose between "level 4" and "the behaviour layer". Here it has both answers, because they answer different questions, and each element has exactly one anchor and one family.

**Not taken.** A strict hierarchy of levels cannot say that a rule is shared by two features or an entity is used from several capabilities. A matrix with a document per layer and level is mostly empty cells and overlapping copies. A flat set of tagged notes says nothing about where a thing sits, so nothing can be summed up at the level above it.

**Costs.** There are 42 element types to learn. The adoption levels (17, 38, 42) exist to soften that: a small product starts with the core.

### D2. Hierarchy is written once, in `anchor`

**Decided.** The spine is the `anchor` field and nothing else. Records live in a folder by family, not by place in the tree.

**Because.** Moving a feature to another capability is then one edit to one key, not a file move that also changes every path that mentions it, and the tree can never disagree with the folders.

**Not taken.** A folder tree mirroring the hierarchy, which makes a reorganisation a rename of paths and puts the structure in two places.

**Costs.** The tree is not visible in a file listing. `pds view product-map` draws it.

### D3. Relations are stored once, typed and weighted

**Decided.** A relation is written on the element it leaves. The inverse is derived, and refused if written. Each of the 36 relations says which pairs of types it may join and how strongly each end is affected when the other changes. A relation nothing reads is removed.

**Because.** Two copies of a fact diverge. A link without a type cannot be checked, drawn or weighted. A relation that nothing consumes is carrying weight for no one, so `pds meta check` refuses it.

**Not taken.** Writing both directions (a second copy to forget), untyped links, and relations as records of their own, which is heavy for the thousands of edges a definition has.

**Costs.** To see what points at a record you ask the tool (the element's card, or `pds impact`) and do not read the file.

### D4. Eleven families, each a folder

**Decided.** An aspect of the product is a folder: intent, actors, structure, experience, behaviour, information, commercial, realisation, assurance, operations, change. Each element type belongs to exactly one.

**Because.** A person looking for "the rules" or "the risks" knows where to look, and a family is the natural unit for the coverage report (`pds status` prints depth by family).

**Not taken.** One flat folder, which stops being browsable at a few hundred records; or a folder per feature, which is hierarchy again (D2).

**Costs.** A new type has to be put in a family, and a few sit on the border (an entitlement is commercial, though a feature is gated by it).

## Records and files

### D5. Plain files in git, one record per file

**Decided.** One element is one Markdown file with a YAML header, in the repository.

**Because.** It reads without the tool, diffs line by line, merges, is reviewed in a pull request like code, and an agent can read and write it. There is no service to run and nothing to lose when a tool is dropped.

**Not taken.** A database or a hosted workspace (cannot be branched or diffed, ties the definition to a vendor, and cannot be checked mechanically by a script you own). One large document (merge conflicts and a review unit that is too big). Pure YAML or JSON (the content is mostly prose).

**Costs.** No form for people who will not edit files; a viewer is on the [roadmap](08-buildout.md#8-roadmap). A hand-edited file can be malformed, so the tool reports it by line.

### D6. The id is the file name: `TYPE-slug`, frozen

**Decided.** An id is a type prefix and a lower-case slug, equal to the file name, chosen at creation and never reused. A title can change freely. `pds rename` is the only way to change an id.

**Because.** Everything links by id, so a title change must not break anything. An id a person can read (`FEAT-send-invoice`) is useful in a diff, a conversation and a search. The prefix says what kind of thing it is.

**Not taken.** Numbers (`FEAT-0042`) need a counter, and two branches both take 42. UUIDs cannot be read in review. Titles as ids break every reference on a rename.

**Costs.** A badly chosen slug sticks; ids are ASCII; the slug can drift from the title (which is allowed).

### D7. A strict subset of YAML, with a parser of our own

**Decided.** Frontmatter and blocks are PDS-YAML: a subset that refuses the values and keys on which parsers disagree (`yes`, `no`, `on`, `off`, `007`, `1:30`, `1e3`). The parser and writer are part of the project, tested for parity against PyYAML on every YAML source the package ships.

**Because.** The definition is hand-written, and YAML 1.1 and 1.2 parsers read the same text differently. It was found, not guessed: a state transition keyed `on:` came out as the boolean `true` in another parser. A subset that means the same everywhere is what lets a record be read by a script in any language.

**Not taken.** A YAML library (a dependency, and the disagreement stays). JSON (hostile to hand-writing and to prose). TOML (does not nest the way blocks do).

**Costs.** Valid YAML is sometimes refused, with a message that says what to quote. The parser has to be kept correct, which the parity script and its tests are for.

### D8. The model is data, and the tool is a generic engine

**Decided.** Types, relations, rules, probes, views, modules and profiles are YAML in `meta-model/`. The engine hard-codes none of them. Templates, schema checks, the elicitation questions and the reference documents are generated from the data. `pds meta check` verifies the data against itself and against the engine, in both directions.

**Because.** Adding a rule or a field should not need a developer, and a team should be able to keep its own model next to its own definition (`--meta DIR`). Generating the templates and the reference from the same data means they cannot drift from it.

**Not taken.** Rules in code, which only a developer can change and no one can list. A scripting language in the rules, which makes them unreviewable; a rule contains no code.

**Costs.** The rule language is small (a field, a section, a block, a relation with a count, children, a facet), so what it cannot say needs a coded check (D17).

## Completeness and status

### D9. Maturity is computed from the content, and the claim is checked

**Decided.** The author declares a rung. The tool computes the rung the content supports. A claim above it is an error that names every rule that fails.

**Because.** A checklist the author ticks measures the author's confidence. A computed value is the only one that cannot be talked into agreeing.

**Not taken.** A status field alone. A checklist with a tick per item. A percentage of fields filled.

**Costs.** The author sometimes disagrees with the computation. They can claim less and say why, or waive a rule with a reason (D21), but they cannot claim more.

### D10. Four rungs, not a percentage

**Decided.** `stub`, `outlined`, `specified`, `verifiable`. `pds status` counts the elements at each. The one number it prints, depth, is the mean computed rung as a share of the top rung, and is described as a gauge of direction.

**Because.** A percentage invites averaging a finished payment feature with forty stubs and calling the product sixty per cent done. The rungs say what each element *is*, and the stubs stay visible. Four is what separates named, described, buildable and provable.

**Not taken.** A single percentage. Fewer rungs, which merge "described" with "buildable", or more, which no two people would apply the same way.

**Costs.** "How done is it?" has no one-number answer, and the people who ask for one will be given the gauge.

### D11. Only a type with something to prove can be `verifiable`

**Decided.** The top rung needs a rule at the top rung. Features, flows, requirements, rules, state machines and obligations have one. A decision or a glossary term tops out at `specified`.

**Because.** A rung that nothing is checked at proves nothing. Found when a glossary term could be declared verifiable.

**Not taken.** Letting any type claim any rung.

**Costs.** One more thing to explain, which [04 §1](04-validation.md#1-the-ladder) does.

### D12. Four separate statuses, and a fifth setting that is not a status

**Decided.** Maturity (how complete), approval (who accepted it), lifecycle (where it is in its life) and origin (who or what wrote it) are four fields, stored and checked independently. Tier (how critical) is a setting, not a status.

**Because.** The commonest failure of definition systems is one status field that tries to mean all four, so that "approved" can mean finished, accepted, current or merely written.

**Not taken.** One status with many values.

**Costs.** Four things to look at. `pds status` and the cards put them side by side.

### D13. Approval is bound to a hash of the content, and the unit of approval is the unit of build

**Decided.** A named person from `approvers` approves a capability or a feature. The approval covers it and everything anchored beneath it, bound to a hash of that content, and shows as stale after any edit in it.

**Because.** An approval that survives an edit is a false statement. And the unit has to be the unit of review: approving one flow at a time was found to be unusable, while approving a feature is a person saying "I read this specification and it is right".

**Not taken.** A boolean `approved: true`. Approval per record. Approval by pull-request review alone, which the tool cannot query, so it cannot say what is still approved.

**Costs.** Editing anything inside an approved unit invalidates its approval, which is the point and is also work. Domains and the product are not units, because one approval covering that much would go stale on every edit anywhere.

### D14. Skeleton records are prompts, and are capped

**Decided.** `pds init` writes a stub for everything the profile expects, marked `origin: skeleton`. A skeleton is capped at `outlined` until a person confirms it. A fresh project reports depth 0 per cent.

**Because.** The asker wanted a full-coverage skeleton. A skeleton of plausible text looks finished, and a definition that looks finished is worse than one that does not. Making the skeleton visibly unconfirmed gives the coverage map without the false comfort.

**Not taken.** An empty project and a checklist (no map of what to cover). A pre-filled example (looks done, and is someone else's product).

**Costs.** Confirming every record of the skeleton is real work, and the tool will not let it be skipped.

### D15. Concern probes, with facets read off the graph

**Decided.** Twenty-seven standing questions (failure paths, concurrency, audit, tenant isolation, and so on) each apply to a feature by tier, kind, module and facet, and each needs a disposition: addressed, not applicable with a reason, or deferred with a date. Facets are derived from the graph where they can be and declared where they cannot.

**Because.** A template can only prompt for what is on it, and a graph cannot find a missing node. The omissions that hurt are the ones nobody thought to ask about. Deriving the facets means nobody has to remember that a feature touching personal data needs the privacy question.

**Not taken.** A longer checklist per template. A single "non-functional requirements" section, which invites boilerplate.

**Costs.** A probe cannot judge the answer: `na` with a poor reason passes the tool and fails a review. The gain is that an omission becomes an explicit, searchable statement.

### D16. Effort in proportion to risk: three tiers

**Decided.** Tier 1 is critical, 2 important, 3 supporting. A tier decides which probes apply, which sections are asked for, whether approval is required, how often the element must be reviewed (60, 120 or 240 days) and the order of the queue. It is inherited down the anchor chain, and a child cannot be more critical than its parent.

**Because.** Not every element needs a sign-off, a runbook and an audit trail, and a system that asks the same of everything is one a team switches off.

**Not taken.** One standard for all. A free-form priority.

**Costs.** Assigning tiers is a human judgement the tool cannot make. The profile suggests five domains for tier 1; the owner reviews them.

### D17. Coded checks only where a rule cannot say it

**Decided.** Coverage rules are data (D8). A check is code, and exists only for what a rule cannot express, such as walking a flow to see that it ends. There are 63, in six classes (schema, references, coherence, quality, governance, probes). Each is declared with a severity and a sentence of explanation, so it can be listed and explained, and each has a test that breaks the example one way and expects it to fire.

**Because.** What is data can be reviewed and changed without code. What is code needs a test that proves it can fail; a check nobody has seen fail is a check nobody can trust.

**Not taken.** All logic in code. All logic in a rule language grown until it can express a graph walk.

**Costs.** A check needs a declaration, an implementation and a test. `pds meta check` insists on all three.

### D18. A rule, check or gate id never starts with an element type's code

**Decided.** Coverage rules are `COV`, `FLD`, `SEC`, `BLK` and `PRB`; checks are `SCH`, `REF`, `COH`, `QLT`, `GOV` and `PRB`; gates are `GATE`. None of them is a type code, and `pds meta check` refuses one that is.

**Because.** The coherence checks were first called `INT`, which is also the code of the integration type. The documents' own consistency test read `INT-email-sending` as an unknown check and `INT-flow-ends` could as easily be read as an element. Two kinds of id that look alike are one search away from being confused. The class was renamed, all twenty checks with it, and the validator now holds the line.

**Not taken.** Renaming the element type, which is the user's data and which would have changed their records.

**Costs.** None that was noticed.

## Output

### D19. Views are generated, never edited and carry no date

**Decided.** The 21 views are pure functions of the analysis: the same records give the same bytes. They carry a banner, are committed so that GitHub renders them and a pull request shows what changed, and `pds views --check` fails when one is stale. A view names no date.

**Because.** A diagram drawn by hand is correct on the day it is drawn. The date was removed because a view that printed it made `views --check` fail every morning, which is a check that cries wolf.

**Not taken.** Rendering on demand only (nothing to read on GitHub, no diff). Hand-maintained diagrams (drift).

**Costs.** Generated files in the repository, and a lot of them for a large definition (about 2,400 for 16,000 records). A reviewer can skip them, because `pds views --check` fails when they are not what the records produce.

### D20. Mermaid and Markdown tables

**Decided.** Diagrams are Mermaid, everything else Markdown. Every id and label passes through one escaping helper, and every diagram in the documents and in the example is drawn by the real library in a browser as part of verification.

**Because.** They are text, so they diff and an agent can read them, and they render on GitHub and in editors with nothing installed.

**Not taken.** PlantUML or Graphviz (need a renderer). Draw.io or a design tool (binary, drawn by hand). A viewer of our own (on the roadmap, not the first step).

**Costs.** Mermaid lays diagrams out by itself, so a big one is hard to read: flows over 25 steps are flagged, the product map is drawn left to right and drops features above 120 spine elements, and decisions are hexagons because diamonds grew too wide. The structure was checked by tests and the drawing by eye, which is why the rendering check exists.

### D21. Waivers need a reason, and never cover an error

**Decided.** A project can waive a coverage rule or an advisory check, and switch a probe off, each with a reason, in `pds.yaml`. It cannot waive an error-level check.

**Because.** A product that is API-only has no screens, and a rule that insists on them is noise. But the errors are what keep a definition consistent and honest, and a waiver on those would be a way to make a lie pass.

**Not taken.** No waivers (the tool is turned off the first time a rule does not fit). Waivers without a reason.

**Costs.** `pds.yaml` becomes a place to review, and it is human-owned for that reason.

### D22. Impact is weighted by relation, and a container is not a neighbour

**Decided.** `pds impact` walks the graph. Strong links are followed two hops and weak links one, a path is as strong as its weakest edge, and going down the anchor chain is strong while going up is weak.

**Because.** The first version walked every relation equally and flagged half the product. A change to a rule should reach the features it governs and the tests that prove it, not every risk and metric that happens to sit in the same feature.

**Not taken.** An unweighted walk. A fixed radius.

**Costs.** The weights are judgement. They live in `relation-types.yaml`, so they can be tuned without code.

## Agents and people

### D23. Agents draft and check; people decide, confirm and approve

**Decided.** An agent works from `pds next` and `pds ask`, turns what it does not know into open questions and assumptions instead of inventing requirements, records `origin: agent`, and cannot approve. Approval refuses under `PDS_AGENT`, even with `--force`.

**Because.** A skill that depends on the agent behaving is a hope. What can be enforced is, and what cannot is said so: the environment variable stops an agent that has been told not to, and is not a security boundary.

**Not taken.** Trusting the instructions alone. Keeping agents out of the definition altogether, which wastes the thing they are good at: asking the next question and drafting the answer for a person to correct.

**Costs.** A careful forgery of an approval is not stopped; review of the diff, code owners on `pds.yaml` and `PDS_AGENT` in the agent's environment are the other layers ([07](07-agents.md)).

### D24. The queue is breadth first

**Decided.** `pds next` takes everything to `outlined` before anything is specified, goes top down through the spine within a rung, and puts critical before supporting.

**Because.** A missing domain found after fifty features are specified is expensive. Found while everything is outlined, it is a new stub.

**Not taken.** Finishing one feature completely before the next.

**Costs.** It feels slow to someone who wants to see one feature done. `pds ask ID` takes any one element as far as it will go.

## The tool and the work around it

### D25. Small, boring and dependency-free

**Decided.** Node 20 or later, the standard library only, no build step. The YAML parser, the record reader and the test runner glue are the project's own.

**Because.** A definition has to outlive the tools around it, and a tool with nothing to install runs on a laptop, in an agent's sandbox and in a pull request check alike.

**Not taken.** TypeScript and a package set. Another runtime.

**Costs.** The parts a library would have given are ours to keep correct, which is what the parity script (D7) and the scale tests are for.

### D26. The documents are tested against the tool

**Decided.** `tools/test/docs.test.mjs` checks every link and heading anchor, every `pds` command and flag, every rule and check id, every quoted count, the families table and the numbers quoted about the example.

**Because.** Prose that quotes a number goes stale silently. The first run found two links to headings that did not exist, two family titles that differed from the model, and the shared prefix of D18.

**Not taken.** Review by eye, which is how those survived the first reading.

**Costs.** A document cannot say "six commands write" in digits without the test checking it, so subsets are written in words and totals in digits ([08 §6](08-buildout.md#6-extending)).

### D27. Delivery stays out

**Decided.** Maturity is the completeness of the definition, not the status of the work. There are no tasks, estimates or sprints, and no code or wireframe generation.

**Because.** A feature can be fully defined and unbuilt, or built and undefined, and a system that merged the two could report neither truthfully. A tracker is better at tracking.

**Not taken.** A task layer.

**Costs.** A second place to look. A record's `links` point at the tracker.

### D28. No workflow file is shipped

**Decided.** The checks a pull request should run are named and described ([06](06-procedures.md#6-the-checks-for-a-pull-request)), and each takes about a second at normal scale. No workflow definition comes with the package.

**Because.** Where checks run, and on whose budget, is the adopter's decision, and they run on a laptop first either way.

**Not taken.** A ready-made workflow, which is on the [roadmap](08-buildout.md#8-roadmap) for whoever wants one.

**Costs.** An adopter writes a few lines.

### D29. One product and one profile for now

**Decided.** A project has one `PROD`, and its `pds.yaml` names one profile. Only the `saas` profile is shipped.

**Because.** The anchor chain needs a single root, and several products would need namespaces for ids and a view across them, which is a feature of its own. The profile mechanism is general; one profile is what has been exercised.

**Not taken.** A multi-product repository, a portfolio view and further profiles, all on the roadmap.

**Costs.** A company with three products has three projects.

### D30. Scale is asserted as a ratio between two sizes, never as a time

**Decided.** The scale tests compare what the analysis, the views and the queue cost on a definition of 1,000 records and on one of 8,000, and fail when the cost grows far faster than the records. Each ratio is the best of five alternating runs, and a miss is tried twice more before it fails. The only figure in seconds is one generous ceiling.

**Because.** A time belongs to a machine and a ratio belongs to an algorithm. Two quadratic scans got past review and past a small example, and were found only by measuring. A test that holds the shape keeps them from coming back without needing the same computer.

**Not taken.** A time limit, which fails on a slower machine and passes a regression on a faster one. One measurement at each of two close sizes, which was the first version: it failed now and then on a quiet machine, because the time a process spends on the processor includes the engine's compiler and collector, and the ratio sat too close to its limit. Counting operations, which needs instrumentation in the code being tested.

**Costs.** The tests take several seconds. The line between linear and quadratic is a judgement, and has to be set again if the code's constant factors change a great deal ([08 §5](08-buildout.md#5-measured-scale) gives what was measured).
