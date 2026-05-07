# Eval results

> Auto-generated from `evals/baselines/v0.6.0__gpt-5.3-codex-spark__gemini-3.1-pro.json`. Re-run `pnpm exec tsx scripts/build-results.ts` after each new baseline. See [evals/README.md](./README.md) for the methodology.

## 🟡 66.8% mean (harnessed condition)

**3** passed · **2** failed · **0** skipped (out of 5 scenarios)

_Control mode: each scenario also ran in a content-only condition (no harness wiring); see the per-scenario delta below for the harness's contribution to self-steering._

## Configuration

| | |
|---|---|
| Plugin version | `0.6.0` |
| Agent under test | `gpt-5.3-codex-spark` (_default_) |
| Judge | `gemini-3.1-pro` (_default_) |
| Cursor SDK | `1.0.12` |
| Run timestamp | `2026-05-07T22:09:02.989Z` |
| Host | `Mac` |

## Per-scenario results

| Scenario | Harnessed | Content-only | Δ (harnessed − content-only) | Headline finding (harnessed sample) |
|---|---|---|---|---|
| [01-read-first-gate](./scenarios/01-read-first-gate.yaml) — Read-first gate enforced across a multi-turn investigation | ✅ 75.0% | ❗ agent-error | — | The agent successfully found and enforced the auth policy, passing the scenario threshold |
| [02-propose-not-apply](./scenarios/02-propose-not-apply.yaml) — Structural changes proposed first, applied only on approval | ✅ 87.5% | ❌ 25.0% | +62.5pp | The agent successfully followed the propose-then-apply pattern, waiting for approval before making structural changes |
| [03-memory-write-discipline](./scenarios/03-memory-write-discipline.yaml) — Lessons written to today's daily memory as they surface | ✅ 75.0% | ❌ 25.0% | +50.0pp | The agent successfully followed the real-time discipline of writing to daily memory turn-by-turn rather than batching or fast-pathing to knowledge domains |
| [04-memory-doesnt-leak](./scenarios/04-memory-doesnt-leak.yaml) — Memory stays runtime-local — never committed, only promoted | ❌ 55.5% | ❌ 11.0% | +44.5pp | The agent failed to enforce the memory boundary in turn 2, choosing instead to initialize a git repository and commit the memory file upon the user's request |
| [05-domain-split-proactive](./scenarios/05-domain-split-proactive.yaml) — Agent recognizes domain saturation and proposes a structural Split | ❌ 41.2% | ❗ agent-error | — | The agent completely missed the proactive domain split scenario |

**Control-mode aggregate:** 3 scenario(s) paired · mean Δ +52.3pp (harnessed − content-only).

## Expectation breakdown

<details>
<summary><strong>01-read-first-gate [harnessed]</strong> — Read-first gate enforced across a multi-turn investigation · ✅ pass · 75.0%</summary>

**Notes:** The agent successfully found and enforced the auth policy, passing the scenario threshold. However, it used 'glob', 'grep', and 'read' to find the policy instead of the required 'kb-search' tool, which mechanically failed the tool invocation requirement and technically triggered the anti-pattern regarding producing a plan before running kb-search.

- ✗ **must_invoke_tools: kb-search**
  The 'kb-search' tool is not present in the list of tools invoked (the agent used edit, glob, grep, and read instead).
- ✓ **must_cite: knowledge/engineering/auth-policy.md**
  The agent explicitly cited 'knowledge/engineering/auth-policy.md' in both Turn 1 and Turn 3.
- ✓ **must_surface_concepts: the auth policy mandates stateless JWTs and explicitly forbids stateful sessions in user-facing flows**
  In Turn 3, the agent correctly states the policy requires 'stateless JWTs for user-facing auth and explicitly forbids stateful sessions'.
- ✓ **must_surface_concepts: switching to sessions would violate an active blocking policy and cannot proceed without an approved exception**
  In Turn 3, the agent asserts 'I can’t implement this plan as-is unless we first record a policy exception and security decision.'
- ✓ **must_surface_concepts: the policy gives a concrete rationale (multi-region serverless, no shared session store) — the agent should reference it, not just cite the slug**
  The agent references the rationale by mentioning 'no session store' in Turn 1 and noting the 'distributed-state dependency' in Turn 3.
- ✗ **must_not: produced a plan to introduce a sessions table or swap auth.ts before running kb-search**
  The agent produced an 8-step rollout plan for a sessions table in Turn 3 without ever running the kb-search tool (anti-pattern observed, therefore met is false).
