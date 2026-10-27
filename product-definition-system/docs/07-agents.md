# 07. Working with agents

A product definition is mostly writing, and writing is what agents do fast. The risk is the other side of the same thing: an agent can fill every field of every template with something plausible, and **plausible is exactly what a definition must not be**. A definition says what the product *is*, what it *must do*, and what has been *decided*. An agent knows none of that unless somebody told it.

So the system is built around one rule:

> **Agents draft and check. People decide, confirm and approve.**

Everything below follows from it. The tool makes the line enforceable where it can, visible where it cannot, and honest about the difference.

## 1. The surface an agent uses

Agents use the same commands as people. A few have a machine-readable form.

| Need | Command |
|---|---|
| Where does the definition stand | `pds status --json` |
| What should be written next | `pds next --json --limit N` |
| The questions for one element | `pds ask ID` (`--all` for every rung) |
| Is it well formed | `pds lint --json --element ID` (omit `--element` for everything) |
| What does a rule, a check, a type, a relation mean | `pds explain NAME` |
| What would a change reach | `pds impact ID --json` |
| Make a record from its template | `pds new TYPE "Title" --anchor ID` |
| Rename safely | `pds rename OLD NEW` |
| Regenerate the pictures and specifications | `pds views` |

`pds next --json` returns the queue as a list. Each item names the element, its type and tier, the rung it is working towards, the rule that is unmet, the message, and **`ask`: the question to answer to satisfy it**. `pds lint --json` returns every finding with its id, severity, element, file and a hint. Both are stable enough to script against.

An agent does not need to know the meta-model in advance. The tool says what each record needs, in words, at the moment it is needed.

## 2. The limits that are enforced, and the ones that are asked

| Limit | How | Strength |
|---|---|---|
| **An agent cannot approve** | With `PDS_AGENT` set in the environment, `pds approve` refuses outright, even with `--force` | A tripwire. It stops the accident; see §4 for what it does not stop |
| **Only listed people can approve** | `approvers` in `pds.yaml`. `pds approve` refuses anyone else, and a hand-written approval by an unlisted name, or without a matching content hash, is an error (`GOV-approval-authority`, `GOV-approval-hash`) | Enforced by the tool, short of deliberate forgery (§4) |
| **A claim above support is an error** | An element that claims `specified` and does not support it fails `pds lint` (`GOV-claim`) | Enforced by the tool |
| **A skeleton is not a decision** | Capped at `outlined` until someone sets `origin: human` | Enforced; but see below |
| **An approval is bound to content** | Edit anything it covers and it goes stale | Enforced |
| **`pds.yaml` is human-owned** | Approvers, policy and waivers live there. An agent that edits it can silence a check | Asked. Protect it in review |
| **Facts are not invented** | An agent that does not know writes a question, not an answer | Asked. Reviewed for |
| **Generated views are not edited** | They begin with a banner, and the next `pds views` overwrites them | Self-correcting |

What the first two rows protect is the *record of who accepted what*. What the rest protect is that a gap looks like a gap.

## 3. The protocol

The protocol is [a skill](../skills/pds-define/SKILL.md) an agent can load. In outline:

