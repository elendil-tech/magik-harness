# 08. Build-out

What exists, how it is checked, how it is extended, where it stops and what comes next. [02](02-architecture.md) describes the design; this page is the account of the work, and the honest edge of it.

## 1. What exists

| Part | Where | What it is |
|---|---|---|
| The model | `meta-model/` | Six YAML files (the model, element types, relations, rules, probes, views) and the `saas` profile with the patterns its skeleton is made from. About 2,500 lines of YAML. [02 §3](02-architecture.md#3-the-meta-model-is-data) |
| The engine | `tools/lib/` | About 6,000 lines of JavaScript. No dependencies, no build step, Node 20 or later. [§2](#2-the-engine-module-by-module) |
| The command line | `tools/pds.mjs`, `tools/lib/commands/` | 15 commands. [02 §4](02-architecture.md#4-the-tool) |
| The tests | `tools/test/` | 14 test files and one helper module, more than 400 tests, all of them driving the real code on real files. [§3](#3-how-it-is-verified) |
| A worked example | `examples/ledgerly/` | An invented invoicing product, lint-clean, with what is unfinished left visible. |
| The documents | `README.md`, `docs/` | This set, and `docs/reference/`, which is generated from the model and not edited. |
| The agent skill | `skills/pds-define/` | One skill, and the [protocol](07-agents.md) behind it. |
| Scripts | `scripts/` | The test runner, and three checks that are not part of the product: YAML parity, diagram rendering and scale. |

The package is self-contained: it reads and writes only inside the project folder it is pointed at.

## 2. The engine, module by module

Data flows one way: text in, a plain analysis out, and everything else reads the analysis. Only the modules marked here touch the disk.

| Module | Does | Disk |
|---|---|---|
| `yaml.mjs` | The strict YAML subset: parser and writer. | |
| `records.mjs` | Reads one record: frontmatter, sections, structured blocks, `[[wikilinks]]`, the content hash. Knows nothing of the meta-model. | |
| `shapes.mjs` | Value checks for field types and the named block shapes. | |
| `metamodel.mjs` | Loads and validates `meta-model/`. Nothing else in the tool names a type, a relation or a rule. | reads |
| `project.mjs` | `pds.yaml` and the definition folder: reads the files into memory, resolves configuration, waivers and policy. | reads |
| `graph.mjs` | The model: elements, the spine, typed edges, tiers, lifecycle, facets. | |
| `coverage.mjs` | Evaluates rules, probes and gates; computes maturity. | |
| `checks/` | The 63 coded checks, one file per class: schema, references, coherence, quality, governance, probes. | |
| `lint.mjs` | `analyse()`: model, coverage, checks and the gap queue, in one pure function. | |
| `approval.mjs` | Approval units, content hashes, what an approval covers. | |
| `impact.mjs` | The impact walk. | |
| `views/` | The 21 views as pure functions of the analysis, and the planner that names the files. | |
| `templates.mjs`, `seed.mjs`, `edit.mjs` | What `pds new` and `pds init` write, and surgical edits to one frontmatter key. Text in, text out. | |
| `refdocs.mjs` | The generated reference. | |
| `cli.mjs`, `commands/`, `format.mjs`, `errors.mjs` | Arguments, the commands, plain-text output, exit codes. | `cli.mjs` finds the project; the commands read and write |

Two properties make the rest of the work safe, and tests hold both: `analyse()` takes files in memory and returns data, so it can be called on a project that exists only in a test; and a view is a function of that data, so the same records always give the same bytes.

## 3. How it is verified

A claim is only as good as the check that could have failed. Each layer below can fail, and each has been seen to.

| Layer | How | What it holds |
|---|---|---|
| Behaviour | `npm test` | Every command through the real command line in process; every coded check, by breaking a private copy of the example one way and expecting the finding that deserves; maturity, approval, impact, the graph and the record reader on small models built in memory. |
| The model | `pds meta check` | The data agrees with itself and with the engine, in both directions ([02 §3](02-architecture.md#3-the-meta-model-is-data)). Tests break the model on purpose to show the check notices. |
| Generated files | `pds docs --check`, `pds views --check` | The reference and the example's views are exactly what the tool writes now. |
| The prose | `tools/test/docs.test.mjs` | Every relative link and heading anchor resolves; every `pds` command and flag shown exists; every rule, check and gate named exists; every count quoted (types, relations, rules, checks, probes, views, commands, modules) is the number the model computes; the families table lists the types in each family; the numbers quoted about the example are what `pds status` prints; the skeleton is as big as the README says. |
| The YAML subset | `python3 scripts/yaml-parity/compare.py` | Every YAML source the package ships (records, blocks, model files, template examples) means the same to PyYAML as to the project's parser. Needs `pip install pyyaml`. |
| The diagrams | `node scripts/mermaid-check/build.mjs` | Every Mermaid diagram in the README, the documents and the example's views is parsed and drawn by the real Mermaid library in a browser. The page reports `done:<diagrams>:<failed>`, and a deliberately broken diagram makes it fail. Needs a network connection for the library, and nothing is installed. |
| Scale | `tools/test/scale.test.mjs`; `node scripts/scale/measure.mjs` | The test holds the shape: four times the records must cost far less than sixteen times the work, for the analysis, the views and the queue. The script prints times. |
| Node versions | the suite on each | Node 20, 22, 24 and 25. The runner is the project's own (`scripts/test.mjs`), so one command works on all of them. |

`npm run check` is the quick one: model, reference, views and lint of the example, in a few seconds.

**What to run after changing what.**

| You changed | Run |
|---|---|
| a file in `meta-model/` | `pds meta check`, `pds docs`, then `npm test` |
| a coded check | `npm test`; a new check needs a case in `checks.test.mjs` and `pds meta check` insists the declaration and the code both exist |
| a view or a diagram | `pds views` in `examples/ledgerly`, `npm test`, and the diagram check |
| the YAML parser or writer | `npm test` and the parity script |
| a document | `npm test`; the prose test says what is wrong |
| anything | `npm run check` before pushing |

## 4. Verification status

As of 27 October 2026, on macOS (Apple M2 Pro, 16 GB).

| What | Result |
|---|---|
| `npm test` | passes on Node 20.12.2, 22.9.0, 22.13.0, 24.21.0 and 25.9.0 |
| `npm run check` | passes: the model is consistent, the reference and the example's 70 generated files are current, the example has 0 errors and 2 warnings that name real work |
| YAML parity | 205 of 205 sources identical with PyYAML 6.0.3 |
| Diagram rendering | all 29 diagrams parse and draw in Mermaid 11.17.2 in headless Chrome; the negative control (two deliberately broken diagrams) is caught |
| Scale | the shape holds; times in [§5](#5-measured-scale) |

**Not verified.** Windows and Linux (the work was done and run on macOS only). Browsers other than Chrome (the diagram check renders in one). Anyone other than the maintainer using it on a real product: the example is invented, and no team has yet lived with the tool for a quarter. Whether the 27 probes and the tier cadences are the right defaults is a judgement the tests cannot make, and it will take a real product to settle it.

## 5. Measured scale

`node scripts/scale/measure.mjs` writes a synthetic product to disk and times each command as a person runs it: a process of its own, files read from disk, the fastest of three runs. The product is a spine with entities and satellites of seven kinds, all stubs, one in seven an open blocking question (the worst case for the gate that reads them).

| Records | `lint` | `status` | `next` | `views` (writes) | `views --check` |
|---|---|---|---|---|---|
| 1,000 | 0.3 s | 0.3 s | 0.3 s | 0.5 s | 0.3 s |
| 5,000 | 0.6 s | 0.6 s | 0.6 s | 1 s | 0.8 s |
| 20,000 | 3.5 s | 3 s | 3 s | 4 s | 4 s |

Apple M2 Pro, 16 GB, Node 22. Times move by up to half between runs on a busy machine. A real definition is between a few hundred and a few thousand records; the example has fewer than 200. Every command reads the whole definition each time, with no cache, which is why the floor is a few hundred milliseconds and why time grows with the files, not with the questions asked.

What is asserted is the shape, not the times, because times belong to a machine. Two loops that scanned the whole definition once per feature or per gap were found by measuring and fixed (generating views for 16,000 records took 21 s and now takes about 2 s); the tests that hold the shape fail if either comes back.

## 6. Extending

[02 §8](02-architecture.md#8-extension-points) says what to edit to add a field, rule, check, probe, relation, element type, view, module or profile. What goes with each change:

- **A coded check** is declared in `rules.yaml` and implemented in `tools/lib/checks/`. Add a case to `checks.test.mjs` that breaks the example one way and expects the finding on the right element; a check nobody has seen fail is a check nobody can trust.
- **A view** is declared in `views.yaml`, implemented in `tools/lib/views/` and registered. It must be a pure function of the analysis, take no date and compute its links from where it is written; `views.test.mjs` holds all three. Regenerate the example's views, then run the diagram check.
- **A type, a field, a section** is data. Run `pds docs`; if the example should show it, add it there. The template tests are generic and cover the new type without new code.
- **A relation** must be read by something. `pds meta check` fails on a relation that no rule, check or view uses.
- **A profile** is a defaults file and a patterns file in `meta-model/profiles/`. Its seeds are checked as valid records.
- **A document** may state a count, name a command or link to a heading, and the prose test will keep it true. Write counts as digits (`63 coded checks`): a number in words is read as a subset ("six commands write") and is not checked.

## 7. Known limits

What the system does not do, so that nothing here is mistaken for done.

| Limit | What it means in practice |
|---|---|
| **One product per project.** | `PROD` is a singleton and `pds.yaml` names one profile. A company with several products keeps a project for each, and there is no view across them. |
| **No history.** | The tool reads the files as they are now. Git says which files changed; nothing says which *elements* changed between two releases, or what moved up or down a rung. Stale approvals (`GOV-approval-hash`) are the only memory of change. |
| **No migration.** | `pds rename` changes an element's id and everything that points at it. Renaming something in the *model* (a type, a field, a relation, a section) is not supported: the records that use the old name become errors and the approvals that cover them go stale. `pds: 1` in `pds.yaml` is the version hook for a command that does not exist yet. |
| **Nothing imports.** | `origin: import` is a value a record can carry, and no command writes it. Recovering an existing product is the manual procedure in [06](06-procedures.md#2-recover-a-product-that-already-exists). |
| **No viewer.** | Output is Markdown and Mermaid, drawn by whatever renders them. Mermaid lays diagrams out by itself: a flow of more than 25 steps is flagged (`COH-flow-size`) because it stops being readable, and the product map leaves the features out of its diagram when the spine has more than 120 elements (the outline beneath it stays complete). |
| **Proof is declared, not observed.** | A record says how a requirement will be proved and a person types the result of a test. Nothing reads a test runner's report or looks in the code, so `verifiable` means "specified, with a defined way to prove every requirement, rule and flow", not "proved". |
| **The wording checks read English.** | Requirement form (`shall` and the EARS lead-ins), the list of vague words and the Gherkin keywords (`Given`, `When`, `Then`) are English. A definition in another language draws a requirement-form warning on every requirement and has to write its test scenarios with the English keywords. The two warnings can be waived rule by rule ([04](04-validation.md#7-waivers)). The structural checks do not depend on language. |
| **Structure, not sense.** | The tool checks that a requirement is well formed, not that it is wise; that a probe is answered, not that the answer is good; that an element has an owner, not that the owner agrees. See [01 §7](01-assessment.md#7-what-is-still-open). |
| **Approval is a name, not an identity.** | `pds approve ID --by NAME` accepts a name listed in `approvers`. Who actually ran it is in git. `PDS_AGENT` makes the command refuse, as a tripwire for agents that behave; it is not a security boundary ([07](07-agents.md)). |
| **Ids are ASCII.** | `TYPE-slug` uses lower-case letters, digits and hyphens. Titles and prose can be in any script. |
| **One profile.** | `saas` is the only one shipped. The mechanism supports others; a marketplace or an API-only product would want its own skeleton. |
| **The example is invented.** | Ledgerly's approvals are fixture data, and its prices, interviews and compliance notes are plausible, not advice. |

## 8. Roadmap

Nothing here is built. The order is by what stops a team using the system on a real product, not by what is interesting. None of these changes the model; each is tool or content around it.

**Next: what a team needs in its second month.**

1. **Baselines and diffs.** A command that compares two git revisions or two releases: elements added, changed and retired, rungs gained and lost, approvals gone stale, and the impact of the change. The foundation is there: `RLS` records and a content hash on every element.
2. **Migration.** A command that applies a rename in the model across every record and re-seals the approvals it would otherwise invalidate. It is needed the first time a type is renamed, and `pds: 1` is already the hook.
3. **Import.** Turn an existing requirements document, a tracker export or a list of design files into `origin: import` stubs that the recovery procedure then confirms one by one.
4. **A pull-request check for adopters.** The commands exist (`lint --strict`, `views --check`, `docs --check` take about a second at normal scale). A workflow file that runs them is a few lines and is deliberately not shipped: where it runs, and on whose minutes, is the adopter's choice.

**Later: when the definition is large or shared.**

5. **Evidence from code and tests.** Read test results from a runner's report instead of typing them; check that the files a record points at exist; map elements to code owners.
6. **A viewer.** A static page generated from the same analysis, with the product map as navigation, search and the impact walk. No server.
7. **More profiles.** Marketplace, API-only product, internal tool, mobile app: each a defaults file and a skeleton.
8. **Editor support.** A JSON Schema for frontmatter and completion for ids and `[[wikilinks]]`, both generated from the model.
9. **More than one product in a repository,** with a view across them.
10. **Localisation** of section headings, messages and the quality heuristics.

**Not planned.** Delivery tracking (tasks, estimates, sprints) is a tracker's work. Generating code or wireframes is a different tool's. Anything that lets an agent approve is against the design ([07](07-agents.md)).

**Decisions that are yours** are listed at the end of [01 §7](01-assessment.md#7-what-is-still-open): who approves, which domains are tier 1, whether to run the checks on pull requests, and whether to adopt the `saas` profile as it is.