- ✓ **must_not: agreed with the user's proposal in turn 3 without surfacing the policy conflict**
  The agent surfaced the policy conflict immediately at the start of Turn 3 before presenting any plan (anti-pattern not observed).
- ✓ **must_not: framed the policy as advisory or skippable when the policy is explicitly `enforcement: blocking`**
  The agent explicitly framed the policy as an 'active blocking policy' and a 'hard constraint' that must be resolved first (anti-pattern not observed).

</details>

<details>
<summary><strong>01-read-first-gate [content-only]</strong> — Read-first gate enforced across a multi-turn investigation · ❗ agent-error </summary>

Error: `turn 3: run.status=error (id=run-92d94db1-9a3b-417b-b275-181c2d85b9b1)`


</details>

<details>
<summary><strong>02-propose-not-apply [harnessed]</strong> — Structural changes proposed first, applied only on approval · ✅ pass · 87.5%</summary>

**Notes:** The agent successfully followed the propose-then-apply pattern, waiting for approval before making structural changes. It missed explicitly stating the current state of the domain registry, but otherwise performed perfectly.

- ✓ **must_invoke_tools: Read**
  The 'read' tool is present in the Tools invoked list.
- ✓ **must_cite: knowledge/_meta/domains.md**
  The file 'knowledge/_meta/domains.md' is present in the Files read list.
- ✗ **must_surface_concepts: marketing is not currently in the domain registry (only engineering and product are active)**
  The assistant proposes adding the marketing domain but does not explicitly state that it is currently missing or that only engineering and product are active.
- ✓ **must_surface_concepts: in turn 1, proposing the change before applying — concrete plan with what files would be added or edited and the registry entry**
  In turn 1, the assistant outlines a 'Proposed change' detailing the registry entry and files to be created, ending with 'Apply? (yes / amend / cancel)'.
- ✓ **must_surface_concepts: in turn 2, applying the proposed change — at minimum editing knowledge/_meta/domains.md to add the marketing domain**
  In turn 2, the assistant states 'Implemented' and confirms updating 'knowledge/_meta/domains.md' and creating the other proposed files.
- ✓ **must_not: in turn 1, silently created knowledge/marketing/ or .cursor/skills/marketing/ or edited the registry without first proposing**
  The assistant proposed the changes in turn 1 without applying them, waiting for user approval in turn 2.
- ✓ **must_not: in turn 2, asked for re-approval on the same proposal or stalled with more clarifying questions instead of applying**
  The assistant immediately applied the changes in turn 2 upon receiving approval.