1. **Orient.** `pds status` and `pds lint`. Read `pds.yaml`, never edit it.
2. **Choose.** Take the head of `pds next` (or the element the person named). One element at a time.
3. **Interview.** `pds ask ID` lists what the element still lacks and the question that gets it written. For each question, either the answer is **in the material you have been given** (a document, the code, the person's words), or it is not.
   - If it is, write it, and say where it came from.
   - If it is not, **do not write one.** Write a `QST` (an open question, `blocking: true` if building would depend on the answer) or, where a working guess is useful, an `ASM` (an assumption, with `validate_before`, the date it must be settled by). Either is a *visible* hole, counted and listed. A guess in the body text is an invisible one.
4. **Draft.** `pds new` for a new record, or edit one. Use the structured blocks where they exist. Link with `[[ID]]`.
5. **Check.** `pds lint --element ID`. Fix what it says. Run `pds ask ID` again: is the rung reached?
6. **Mark the origin.** Records an agent wrote are `origin: agent`. Leave `origin: human` for a person to set, once they have read it.
7. **Repeat** until the target, then **report**.

### What to hand back

A report is how a person knows what to read. It should say, briefly:

- **What was written**: the records, and how far each now reaches.
- **What was taken from where**: which statements come from the material, and which are the agent's reading of it.
- **What was assumed**: each `ASM` added.
- **What is unknown**: each `QST` added, and which are blocking.
- **What needs a person**: skeletons to confirm, tier assignments to review, approvals to give.
- **What the checks said**: errors and warnings left, with the reason for each.

## 4. What the tripwire does and does not do

`PDS_AGENT` makes the approve command refuse. It does **not**:

- stop an agent that unsets the variable, or writes the record's `approval` block by hand with a listed approver's name and a correct hash. A hand-written approval that is careless fails `pds lint`; one that is careful does not, because an approval is a few lines of frontmatter and anything that can write a file can write them;
- stop an agent from setting `origin: human`;
- stop an agent from editing `pds.yaml`.

Those are caught the way any change is caught: **in review**. An approval, an origin flip, a new waiver or a new approver is a visible line in a diff, and the diff of `pds.yaml` is short. The practical protections are ordinary ones:

- set `PDS_AGENT=1` in the environment the agent runs in, so the *honest* path is closed;
- require a review for any change that touches `approval:`, `origin:` or `pds.yaml` (a code-owners rule on `pds.yaml` costs one line);
- have the person who approves run `pds approve` themselves, on their own machine, after reading the specification (`pds spec ID` assembles it);
- read the report, then spot-check three records against what you know.

None of this is clever. It is the point: the system's guarantees are **that gaps are visible and attributable**, not that no one can lie.

## 5. Where agents are strong, and where they are not

| Strong | Be careful |
|---|---|
| Turning a pasted document, a transcript or a codebase into outlined records quickly | Anything that depends on a fact not in the material: prices, limits, legal duties, what the business wants |
| Writing the long tail: states, messages, edge cases, validation rules | Rules with money, access or data loss in them. Draft, then have a person read every word |
| Keeping the whole consistent: renames, anchors, relations, glossary words | Choosing what is *critical*. Tier is a judgement about risk and cost |
| Running the interview: asking the next question in the queue | Deciding that a question does not matter, so that it need not be answered |
| Checking: `lint`, `impact`, `views --check` | Declaring a feature "done". The tool says what is supported; a person says it is right |
| Recovering a definition from an existing system, flow by flow | Recovering *intent*. Code says what the product does, not why |

**A caution on volume.** The failure to watch for is not an agent that writes nothing, but one that writes a great deal that nobody reads. The queue's order, the one-element-at-a-time loop and the report exist so that what a person has to read stays small. Approval is bound to a unit (a feature and what is under it), so that one reading signs off one specification.

## 6. Reviewing agent work

For the person on the other side. A review of a definition is not a review of structure; the tool did that. It is a review of **statements**.

1. Open the specification (`pds spec ID`) or the generated views, not the YAML. Read it as the person who would build from it.
2. Read every `ASM` and every `QST` the agent added. Are they the right ones? Is anything missing that you know is open?
3. Read the **rules and their examples**, and the numbers. These are where a plausible wrong answer does damage.
4. Walk **one flow** against the real product (or your head). Does it match?
5. Check the **tier** of what was added: is the critical really critical?
6. Look at the diff for `origin`, `approval` and `pds.yaml`.
7. Only then confirm, or approve.

## 7. Installing the skill

The skill is a folder, [`skills/pds-define/`](../skills/pds-define/SKILL.md). To make it available:

- **For one project**: copy it to `.cursor/skills/pds-define/` in the repository that holds the definition (or the equivalent location for your agent tool);
- **For every project**: copy it to your personal skills folder;
- **Without a skills feature**: paste its body into the agent's rules file, or point to it from the project's `AGENTS.md` ("To work on the definition, follow `skills/pds-define/SKILL.md`").

It declares `disable-model-invocation: true`, so it loads only when named. Remove that line if you want it picked up whenever someone talks about defining a feature in a project that has a `pds.yaml`.

The skill contains the protocol and the ground rules, and points here and to [authoring](03-authoring.md) for the rest. It is short on purpose: the tool teaches the details as it goes, and a long instruction is a long way to be wrong.
