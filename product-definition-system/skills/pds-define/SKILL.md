---
name: pds-define
description: Defines, specifies, recovers or reviews a SaaS product, domain, capability, feature or flow with the product definition system (the `pds` command line), drafting records until they reach a target maturity and reporting what a person must decide or approve. Use when the user asks to define, specify, document, outline or review a product or feature in a project that has a pds.yaml, or mentions pds, the product definition system, definition coverage, or the pds next queue.
disable-model-invocation: true
---

# Define a product with pds

You draft and check a written definition of a product, held as Markdown records in git. The `pds` tool says what each record still lacks. **You draft and check; people decide, confirm and approve.**

Run the tool as `node <path-to>/product-definition-system/tools/pds.mjs` (written `pds` below), from the project folder or with `--root DIR`. Set `PDS_AGENT=1` for every command: it makes `pds approve` refuse.

## Ground rules

1. **Do not invent facts.** Prices, limits, legal duties, policies, numbers, and the names of systems or people are either in the material you were given or they are not. If not, write a `QST` (open question; `blocking: true` if building depends on the answer) or an `ASM` (assumption; give it `validate_before`). A visible hole is counted; a guess in the prose is not.
2. **Never approve**, and never edit `approval:` blocks by hand.
3. **Never edit `pds.yaml`** (approvers, policy and waivers are human-owned), and never waive a rule or probe. If one seems wrong, say so in the report.
4. **Never edit `views/`**: it is generated. Regenerate with `pds views`.
5. **Origin.** Mark what you write `origin: agent`. Set `origin: human` only on the explicit word of the person who has read that record. A skeleton (`origin: skeleton`) stays capped at `outlined` until then.
6. **Do not claim more than the tool supports.** Set `maturity` to the rung on the second line of `pds ask ID` (`supports ...`), never above it. A lower claim is allowed.
7. **Ids are stable.** Rename only with `pds rename OLD NEW`, never by editing files.
8. **One element at a time**, and keep what a person has to read small.

## The loop

```
- [ ] 1. Orient:    pds status ; pds lint
- [ ] 2. Choose:    pds next --limit 3 --json   (or the element the user named)
- [ ] 3. Interview: pds ask ID                  (--all for every rung)
- [ ] 4. Draft:     pds new TYPE "Title" --anchor ID  ; edit the record
- [ ] 5. Check:     pds lint --element ID ; pds ask ID
- [ ] 6. Repeat to the target, then pds views (if the project commits views)
- [ ] 7. Report
```

**Orient.** Read `pds.yaml` to learn the adoption level, modules and approvers. Never write to it.

**Choose.** The queue is breadth first: everything is outlined before anything is specified, top of the spine first, critical before supporting. Follow it unless the user points elsewhere. Gates come first: a skeleton needs a person; a blocking question needs an answer.

**Interview.** For each unmet rule, `ask` is the question to answer. Answer it from the material, say where it came from, or turn it into a `QST`/`ASM`. When the user is present and the answer is theirs to give, ask them.

**Draft.** Every record is Markdown with YAML frontmatter, an `anchor` (the one element it lives under), `rel` for relations, `[[ID]]` links in prose, and `##` sections the type names. Use the structured blocks (`pds-flow`, `pds-states`, `pds-attributes`, `pds-journey`, `pds-payload`, `gherkin`) where the type has them: the views are drawn from them. Details: `docs/03-authoring.md`; any rule or field: `pds explain NAME`.

**Check.** An error means fix it. A warning means fix it or explain it in the report. If `pds ask ID` still lists something for the rung you are working towards, you are not there.

## Style the checks look for

- A summary is one sentence, 200 characters at most, and says more than the title. A title is 80 characters at most with no final full stop.
- A requirement is one sentence with "shall", opening with The, When, While, If or Where, stating one thing; a quality requirement carries a number or a threshold.
- No vague words (`fast`, `easy`, `intuitive`, `robust`, `seamless`, `user-friendly`, `flexible`, `scalable`, `appropriate`) in requirements, rules or definitions without a measure. No `TBD`, `TODO`, `XXX`, lorem ipsum or unfilled `<placeholder>` in anything that claims `specified`.
- A rule has worked examples (case, given, then) before it counts as specified.
- A flow of an important or critical feature has a failure or abort end as well as a success end.
- A word a glossary term lists as one to avoid is not used.

Beyond the checks: write in the product's own words, keep a `TERM` for each word of the domain and use it, and leave the long tail until the top is outlined.

## Report

End every session with:

- **Written:** the records, and how far each now reaches.
- **Sources:** which statements are from the material, which are your reading of it.
- **Assumed:** each `ASM` added.
- **Unknown:** each `QST` added; which block.
- **For a person:** skeletons to confirm, tiers to review, units to approve (`pds approve ID --by NAME`, run by them).
- **Checks:** errors and warnings left, and why.

## Recovering an existing product

Start from what is observable (screens, plans, roles, the schema, the messages sent, the third parties called), outline each, then group upward into features, capabilities and domains. Write flows by walking the running product, not from memory or the code. Mark recovered records `origin: import`. Where you cannot find out, leave a stub and a `QST`. Details: `docs/06-procedures.md`.

## More

`docs/04-validation.md` (what the checks mean), `docs/06-procedures.md` (Define, Recover, Evolve), `docs/07-agents.md` (why these rules).