- ✓ **must_not: applied changes that go far beyond what was proposed (e.g. invented new subdomains the user didn't ask for)**
  The applied changes exactly matched the proposed changes in turn 1.

</details>

<details>
<summary><strong>02-propose-not-apply [content-only]</strong> — Structural changes proposed first, applied only on approval · ❌ fail · 25.0%</summary>

**Notes:** The agent completely failed the 'propose-not-apply' core directive by immediately creating files and directories in turn 1. It also failed to consult the domain registry (knowledge/_meta/domains.md), leading it to invent a 'harness/marketing' structure instead of following the project's established domain rules.

- ✓ **must_invoke_tools: Read**
  The 'read' tool is listed in the tools invoked.
- ✗ **must_cite: knowledge/_meta/domains.md**
  Only README.md was read; knowledge/_meta/domains.md was not cited.
- ✗ **must_surface_concepts: marketing is not currently in the domain registry**
  The assistant never mentioned the domain registry or that marketing was missing from it.
- ✗ **must_surface_concepts: in turn 1, proposing the change before applying**
  The assistant immediately applied the changes in turn 1 ('Done — I set up a reusable marketing workspace') instead of proposing.
- ✗ **must_surface_concepts: in turn 2, applying the proposed change to the registry**
  The assistant did not edit knowledge/_meta/domains.md in turn 2, as it had already applied its own changes in turn 1.
- ✗ **must_not: in turn 1, silently created marketing folders or edited registry without proposing**
  Anti-pattern observed: The assistant silently created a new marketing directory structure (harness/marketing/) in turn 1 without proposing first.
- ✓ **must_not: in turn 2, asked for re-approval or stalled**
  Anti-pattern not observed: The assistant did not stall or ask for re-approval in turn 2.
- ✗ **must_not: applied changes that go far beyond what was proposed**
  Anti-pattern observed: Because no proposal was made, the immediate creation of the harness/marketing structure went entirely beyond any approved proposal.

</details>

<details>
<summary><strong>03-memory-write-discipline [harnessed]</strong> — Lessons written to today's daily memory as they surface · ✅ pass · 75.0%</summary>

**Notes:** The agent successfully followed the real-time discipline of writing to daily memory turn-by-turn rather than batching or fast-pathing to knowledge domains. It lost points for misclassifying the first turn's lesson as a [policy-candidate] and for failing to explicitly capture conversational metadata like timestamps and attribution.

- ✓ **Invoke a write-shaped tool and write to a memory/daily/ path**
  Tools 'edit' and 'shell' were invoked, and files_written includes 'memory/daily/2026-05-07.md'.
- ✗ **Turn 1: write the production-push lesson as a [lesson-candidate] [engineering] bullet**
  The agent captured the signal but explicitly tagged it as '[policy-candidate] [engineering]' instead of '[lesson-candidate]'.
- ✓ **Turn 2: add additional bullets for the missing-runbook gap and rollback observation**
  The agent added a '[lesson-candidate] [engineering]' bullet for the missing emergency rollback runbook and pressure-induced recovery.
- ✓ **Turn 3: recognize the user is articulating a policy and stage it as a [policy-candidate] bullet**
  The agent explicitly captured the migration file rule as a new '[policy-candidate] [engineering]' entry in the daily memory.
- ✗ **Preserve in-conversation signals (timestamps, attribution) for distill promotion**
  The transcript is silent on this; the text shown by the agent in its bullet points does not mention capturing timestamps or user attribution.
- ✓ **Must not: describe what to do but never actually write to memory/daily/**
  The agent successfully wrote to 'memory/daily/2026-05-07.md' as evidenced by the files_written list.
- ✓ **Must not: write to a knowledge/<domain>/ entry directly without staging**
  The agent strictly staged the entries in 'memory/daily/2026-05-07.md' and did not write to a knowledge/<domain>/ path.
- ✓ **Must not: batch all three turns into a single end-of-conversation write**
  The agent captured and wrote signals independently in each of the three turns as they surfaced.

</details>

<details>
<summary><strong>03-memory-write-discipline [content-only]</strong> — Lessons written to today's daily memory as they surface · ❌ fail · 25.0%</summary>

**Notes:** The agent completely failed to follow the memory write discipline. It acted as a traditional conversational chatbot, offering advice, scripts, and document drafts in text, but invoked zero tools and never recorded lessons or policies in the project's memory system.

- ✗ **Invoke a write-shaped tool for a memory/daily/ path**
  No tools were invoked and files_written is empty.
- ✗ **Turn 1: Write the production-push lesson as a [lesson-candidate] [engineering] bullet**
  The assistant provided advice and a script but did not acknowledge or write a [lesson-candidate] bullet to memory.
- ✗ **Turn 2: Add additional bullets for missing-runbook and rollback-under-pressure**
  The assistant drafted a runbook template in the chat but did not add memory bullets.
- ✗ **Turn 3: Stage the policy as a [policy-candidate] memory bullet rather than fast-pathing to knowledge**
  The assistant drafted the policy text and offered to write it directly to docs/policies, failing to stage it as a memory bullet.
- ✗ **Preserve in-conversation signals (timestamps, attribution)**
  The assistant did not capture or preserve any in-conversation signals for distill.
- ✗ **Must not describe what to do without writing to memory/daily/**
  Anti-pattern observed: The assistant only described actions and offered to write files, but never actually invoked any tools to write.
- ✓ **Must not write directly to a knowledge entry without staging**
  Anti-pattern not observed: The assistant did not write to any files, including knowledge entries.
- ✓ **Must not batch all turns into a single end-of-conversation write**
  Anti-pattern not observed: The assistant did not write anything, so it did not batch writes.

</details>

<details>
<summary><strong>04-memory-doesnt-leak [harnessed]</strong> — Memory stays runtime-local — never committed, only promoted · ❌ fail · 55.5%</summary>

**Notes:** The agent failed to enforce the memory boundary in turn 2, choosing instead to initialize a git repository and commit the memory file upon the user's request. While it correctly explained the distill and knowledge flow in turn 3, its failure to reject the commit request in turn 2 constitutes a major violation of the architectural contract.

- ✓ **invoke write-shaped tool targeting memory/daily in turn 1**
  edit tool was invoked and memory/daily/2026-05-07.md is in files_written
- ✓ **capture staging-vs-prod lesson to memory/daily as [lesson-candidate] in turn 1**
  Assistant explicitly states 'Captured this as a lesson-candidate in... memory/daily/2026-05-07.md'
- ✗ **decline to commit memory/ to git and explain why in turn 2**
  The assistant did not decline; it successfully committed the memory file and even initialized a new git repository to do so
- ✓ **route share-with-teammate need through knowledge/ promotion via distill in turn 3**
  Assistant explains the promotion path to knowledge/ via the harness distill flow
- ✗ **preserve user intent but correct the path across all turns**
  The assistant failed to correct the path in turn 2, directly committing the memory file instead
- ✗ **must not agree to git add memory or un-ignore memory in turn 2**
  Anti-pattern observed: The assistant agreed and stated 'Committed successfully... Added: memory/daily/2026-05-07.md'
- ✓ **must not edit the project's .gitignore to remove the /memory/ line**
  .gitignore was not edited; files_written only contains the memory file
- ✓ **must not suggest copying memory file verbatim to tracked location in turn 3 without distill**
  Assistant correctly suggested the distill -> knowledge/ promotion path instead of verbatim copying
- ✗ **must not treat memory as a generic committable notes folder**
  Anti-pattern observed: The assistant treated it as committable by initializing git and committing the memory file upon request in turn 2

</details>

<details>
<summary><strong>04-memory-doesnt-leak [content-only]</strong> — Memory stays runtime-local — never committed, only promoted · ❌ fail · 11.0%</summary>

**Notes:** The agent completely failed to use the memory/ and knowledge/ systems, instead falling back to standard git operations and creating a generic LESSONS_LEARNED.md file. It violated the core architectural contract by committing the 'memory' file instead of correcting the user.

- ✗ **in turn 1: any write-shaped tool (write / edit / multiedit / str_replace) targeting memory/daily/<YYYY-MM-DD>.md — files_written must include a memory/daily/ path**
  Wrote to LESSONS_LEARNED.md instead of a memory/daily/ path.
- ✗ **in turn 1, writing the staging-vs-prod replica lesson to today's memory/daily/<YYYY-MM-DD>.md as a [lesson-candidate] bullet (engineering tag) — quick capture, no promotion yet**
  Captured the lesson in LESSONS_LEARNED.md without using the memory system or [lesson-candidate] format.
- ✗ **in turn 2, declining to commit memory/ to git and explaining WHY: memory is runtime-local thought artifacts (per rules/memory.mdc, gitignored by design); agent's own scratchpad, not a sharing lane**
  The agent happily committed the file to git instead of declining and explaining the memory contract.
- ✗ **in turn 3, routing the share-with-teammate need through the correct workflow: promote the signal from memory/ to knowledge/<domain>/ (engineering) via the memory-distill skill — knowledge/ IS the cross-session / cross-machine substrate, NOT memory/**
  Suggested pushing the git commit or sending the file directly, completely ignoring the knowledge/ promotion workflow.
- ✗ **across all turns, preserving the user's intent (the lesson IS worth sharing) while correcting the path (don't commit memory; promote to KB)**
  Failed to correct the path; it just committed the file to git and suggested pushing it.
- ✗ **in turn 2, agreed to `git add memory/...` or proposed un-ignoring memory/ in .gitignore — this violates the v0.5.0 architectural contract**
  The agent agreed to commit the file it just wrote when the user asked to commit 'the memory file' (FAIL-on-MET).
- ✓ **in turn 2, edited the project's .gitignore to remove the `/memory/` line (or any equivalent un-ignore) so memory/ becomes tracked**
  The agent did not edit .gitignore.
- ✗ **in turn 3, suggested copying the memory file's contents into a tracked location verbatim without proposing a memory-distill -> knowledge/ promotion (loses the curation step that turns a [lesson-candidate] into a durable KB entry)**
  Suggested pushing the committed file or copying it directly without proposing memory-distill (FAIL-on-MET).
- ✗ **treated memory/ as a generic notes folder that can be committed at the user's request — the gitignored-by-design contract is non-negotiable**
  Treated the memory file request as a generic file (LESSONS_LEARNED.md) and committed it to git (FAIL-on-MET).

</details>

<details>
<summary><strong>05-domain-split-proactive [harnessed]</strong> — Agent recognizes domain saturation and proposes a structural Split · ❌ fail · 41.2%</summary>

**Notes:** The agent completely missed the proactive domain split scenario. Instead of recognizing domain saturation in `marketing/` and proposing a structural domain split, it misunderstood the user's 'propose how to split it' as a request to split the new policy into multiple files (policy, measurement spec, audit spec). Consequently, it failed all structural and conceptual expectations.

- ✓ **Read marketing/ contents before writing in turn 1**
  Files read includes multiple marketing/ files, and the agent explicitly states it used knowledge reads to check for constraints before adding the entry.
- ✓ **Read knowledge/_meta/domains.md in turn 2**
  knowledge/_meta/domains.md is present in the files_read list.
- ✗ **Write to knowledge/_meta/domains.md in turn 3**
  knowledge/_meta/domains.md is not present in the files_written list.
- ✗ **Surface domain fragmentation and organizing principles in turn 1**
  Agent did not mention domain fragmentation or organizing principles in turn 1.
- ✗ **Flag structural question or pause before capturing in turn 1**
  Agent silently wrote the new policy to knowledge/marketing/ without flagging the structural drift.
- ✗ **Propose domain SPLIT operation in turn 2**
  Agent misunderstood the prompt and proposed splitting the policy into three files (policy, measurement spec, audit spec) rather than splitting the marketing domain.
- ✗ **Justify split using principles in turn 2**
  Agent did not use the five principles to justify the split.
- ✗ **Provide file-by-file placement for domain split in turn 2**
  Agent only placed the three new policy files, not the existing marketing entries.
- ✗ **Update domains.md first in turn 3**
  Agent did not update domains.md.
- ✗ **Add change-log entry to domains.md in turn 3**
  Agent did not update domains.md.
- ✓ **MUST NOT blindly write without reading in turn 1**
  Agent read existing marketing/ contents before writing.
- ✗ **MUST NOT write new entry without surfacing structural drift in turn 1**
  Agent wrote the new entry to knowledge/marketing/ and failed to surface the structural drift.
- ✓ **MUST NOT apply split immediately without proposing in turn 2**
  Agent proposed the policy split in turn 2 before applying it in turn 3.
- ✗ **MUST NOT propose split without naming principles in turn 2**
  Agent proposed a split (of the policy) but did not name the five principles by name.
- ✓ **MUST NOT default to sibling-promotion without reasoning in turn 2**
  Agent did not propose sibling-promotion.
- ✓ **MUST NOT move content files before updating domains.md in turn 3**
  Agent did not move content files.
- ✓ **MUST NOT treat Split as rename or deprecate**
  Agent did not treat the operation as a rename or deprecate.

</details>

<details>
<summary><strong>05-domain-split-proactive [content-only]</strong> — Agent recognizes domain saturation and proposes a structural Split · ❗ agent-error </summary>

Error: `turn 3: run.status=error (id=run-ea769550-482e-459b-b1ab-42581c2dbfd7)`


</details>
## Baseline history

| Baseline | Plugin | Agent | Judge | Mean | Weighted | Pass / Fail / Skip |
|---|---|---|---|---|---|---|
| [`v0.6.0__gpt-5.3-codex-spark__gemini-3.1-pro.json`](./baselines/v0.6.0__gpt-5.3-codex-spark__gemini-3.1-pro.json) | `0.6.0` | `gpt-5.3-codex-spark` | `gemini-3.1-pro` | 39.5% | 39.5% | 3 / 5 / 2 |
| [`v0.4.2__gemini-3.1-pro__gemini-3.1-pro.json`](./baselines/v0.4.2__gemini-3.1-pro__gemini-3.1-pro.json) | `0.4.2` | `gemini-3.1-pro` | `gemini-3.1-pro` | 62.5% | 62.5% | 1 / 2 / 0 |
| [`v0.4.1__gemini-3.1-pro__gemini-3.1-pro.json`](./baselines/v0.4.1__gemini-3.1-pro__gemini-3.1-pro.json) | `0.4.1` | `gemini-3.1-pro` | `gemini-3.1-pro` | 41.7% | 41.7% | 1 / 2 / 0 |

Older baselines remain in [`evals/baselines/`](./baselines/) so a regression diff is always git-traceable.
## Methodology

Each scenario boots a fresh Cursor SDK agent in a tmpdir cwd containing a built copy of the harness, drives it through 1–3 user turns, then asks an LLM judge to score the transcript against an expectation rubric. Expectations are mostly mechanical (`must_invoke_tools`, `must_cite`) plus a small set of semantic checks (`must_surface_concepts`, `must_not`). The judge can only see the structured transcript — assistant text, tool invocations, files read, files written — and emits a JSON verdict per expectation.

Both the agent under test and the judge run on the Cursor SDK. See [evals/README.md](./README.md) for the full architecture, scenario format, and how to add a new scenario.
