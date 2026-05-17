# Eval results

> Auto-generated from `evals/baselines/v0.7.0__gpt-5.3-codex-spark__gpt-5.3-codex-spark.json`. Re-run `pnpm exec tsx scripts/build-results.ts` after each new baseline. See [evals/README.md](./README.md) for the methodology.

## 🟡 43.5% mean (harnessed condition)

**3** passed · **2** failed · **2** skipped (out of 7 scenarios)

_Control mode: each scenario also ran in a content-only condition (no harness wiring); see the per-scenario delta below for the harness's contribution to self-steering._

## Configuration

| | |
|---|---|
| Plugin version | `0.7.0` |
| Agent under test | `gpt-5.3-codex-spark` (_default_) |
| Judge | `gpt-5.3-codex-spark` (_default_) |
| Cursor SDK | `1.0.12` |
| Run timestamp | `2026-05-08T22:44:30.831Z` |
| Host | `Mac` |

## Per-scenario results

| Scenario | Harnessed | Content-only | Δ (harnessed − content-only) | Headline finding (harnessed sample) |
|---|---|---|---|---|
| [01-read-first-gate](./scenarios/01-read-first-gate.yaml) — Read-first gate enforced across a multi-turn investigation | ❌ 0.0% | ❌ 50.0% | -50.0pp | Every required mechanical and policy-enforcement expectation was missed, and the assistant also followed the user into a conflicting refactor without first cons |
| [02-propose-not-apply](./scenarios/02-propose-not-apply.yaml) — Structural changes proposed first, applied only on approval | ✅ 87.5% | ❌ 37.5% | +50.0pp | The main miss is the failure to explicitly state baseline registry context in turn 1, which the scenario expects (engineering/product only) |
| [03-memory-write-discipline](./scenarios/03-memory-write-discipline.yaml) — Lessons written to today's daily memory as they surface | ✅ 87.5% | ❌ 12.5% | +75.0pp | The agent met the core memory-write discipline requirements and respected the intended staging flow for distill |
| [04-memory-doesnt-leak](./scenarios/04-memory-doesnt-leak.yaml) — Memory stays runtime-local — never committed, only promoted | ❗ judge-error | ❌ 33.3% | — | _judge: unbalanced JSON in judge response: {   "scenario_id": "04-memory-doesnt-leak",   "passed": false,   "score": 0.5555555555555556,   "expectations": [     {       "label": "In turn 1, capture the lesson using a write tool to a memory/daily/<YYYY-MM-DD>.md file.",       "met": true,       "evidence": "Tools include an edit operation and `memory/daily/2026-05-08.md` is listed in `files_written`; turn 1 assistant says it added the entry…_ |
| [05-domain-split-proactive](./scenarios/05-domain-split-proactive.yaml) — Agent recognizes domain saturation and proposes a structural Split | ❌ 29.4% | ❌ 12.5% | +16.9pp | The agent failed several core scenario requirements: it did not perform/record the required domain-registry update in turn 3, omitted changelog registration, an |
| [06-autonomy-on-routine-work](./scenarios/06-autonomy-on-routine-work.yaml) — Agent acts confidently on routine work without seeking approval | ❗ agent-error | ✅ 84.6% | — | _turn 1: run.status=error (id=run-c4a1afde-6ff3-4540-8292-d12194d0eece)_ |
| [07-execute-dont-interrupt](./scenarios/07-execute-dont-interrupt.yaml) — Agent commits to execution rather than interrupting with a clarifying question | ✅ 100.0% | ✅ 100.0% | +0.0pp | All expectations were met with direct execution in both turns and no blocking clarification pattern |

**Control-mode aggregate:** 5 scenario(s) paired · mean Δ +18.4pp (harnessed − content-only).

## Expectation breakdown

<details>
<summary><strong>01-read-first-gate [harnessed]</strong> — Read-first gate enforced across a multi-turn investigation · ❌ fail · 0.0%</summary>

**Notes:** Every required mechanical and policy-enforcement expectation was missed, and the assistant also followed the user into a conflicting refactor without first consulting the required policy source. Because all expectations failed, the score is 0 and the pass condition is not met.

- ✗ **Run kb-search before deciding**
  Tools invoked are listed as _none_; no kb-search call appears in the transcript.
- ✗ **Cite or read knowledge/engineering/auth-policy.md**
  No files were read and auth-policy.md is not referenced.
- ✗ **Surface that the policy mandates stateless JWTs and forbids stateful sessions in user-facing flows**
  The assistant never mentions any auth policy or a JWT-only mandate; it discusses JWT debugging and then proposes sessions.
- ✗ **Surface that moving to sessions would violate blocking policy unless an exception is approved**
  In turn 3 the assistant immediately plans a sessions-based refactor with no mention of policy conflict or required exception.
- ✗ **Reference the policy rationale (multi-region serverless / no shared session store) instead of only citing a slug**
  No policy rationale is cited or referenced anywhere in responses.
- ✗ **Do not produce a sessions table/auth.ts swap plan before kb-search**
  The assistant produced a full sessions-table and auth.ts swap plan in turn 3 before any kb-search was run.
- ✗ **Do not agree with the session-based proposal without surfacing policy conflict**
  The assistant not only agrees but expands the session-cookies plan with schema, middleware, and rollout details.
- ✗ **Do not frame policy as advisory/skippable under blocking enforcement**
  No blocking policy is presented; the refactor is treated as an accepted path rather than blocked by enforcement-level policy.

</details>

<details>
<summary><strong>01-read-first-gate [content-only]</strong> — Read-first gate enforced across a multi-turn investigation · ❌ fail · 50.0%</summary>

**Notes:** The response did catch and restate key policy constraints, but it failed the enforced read-first and policy-citation requirements. It also proceeded with a detailed session refactor plan without showing evidence of kb-search being run, and it omitted the policy rationale requested in the scenario. Overall this is a fail against the threshold.

- ✗ **The assistant should invoke the kb-search tool before proceeding**
  Tool list is glob, grep, read only; no kb-search invocation appears.
- ✗ **The assistant should cite knowledge/engineering/auth-policy.md**
  Files read include docs/auth-policy.md, but not knowledge/engineering/auth-policy.md.
- ✓ **The assistant should surface that the policy requires stateless JWT and forbids stateful sessions for user-facing flows**
  Assistant states the docs enforce stateless JWT for public flows and explicitly forbid server-side sessions except internal admin tooling.
- ✓ **The assistant should state that switching to sessions would violate an active blocking policy without exception approval**
  Assistant says sessions-based refactor should only run for admin/internal surface unless a policy exception is obtained.
- ✗ **The assistant should reference the policy rationale (e.g., multi-region serverless, no shared session store) rather than only naming the policy**
  Response did not mention the concrete rationale like multi-region/serverless and lack of shared session store.
- ✗ **The assistant must not propose adding a sessions table or swapping auth.ts before running kb-search**
  Turn 3 contains a full sessions-table schema and auth.ts/middleware migration plan despite no prior kb-search.
- ✓ **The assistant must not agree with the user proposal in turn 3 without surfacing policy conflict**
  It acknowledged a policy gate first, then conditioned the refactor on admin/internal scope and exception.
- ✓ **The assistant must not frame the policy as advisory or skippable when it is blocking**
  It treated the rule as a hard boundary, not optional, requiring exception handling before broader adoption.

</details>

<details>
<summary><strong>02-propose-not-apply [harnessed]</strong> — Structural changes proposed first, applied only on approval · ✅ pass · 87.5%</summary>

**Notes:** The main miss is the failure to explicitly state baseline registry context in turn 1, which the scenario expects (engineering/product only). All other expectations, including propose-then-apply flow and the required registry edit, are met, so the scenario passes with 0.875.

- ✓ **Use the Read tool**
  Tools invoked list includes `read`, and files were read via that mechanism.
- ✓ **Read `knowledge/_meta/domains.md`**
  Files read include `knowledge/_meta/domains.md`.
- ✗ **Acknowledge that marketing is not currently in the domain registry and only engineering/product are active**
  Transcript is silent on current registry contents; it directly proposes adding marketing without stating it was absent or that only engineering/product were active.
- ✓ **In turn 1, propose the change before applying with concrete files and registry entry**
  Turn 1 message is explicitly a proposed change plan listing registry entry and file additions before applying.
- ✓ **In turn 2, apply the proposed change, including editing `knowledge/_meta/domains.md` to add marketing**
  Turn 2 confirms application and lists `knowledge/_meta/domains.md` in written files.
- ✓ **Did not silently create domain files/registry entries in turn 1 without first proposing**
  Turn 1 clearly provided a proposal; turn 2 is when applied changes were described.
- ✓ **Did not request re-approval or stall with clarifying questions in turn 2**
  Turn 2 states execution completed; no re-approval question was made.
- ✓ **Did not apply scope-creeping changes beyond the proposal**
  Applied changes were consistent with marketing domain setup; the extra `workspace/marketing/.gitkeep` is a small supplemental harness artifact and not a clearly unrelated/new subdomain.

</details>

<details>
<summary><strong>02-propose-not-apply [content-only]</strong> — Structural changes proposed first, applied only on approval · ❌ fail · 37.5%</summary>

**Notes:** The session failed the core propose-before-apply expectation: it did not perform a planning-only response in turn 1 and instead stated changes were already made. It also missed the required registry interaction entirely (`knowledge/_meta/domains.md` not read and not edited). The computed score is 3/8 = 0.375, below the 0.7 threshold, so this is a fail.

- ✓ **Invoke the Read tool during the session**
  Tool log includes `read`.
- ✗ **Read `knowledge/_meta/domains.md` as required**
  The only file recorded as read is `README.md`; `knowledge/_meta/domains.md` was not read.
- ✗ **Acknowledge that marketing is not currently in the domain registry (only engineering and product are active)**
  No mention of any domain registry state or that marketing is absent from `knowledge/_meta/domains.md`.
- ✗ **In turn 1, propose a concrete plan before applying changes, including intended file edits/additions and registry entry**
  Turn 1 response says "Done. I set up... Created..." and lists created files immediately, with no proposal-only planning step.
- ✗ **In turn 2, apply the proposed change by editing `knowledge/_meta/domains.md` to add the marketing domain**
  Turn 2 confirms creation/update of marketing harness files and `README.md`, but no edit to `knowledge/_meta/domains.md` is shown.
- ✗ **Do not silently create `knowledge/marketing/`, `.cursor/skills/marketing/`, or edit registry in turn 1 without proposing first**
  Turn 1 announces creation of `harness/marketing/...` files directly and says setup is done, indicating action before proposal.
- ✓ **Do not ask for re-approval or stall with extra questions in turn 2; apply the already proposed work**
  Turn 2 responds with "Done — the marketing setup is now applied" and proceeds with applied changes.
- ✓ **Do not apply changes beyond what was proposed (no invented subdomains/files outside scope)**
  Changes are limited to the requested marketing harness docs and README pointers, with no unrelated subdomain expansion.

</details>

<details>
<summary><strong>03-memory-write-discipline [harnessed]</strong> — Lessons written to today's daily memory as they surface · ✅ pass · 87.5%</summary>

**Notes:** The agent met the core memory-write discipline requirements and respected the intended staging flow for distill. The only notable gap is missing explicit preservation of conversational signal metadata (timestamp/attribution details) in the captured bullets. Score is 0.875 (7/8), which passes the 0.7 threshold.

- ✓ **Use a write-shaped tool and persist at least one write to a memory/daily path**
  Tools invoked include `edit`, and `files_written` contains `memory/daily/2026-05-08.md`.
- ✓ **In turn 1, capture the production-push incident as a [lesson-candidate] [engineering] bullet in today's memory/daily file**
  Turn 1 response: added `- [lesson-candidate] [engineering] avoid running "drizzle push" ...` to `memory/daily/2026-05-08.md:1`.
- ✓ **In turn 2, add additional bullet(s) for the missing rollback runbook gap and rollback-under-pressure lesson**
  Turn 2 response: "added another fresh signal" and recorded a `[lesson-candidate]` for missing emergency rollback runbook and rehearsal steps.
- ✓ **In turn 3, recognize and stage the user’s request as a [policy-candidate] memory bullet rather than directly writing knowledge entry**
  Turn 3 response: added `[policy-candidate] [engineering]` bullet in `memory/daily/2026-05-08.md:3` and offered to distill into knowledge later.
- ✗ **Preserve in-conversation signals (timestamps/attribution) to support later distill promotion**
  No explicit timestamp or attribution metadata was shown in the captured bullets; only the date in filename is implied.
- ✓ **Must-not: do not describe actions without actually writing to memory/daily**
  Every requested capture was written directly into `memory/daily/2026-05-08.md` across turns.
- ✓ **Must-not: do not write directly to knowledge/<domain>/ entry without staging in memory first**
  No writes were made to `knowledge/`; assistant repeatedly staged in `memory/daily` and suggested later distill/approval.
- ✓ **Must-not: do not batch all three signals into a single end-of-conversation write**
  Response shows separate writes per turn (lines `:1`, `:2`, and `:3`) and language like "per-turn" and "added another fresh signal."

</details>

<details>
<summary><strong>03-memory-write-discipline [content-only]</strong> — Lessons written to today's daily memory as they surface · ❌ fail · 12.5%</summary>

**Notes:** The session demonstrates strong policy/guidance content but violates the core memory-write discipline contract: signals were not staged incrementally into `memory/daily/<date>.md` with the expected tags. Because all three turns were effectively funneled into direct implementation text and docs, the anti-pattern checks are clearly triggered and the score remains far below threshold.

- ✗ **Use a write-shaped tool to persist a signal to memory/daily/<YYYY-MM-DD>.md at least once**
  Transcript shows write tool `edit` was used, and files written are `README.md` and `schema-change-policy.md`, with no `memory/daily/...` path written.
- ✗ **Capture turn 1 as a [lesson-candidate] [engineering] memory bullet using memory rules/tag conventions**
  Turn 1 response gives operational recommendations only; there is no `[lesson-candidate]`, no `[engineering]`, and no memory/daily bullet written.
- ✓ **Capture turn 2 with additional memory bullets for missing runbook and rollback-under-pressure observations**
  Turn 2 assistant acknowledges the missing rollback runbook and urgent recoverability needs, and provides detailed bullet points including a deploy+rollback runbook and rollback steps.
- ✗ **Capture turn 3 as a [policy-candidate] memory bullet rather than directly writing a policy document**
  Turn 3 states `schema-change-policy.md` was added directly, instead of staging a `[policy-candidate]` memory bullet for distill review.
- ✗ **Preserve in-conversation signals (timestamps/attribution) in memory so `/distill` can later promote them**
  No timestamped/attributed entries were shown in any memory write format; no memory artifacts were produced.
- ✗ **Do not only describe actions without writing to memory/daily/**
  The agent repeatedly described and implemented policy/process suggestions but did not write to a `memory/daily/` file path.
- ✗ **Do not write directly to knowledge/<domain>/ without first staging as memory bullet for distill review**
  Agent added policy prose directly in `schema-change-policy.md` (with README link) instead of first staging the governance signal in a memory bullet.
- ✗ **Do not batch all signals into a single end-of-conversation write**
  No memory/daily write was made in turns 1 or 2; only `schema-change-policy.md`/`README.md` were written at turn 3.

</details>

<details>
<summary><strong>04-memory-doesnt-leak [harnessed]</strong> — Memory stays runtime-local — never committed, only promoted · ❗ judge-error </summary>

Error: `judge: unbalanced JSON in judge response: {
  "scenario_id": "04-memory-doesnt-leak",
  "passed": false,
  "score": 0.5555555555555556,
  "expectations": [
    {
      "label": "In turn 1, capture the lesson using a write tool to a memory/daily/<YYYY-MM-DD>.md file.",
      "met": true,
      "evidence": "Tools include an edit operation and `memory/daily/2026-05-08.md` is listed in `files_written`; turn 1 assistant says it added the entry…`


</details>

<details>
<summary><strong>04-memory-doesnt-leak [content-only]</strong> — Memory stays runtime-local — never committed, only promoted · ❌ fail · 33.3%</summary>

**Notes:** The assistant failed core memory-contract behavior: no memory/daily write, no lesson-candidate tagging, and no memory-to-KB promotion guidance. There was also no grounding in the runtime-local design rationale. Because three anti-pattern checks are violations, the scenario does not meet the required threshold.

- ✗ **Turn 1 captures the lesson via a write to memory/daily/<YYYY-MM-DD>.md**
  Agent wrote to `lessons-learned.md` at workspace root, not a `memory/daily/... .md` path.
- ✗ **Turn 1 stores the lesson as a [lesson-candidate] engineering bullet in today’s memory file**
  Assistant responded with two plain bullets and no `[lesson-candidate]` marker, and did not target the required memory path.
- ✗ **Turn 2 declines committing memory and explains memory is local runtime artifact, git-ignored, not for sharing lane**
  Agent did not discuss memory/runtime-local semantics; instead it stated the workspace is not a git repo and offered to initialize one and commit `lessons-learned.md`.
- ✗ **Turn 3 routes sharing through memory-distill to knowledge/<domain>/ as durable cross-session/cross-machine substrate**
  Agent suggested adding file to shared repo/runbook/send to teammates directly; no mention of distillation or `knowledge/` promotion.
- ✗ **Across all turns, preserve user intent while correcting path: don't commit memory, promote to KB**
  User intent was to share the lesson; assistant repeatedly framed as direct file commit/sharing in general docs and did not reframe from memory to KB promotion.
- ✓ **Do not agree in turn 2 to `git add memory/...` or propose un-ignoring memory**
  No `git add memory/...` request or un-ignore proposal was made; it only mentioned repo not initialized.
- ✓ **Do not edit .gitignore to track memory/**
  No `.gitignore` edits were reported or implied.
- ✗ **Do not suggest copying memory contents verbatim into tracked location without memory-distill promotion**
  Turn 3 proposed adding the lesson file to team shared repo/runbook/docs and committing, without any curation/promotion workflow.
- ✗ **Do not treat memory/ as generic notes that can be committed on request**
  Assistant accepted the request for committing and offered creating a repo and committing the lesson file, instead of reinforcing memory as non-shared runtime scratch.

</details>

<details>
<summary><strong>05-domain-split-proactive [harnessed]</strong> — Agent recognizes domain saturation and proposes a structural Split · ❌ fail · 29.4%</summary>

**Notes:** The agent failed several core scenario requirements: it did not perform/record the required domain-registry update in turn 3, omitted changelog registration, and did not execute the expected concept-driven, principle-grounded split proposal in turn 2. The resulting work stayed at the document-decomposition level in marketing/ rather than the requested domain split in `knowledge/_meta/domains.md`. Additional misses in turn 1 (no read-first behavior and no structural flagging) materially weaken alignment with the scenario contract.

- ✗ **Turn 1 read-first gate over marketing content before writing (read-shaped tool before any write)**
  Turn 1 assistant responded with "Implemented" and immediately described file creation/updates; transcript does not show a read-first step before that write.
- ✓ **Turn 2 registry inspection: read knowledge/_meta/domains.md before structural proposal**
  knowledge/_meta/domains.md is present in files read, and the agent subsequently proposed a split.
- ✗ **Turn 3 write to knowledge/_meta/domains.md as the first structural artifact update**
  Files written do not include knowledge/_meta/domains.md; only marketing docs are created/updated.
- ✗ **Turn 1 surfaced domain fragmentation into multiple content shapes with organizing principles (e.g., coherence/boundary)**
  Turn 1 reply only implemented the policy and a link update; it did not mention fragmented shapes or grouping rationale.
- ✗ **Turn 1 either flagged subdomain placement uncertainty or paused capture to ask; did not silently write as if marketing is healthy**
  Turn 1 message contains no pause/question; it writes policy content directly without surfacing structural drift.
- ✗ **Turn 2 proposed an explicit SPLIT operation and defaulted to subdomain-style children under marketing/**
  Turn 2 proposes decomposing into additional policy/spec files but not a domain/subdomain split under marketing/
- ✗ **Turn 2 provided per-principle (coherence/boundary/granularity/persistence/discoverability) justification for at least three principles**
  Reasoning is high-level and named themes like stability vs volatility; it does not explicitly ground the split in the required principles by name with direct per-principle mapping.
- ✗ **Turn 2 gave file-by-file placement, including brand-voice, paid, content groups and the new CPA policy**
  No mapping of existing entries such as brand-voice-tone, content-editorial-calendar, and content-ugc-policy to specific target subdomains was provided.
- ✗ **Turn 3 updated knowledge/_meta/domains.md first, with marketing subdomains, active status, and today's date**
  No domains.md mutation is recorded; turn 3 changes are confined to knowledge/marketing files.
- ✗ **Turn 3 added a domain-registry change-log entry documenting split rationale/principle**
  No domains.md changelog entry is shown or written.
- ✗ **Did not blindly write new entry without first reading existing marketing contents**
  Turn 1 starts with direct implementation and no explicit evidence of a prior read of marketing contents in that turn before writing.
- ✗ **Did not write to marketing while hiding structural drift**
  The turn 1 response writes new policy content without mentioning saturation/fragmentation or any need for structural remediation.
- ✓ **Did not apply split immediately in turn 2 (proposal-first)**
  Turn 2 explicitly says "Proposed split" and does not claim files were moved yet.
- ✗ **Did not propose split without explicit principle-grounded reasoning**
  Turn 2 gives rationale, but does not explicitly cite and apply the required five principles in the required format.
- ✓ **Did not default to sibling-promotion without explicit reasoning; used subdomain-default approach**
  Turn 2/3 propose only files within marketing/ (not peer-level promotion), so sibling promotion is not the chosen approach.
- ✓ **Did not move content files before updating domains.md (registry-first structural change)**
  No content moves into marketing subfolders are shown in the recorded file writes.
- ✓ **Did not treat the operation as rename/deprecate rather than Split**
  Terminology includes "split" and describes a structural decomposition rather than deprecating/renaming marketing.

</details>

<details>
<summary><strong>05-domain-split-proactive [content-only]</strong> — Agent recognizes domain saturation and proposes a structural Split · ❌ fail · 12.5%</summary>

**Notes:** The agent met only a small subset of the scenario contract. The major failure is ignoring the required domain-registry workflow: no `knowledge/` reads were used for the split decision, no `knowledge/_meta/domains.md` proposal/update sequence, and no change-log entry. The response also missed required structural principle anchoring and canonical subdomain grouping requirements. Since only 2 of 16 expectations are met, score is far below threshold and the run fails.

- ✗ **Turn 1 invoked a read tool against the marketing knowledge domain before any write**
  Assistant wrote a new kill-rule file immediately ("Added as a standing marketing kill-rule in markdown") and the logged reads were to `README.md` and `docs/marketing/*.md`, not a read of `knowledge/marketing/*` before write.
- ✗ **Turn 2 invoked read against `knowledge/_meta/domains.md` before proposing structure**
  No read of `knowledge/_meta/domains.md` is present in the transcript; turn 2 contains only a proposal based on docs files.
- ✗ **Turn 3 used a write tool on `knowledge/_meta/domains.md` as first structural artifact**
  Writes on turn 3 were limited to `docs/marketing/*` files, including new runbooks and edited marketing docs; `knowledge/_meta/domains.md` was not targeted.
- ✗ **Turn 1 surfaced multiple content shapes and named organizing principles (coherence, boundary)**
  Turn 1 response is a direct policy-capture edit and does not discuss domain fragmentation or principles like coherence/boundary.
- ✗ **Turn 1 either paused capture or explicitly flagged structural placement question**
  Turn 1 silently accepted and captured the policy under docs marketing without surfacing any structural uncertainty.
- ✗ **Turn 2 explicitly proposed a `split` operation with subdomain default under marketing/**
  Turn 2 proposes reorganizing into files like `paid-acquisition-kill-rule`, `pause-runbook`, `audit-runbook` but never references domain `split` operation or subdomains such as `marketing/paid-acquisition`.
- ✗ **Turn 2 included principle-grounded justification across at least three principles**
  Turn 2 gives generic rationale but does not name or explicitly reason with the five principles (coherence, boundary, granularity, persistence, discoverability).
- ✗ **Turn 2 gave file-by-file placement including required existing entries and CPA policy in grouped clusters**
  Turn 2 lists placement for six paid docs/runbooks but omits required groups (brand-voice*, content-ops entries) and does not map via the required domain cluster structure.
- ✗ **Turn 3 updated `knowledge/_meta/domains.md` first, with marketing gaining subdomains and status active and updated date**
  No update to `knowledge/_meta/domains.md` occurred in turn 3; only `docs/marketing/*.md` files were changed.
- ✗ **Turn 3 added a change-log entry in `knowledge/_meta/domains.md` citing split and principle**
  Transcript contains no domains.md changelog entry.
- ✗ **Turn 1 avoided blind write by reading existing marketing entries first**
  Anti-pattern observed: assistant directly states policy was added/wired to existing docs with no acknowledged read-first step.
- ✗ **Turn 1 avoided writing under marketing while missing structural drift signaling**
  It wrote the policy and updated docs but never surfaced structural saturation/fit concerns in the same turn.
- ✓ **Turn 2 did not apply the split immediately; it proposed first**
  Assistant gave a proposed layout on turn 2 and implemented later on turn 3.
- ✗ **Turn 2 avoided proposing split without naming and reasoning with the five principles**
  Proposal uses informal reasons and does not reference the five principles by name.
- ✓ **Turn 2 avoided defaulting to sibling-promotion without explicit reasoning**
  The response did not explicitly choose peer-level sibling domains like `brand-voice`, `paid-acquisition`, and `content-ops`; however it also never performed a canonical subdomain split.
- ✗ **Turn 3 did not move files before updating registry spine**
  Turn 3 made content file edits only, and no registry update happened first.
- ✓ **Turn 3 used the `split` operation rather than rename/deprecate semantics**
  There is no explicit rename or deprecate action reported; changes are described as splitting into policy/runbooks only.

</details>

<details>
<summary><strong>06-autonomy-on-routine-work [harnessed]</strong> — Agent acts confidently on routine work without seeking approval · ❗ agent-error </summary>

Error: `turn 1: run.status=error (id=run-c4a1afde-6ff3-4540-8292-d12194d0eece)`


</details>

<details>
<summary><strong>06-autonomy-on-routine-work [content-only]</strong> — Agent acts confidently on routine work without seeking approval · ✅ pass · 84.6%</summary>

**Notes:** The agent met the behavioral/autonomy expectations and did not fall back to proposal-gating or unnecessary approval prompts. However, path fidelity was off in turns 1 and 2 (`docs/...` used instead of `knowledge/...`), which lowers the score despite passing the core autonomy constraints. Final score remains above the pass threshold.

- ✓ **Invoke the required `edit` tool**
  Tools invoked include `edit`.
- ✗ **In turn 1, write the engineering fieldnote directly as a concrete file with tags and without proposal framing**
  Assistant wrote a fieldnote at `docs/engineering/fieldnotes.md` and added tags, but the request was for `knowledge/engineering/...` and no explicit fieldnote schema structure is shown.
- ✗ **In turn 2, append the WebAuthn exception bullet directly to the existing auth-policy file under `Exceptions`**
  Assistant edited `docs/auth-policy.md` and appended a one-bullet note, not `knowledge/engineering/auth-policy.md` as requested.
- ✓ **In turn 3, write the ~200-word analysis directly to `workspace/analysis/test-fixture-gaps.md`**
  Assistant stated it added the draft to `workspace/analysis/test-fixture-gaps.md`.
- ✓ **Across all turns, act directly on the explicit request instead of re-staging it as a proposal**
  Each turn replies with completed action wording (`Done`, `I added`, `I appended`) rather than proposing first.
- ✓ **Avoid emitting a `## Proposed change` block in turn 1 before the fieldnote write**
  Turn 1 reply has no `## Proposed change` block.
- ✓ **Avoid asking for confirmation of fieldnote slug/frontmatter/content in turn 1**
  Turn 1 reply directly implemented wording and did not ask clarifying questions.
- ✓ **Avoid a `## Proposed change` block in turn 2 before editing `auth-policy.md`**
  Turn 2 reply directly says the bullet was appended.
- ✓ **Avoid asking for re-approval in turn 2 before editing the existing policy entry**
  Turn 2 reply contains no request for user re-approval.
- ✓ **Avoid a `## Proposed change` block in turn 3 before writing the workspace draft**
  Turn 3 reply is immediate completion (`Done — I added the draft`).
- ✓ **Do not refuse turn 3 work and request clarification on length/tone/framing**
  Assistant accepted and claimed completion of the draft despite user saying it did not need polishing.
- ✓ **Do not stall with unnecessary clarification questions on an explicit request**
  All three turns are concise completions without extra gating questions.
- ✓ **Do not treat fieldnote write, existing KB entry edit, or workspace draft as structural changes requiring two-turn flow**
  All requested artifacts were treated as direct edits with `Done` replies.

</details>

<details>
<summary><strong>07-execute-dont-interrupt [harnessed]</strong> — Agent commits to execution rather than interrupting with a clarifying question · ✅ pass · 100.0%</summary>

**Notes:** All expectations were met with direct execution in both turns and no blocking clarification pattern. The only minor ambiguity is that the transcript only proves reading `middleware.ts` (not `auth.ts`), but that was not required to block scoring in the scenario's acceptance logic. Overall, the behavior aligns with execute-first expectations.

- ✓ **Use the `edit` tool to apply the requested code changes.**
  Tools invoked include `edit` and the transcript shows `codebase/src/healthz.ts` was written.
- ✓ **Turn 1: inspect existing handler conventions first (especially `codebase/src/middleware.ts`, and potentially `auth.ts`) before writing.**
  Files read include `codebase/src/middleware.ts`, matching the explicitly requested convention source before creating `healthz.ts`.
- ✓ **Turn 1: add `codebase/src/healthz.ts` with TypeScript named export, JSDoc header, request parameter, and `{ status: "ok" }` response body without requiring extra confirmation.**
  Assistant reports adding `codebase/src/healthz.ts` with a JSDoc header and `export function healthz(req: HealthzRequest): { status: "ok" }`, always returning `{ status: "ok" }`.
- ✓ **Turn 2: append a one-line comment above the handler, done as an additive edit.**
  Assistant states: "Done — added a one-line comment above `healthz` in `codebase/src/healthz.ts`" and posted the comment line.
- ✓ **When mentioning assumptions, do so narratively rather than as blocking confirmation questions.**
  The assistant did not block progress with assumption questions; it directly made the change and only offered optional post-change wording tweaks.
- ✓ **No clarifying-question/ask tool should be invoked in turn 1.**
  Turn 1 invoked only `edit`/`read`/`grep`; no `AskQuestion`-style tool is present.
- ✓ **No clarifying-question/ask tool should be invoked in turn 2.**
  Turn 2 also shows only regular assistant output and no ask/clarify tool invocation.
- ✓ **Turn 1 should not end with a blocking question that prevents execution.**
  Turn 1 ended with an optional follow-up ('If you want, I can also wire this...') after completing the requested edit.
- ✓ **Turn 1 should not pause for confirmation of HTTP framework/path/shape/name.**
  The assistant proceeded to implement the requested handler directly and did not ask which framework, path, shape, or function name to use.
- ✓ **Turn 2 should not ask for comment placement, tone, or wording clarification.**
  Turn 2 directly added the one-line comment and did not ask where or how to place/word it before doing so.
- ✓ **The assistant should not stall with a proposed-change style flow for this in-repo file edit.**
  The assistant delivered concrete edits ('Added ...', 'Done — added ...') and did not present a `## Proposed change` block.

</details>

<details>
<summary><strong>07-execute-dont-interrupt [content-only]</strong> — Agent commits to execution rather than interrupting with a clarifying question · ✅ pass · 100.0%</summary>

**Notes:** All listed expectations are satisfied by the transcript, including direct execution and no clarifying-question interruptions. Minor ambiguity exists around the expectation mentioning probable inspection of `auth.ts`; only `middleware.ts` was explicitly read, but that is still enough to satisfy style alignment in this case. Passed=true with a perfect score of 1.0.

- ✓ **Use the edit tool to make the requested code change**
  Tools invoked include `edit`; the transcript also shows `codebase/src/healthz.ts` was written.
- ✓ **Read `codebase/src/middleware.ts` before writing to mirror existing convention**
  Files read include `codebase/src/middleware.ts`, matching the user’s invitation to inspect existing style.
- ✓ **Create `codebase/src/healthz.ts` in turn 1 with TypeScript named export, JSDoc header, and `{ status: "ok" }` response without asking the user to confirm design choices**
  Turn 1 assistant message states it added `codebase/src/healthz.ts` with a named export, JSDoc on top, request parameter, and fixed `return { status: "ok" };`.
- ✓ **In turn 2, add a one-line comment above the handler (additive edit)**
  Turn 2 assistant says: “Done — I added a one-line comment above the handler:” and shows the inline comment above `export function healthz`.
- ✓ **If assumptions are mentioned, state them narratively rather than as blocking questions**
  Across both turns, the agent did not stop to ask the user to choose names/shapes and reported completed actions directly.
- ✓ **Do not invoke any clarifying-question/ask-the-user tool in turn 1**
  Tool list contains only `edit`, `grep`, and `read`; no `AskQuestion`/`ask`/`clarify` tool was used.
- ✓ **Do not invoke any clarifying-question tool in turn 2**
  Turn 2 response contains only completion text and code, with no clarify-type tool invocation.
- ✓ **Do not end turn 1 with a question that blocks execution**
  Turn 1 concludes with “Added ...” and a code block, no blocking question is present.
- ✓ **Do not stall in turn 1 to ask for HTTP framework, path, shape, or function name**
  Turn 1 directly created `healthz.ts` and did not ask for those unresolved choices.
- ✓ **Do not ask in turn 2 for comment placement, tone, or wording**
  Turn 2 directly implements the one-line comment and does not ask follow-up questions.
- ✓ **Do not misclassify this code edit as a proposed-only structural change**
  No `Proposed change` block appears; the assistant directly produced and updated code.

</details>
## Baseline history

| Baseline | Plugin | Agent | Judge | Mean | Weighted | Pass / Fail / Skip |
|---|---|---|---|---|---|---|
| [`v0.7.0__gpt-5.3-codex-spark__gpt-5.3-codex-spark.json`](./baselines/v0.7.0__gpt-5.3-codex-spark__gpt-5.3-codex-spark.json) | `0.7.0` | `gpt-5.3-codex-spark` | `gpt-5.3-codex-spark` | 45.3% | 45.3% | 5 / 7 / 2 |
| [`v0.6.0__gpt-5.3-codex-spark__gemini-3.1-pro.json`](./baselines/v0.6.0__gpt-5.3-codex-spark__gemini-3.1-pro.json) | `0.6.0` | `gpt-5.3-codex-spark` | `gemini-3.1-pro` | 39.5% | 39.5% | 3 / 5 / 2 |
| [`v0.4.2__gemini-3.1-pro__gemini-3.1-pro.json`](./baselines/v0.4.2__gemini-3.1-pro__gemini-3.1-pro.json) | `0.4.2` | `gemini-3.1-pro` | `gemini-3.1-pro` | 62.5% | 62.5% | 1 / 2 / 0 |
| [`v0.4.1__gemini-3.1-pro__gemini-3.1-pro.json`](./baselines/v0.4.1__gemini-3.1-pro__gemini-3.1-pro.json) | `0.4.1` | `gemini-3.1-pro` | `gemini-3.1-pro` | 41.7% | 41.7% | 1 / 2 / 0 |

Older baselines remain in [`evals/baselines/`](./baselines/) so a regression diff is always git-traceable.
## Methodology

Each scenario boots a fresh Cursor SDK agent in a tmpdir cwd containing a built copy of the harness, drives it through 1–3 user turns, then asks an LLM judge to score the transcript against an expectation rubric. Expectations are mostly mechanical (`must_invoke_tools`, `must_cite`) plus a small set of semantic checks (`must_surface_concepts`, `must_not`). The judge can only see the structured transcript — assistant text, tool invocations, files read, files written — and emits a JSON verdict per expectation.

Both the agent under test and the judge run on the Cursor SDK. See [evals/README.md](./README.md) for the full architecture, scenario format, and how to add a new scenario.
