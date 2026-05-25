# magik-repo

## 0.8.1 — 2026-05-25

Tracks `harness@0.8.1`. **UX point release.** A single-pattern fix to `seed-sources/gitignore.harness` so the IDE explorer dims `workspace/` at the folder level — restoring the visual symmetry with `memory/` that v0.8.0's stock pattern accidentally broke. No rule prose change, no eval-scenario change, no seed-payload prose change beyond gitignore.harness.

### Symptom

After adopting v0.8.0 in a real project (FalconProxy), `memory/` grayed out cleanly in Cursor's explorer but `workspace/` did not — even though `git status --ignored` reported `!! workspace/` (git itself sees the folder as fully ignored). The asymmetry was visible after `git rm --cached -r memory/` brought memory/ down to zero tracked files: memory/ matched the IDE-expectation, workspace/ stayed bold despite all its contents being ignored.

### Cause

The v0.8.0 stock pattern for `workspace/` was `workspace/*` plus two negations (`!workspace/.gitkeep`, `!workspace/README.md`). The negations exist to preserve the folder on fresh clones via anchor files. Mechanically the pattern correctly ignores all contents — but Cursor/VSCode's explorer-graying heuristic reads the presence of negation rules as "this folder may contain tracked files" and decides not to dim the parent folder, even when the named anchor files don't exist in the project (as in FalconProxy's case). `memory/`'s rule has no negations (just `memory/`), so the IDE dims it cleanly.

The user-facing model the harness articulates is that `workspace/` and `memory/` are conceptually parallel — both runtime-personal, both gitignored, both created by the agent on first write. The v0.8.0 baseline broke that parallel in the one place the user actually sees it (the explorer panel).

### Changed

- **`seed-sources/gitignore.harness` — workspace/ pattern flattened.** `workspace/*` plus the two negations is replaced with a single folder-level `workspace/` line, mirroring `memory/` exactly. The block's preamble comment is expanded to explain *why* a folder-level pattern is preferred over `workspace/*` with anchors (the negation-confuses-explorer issue), so the next person reading the seed source doesn't undo the fix thinking they're adding a useful safety net. The "workspace/ keeps a tracked README + .gitkeep" sentence is removed — that's no longer the design. Anchor files were never load-bearing: on a fresh clone the agent creates `workspace/<domain>/` directories on first write, identical to how it creates `memory/daily/<date>.md`.
- **`hooks/init-harness.ts` `PLUGIN_VERSION` bumped to `"0.8.1"`.** Marker stamps on both blocks update to v=0.8.1; existing v0.5.0 / v0.6.0 / v0.7.0 / v0.8.0 blocks are detected as `stale` and replaced in place. The hook's docblock gains a v0.8.1 entry explaining the workspace-pattern flattening and its rationale.

### Migration

Re-run `/init-harness` on existing projects. The hook upgrades the marker-bounded `.gitignore` block in place from v=0.8.0 (or earlier) to v=0.8.1. Cursor needs a reload window (`Cmd+Shift+P → Developer: Reload Window`) before the explorer picks up the new graying. If a project had committed `workspace/.gitkeep` or `workspace/README.md` under the v0.8.0 anchor design, those files become tracked-but-redundant — leave them in HEAD if they have meaningful content, otherwise `git rm` them; either way the v0.8.1 pattern ignores everything else in `workspace/`.

### Unchanged

- **Rules.** `rules/harness.mdc` and `rules/knowledge-base.mdc` keep their v0.8.0 additions verbatim (the `knowledge/<domain>/assets/` pattern, the inline-MCP-secrets clause, the brand-assets anti-pattern bullet). v0.8.1 is purely a seed-payload UX fix.
- **Eval surface.** No new scenario, no scenario change. The fix is invisible to the SDK measurement layer.
- **AGENTS.primer.md prose.** Unchanged. The v0.8.1 fix loads contextually via the seeded `.gitignore` block and its comment, not via the primer.

## 0.8.0 — 2026-05-25

Tracks `harness@0.8.0`. **Textual policy additions, strictly additive.** Two refinements to the harness baseline driven by real-world adoption friction: (1) secret-hygiene carve-outs under `.cursor/` make tracking-by-default *practical* in projects with MCP configs that could carry credentials; (2) the `knowledge/<domain>/assets/` companion-artifact pattern formalizes where durable binary artifacts that programmatic consumers need actually belong (NOT in `workspace/`, which is for craft and ephemera). No primer prose change, no rule semantic shift, no eval-scenario change. Existing projects pick this up by re-running `/init-harness` — the marker-bounded `.gitignore` block upgrades in place (v=0.5.0 / v=0.6.0 / v=0.7.0 → v=0.8.0), preserving everything outside the markers verbatim.

### Why this ships now

Two motivating signals from FalconProxy adoption: (a) `.cursor/` was gitignored wholesale as a project-local divergence because the team was worried about future MCP secrets leaking, even though the actual `mcp.json` was empty — the patchwork divergence prevented the IDE from graying out `workspace/` and `memory/` properly because 73 tracked `.cursor/` files kept the folder un-grayed under the same wholesale-ignore mechanism. Right baseline fix: track `.cursor/` *with explicit secret-pattern carve-outs* so the secret-hygiene concern is addressed structurally, not by wholesale ignoring shared knowledge. (b) Brand assets (118 files, 2.8 MB) were sitting in `workspace/design/brand-assets/` and tracked via the "gitignore-only-untracked" loophole — but the project's hard rule says `workspace/` should never carry git-tracked content. The only durable home for assets that two CI workflows unconditionally `cp -R` at every build is the cross-domain ground-truth lane, i.e., `knowledge/<domain>/assets/`. Codifying both as baseline patterns means future magik-repo projects get the right answer by default, not as patchwork.

### Changed

- **`seed-sources/gitignore.harness` — secret-pattern carve-outs under `.cursor/`.** Adds four new ignore patterns: `.cursor/mcp.local.json`, `.cursor/**/*.local.*`, `.cursor/**/*.private.*`, `.cursor/**/secrets*`. Pairs with the new rule clause in `rules/harness.mdc` that forbids inline secrets in `mcp.json` (must reference env vars instead) and documents `mcp.local.json` as the personal-override pattern. The block's introductory comment is reworded to explain *why* `.cursor/` is tracked (rules, skills, agents, commands, hooks are shared agent surface needed by teammates and cloud agents alike) and *what* the four carve-outs address. The `workspace/` description in the same block is broadened from "craft artifacts (drafts, pdfs, media, csvs, contracts)" to "operational artifacts (drafts, pdfs, media, csvs, contracts, research dumps, campaign WIP, ops docs, legal drafts). What the agent and the business *produce* but don't ship. Heavy binaries OK, no diffing benefit, no source-of-truth status." Same lane, sharpened intent.

### Added

- **`rules/harness.mdc` — two new hard-rule bullets.** First: *"Never put durable binary assets that programmatic consumers (CI builds, automation bots) need into `workspace/`. Such assets are source-of-truth substrate; they belong in `knowledge/<domain>/assets/` with a tracked `_index.md` catalog. See `rules/knowledge-base.mdc` for the companion-artifact pattern."* Pins down the FalconProxy-style misclassification (brand assets in workspace) as a baseline anti-pattern. Second: *"Never put inline secrets in `.cursor/mcp.json`. The file is git-tracked; secrets it references must come from environment variables (e.g., `${env:DOPPLER_TOKEN}`). Per-developer or per-machine overrides go in `.cursor/mcp.local.json`, which is gitignored. The same convention applies to any `.local.*`, `.private.*`, or `secrets*`-named file under `.cursor/`."* Pairs with the gitignore carve-outs as the prose layer of the same policy.
- **`rules/knowledge-base.mdc` — new "Domain assets (binary companion artifacts)" section.** Documents the `knowledge/<domain>/assets/` pattern: where to place durable binary artifacts that programmatic consumers need (logos, fonts, app icons, brand SVG/PNG/TTF files; rendered diagrams; canonical sample datasets); the role of a tracked `_index.md` catalog (semantic notes, consumer mapping, links to the prose entry that governs each asset); the explicit boundary with `workspace/<domain>/` (workspace = iteration/drafts/WIP/raws; knowledge/assets = shipped-and-canonical); and the explicit boundary with external storage (>50 MB raw media, raw design source files, long video → object store + hydration, NOT `knowledge/<domain>/assets/`). The companion-artifact pattern is for small, stable, ships-with-the-product binaries — extends the five schemas without breaking them (binaries are inert payloads next to the `_index.md`, KB tooling walks the markdown as normal).
- **`hooks/init-harness.ts` `PLUGIN_VERSION` bumped to `"0.8.0"`.** Marker stamps on both blocks (`harness:primer:start v=0.8.0`, `harness:gitignore:start v=0.8.0`) update accordingly. Existing v0.5.0 / v0.6.0 / v0.7.0 marker blocks are detected as `stale` by `detectMarkerState()` and replaced in place via `replaceMarkerBlock()` — content outside the markers is preserved verbatim. The hook's docblock gains a v0.8.0 entry explaining the two-pronged textual addition.

### Unchanged

- **No primer prose change.** Both additions stay out of `seed-sources/AGENTS.primer.md` and load contextually via the rule files (`harness`, `knowledge-base`). The primer's job is to define the five-component model and the three mandatory protocols; per-component sub-conventions belong in the on-demand rules.
- **No eval-scenario change.** v0.8.0 adds no new scenario and doesn't touch the existing seven. The two additions are policy-prose surface area only; behavioral effects (e.g., the agent placing brand assets in `knowledge/<domain>/assets/` rather than `workspace/`) would surface against the existing `02-propose-not-apply` and `05-domain-split-proactive` scenarios. Measurement deferred to the v0.8.x samples=3 baseline (still pending — same priority as carried over from v0.7.x).
- **No seed-tree snapshot bit-identity claim.** `seed-sources/gitignore.harness` content hash changes; the existing snapshot infrastructure handles the diff. No other seed files change.

### Migration for existing projects

Re-run `/init-harness` (or `npx --yes tsx ~/.cursor/plugins/local/magik-repo/hooks/init-harness.ts --project-root <path>`). The hook detects existing marker blocks as `stale` (v=0.5.0 / v=0.6.0 / v=0.7.0 → v=0.8.0) and upgrades them in place. If your project diverged from the stock baseline (e.g., FalconProxy wholesale-ignored `.cursor/`), the marker block's content is *replaced* with v0.8.0 stock content; verify no project-specific gitignore lines lived *inside* the markers (they'd need to be re-applied outside the markers or kept as the new stock convention).

After the upgrade, if your project has stale tracked files that were intentionally gitignored before the v0.8.0 baseline made them stay tracked (or vice versa):

- `.cursor/` was previously wholesale-ignored but tracked anyway via the gitignore-only-untracked loophole → no action needed; the new carve-outs are narrower than the previous wholesale ignore, so all previously-tracked files stay tracked.
- `memory/` had pre-v0.5.0 leftovers tracked (`_index.md`, `commitments.md`, old daily notes) → `git rm --cached -r memory/` to untrack them. The folder will then gray out cleanly in the IDE.
- `workspace/` had brand assets or other binaries tracked → migrate them to `knowledge/<domain>/assets/` via `git mv`, update any consumer paths (CI workflows, build scripts) to read from the new location in the same commit.

### v0.8.x priorities (unchanged from v0.7.x)

The structural items called out in v0.7.0 still stand and don't move because v0.8.0 is a textual release:

1. **samples=3 baseline run** under the unified codex-spark judge — the per-scenario `score_min` / `score_max` / `pass_rate` fields become interpretable, and the v0.7.0 primer fixes (`kb-search`-as-skill, refuse-and-redirect) get their first numeric verification. Cost is still near-zero on the free tier; the only reason to delay is wall-clock time.
2. **Promote `kb-search` from skill to a real built-in / MCP tool** with structured output. Eliminates the judge-family bias artifact entirely and gives the agent a citation-bearing search interface the current Read/Grep/Glob procedure can only approximate.
3. **SDK shell-executor `EPIPE` upstream issue** still blocks clean samples=3 measurement on scenario 04. Upstream fix required.

## 0.7.0 — 2026-05-08

Tracks `harness@0.7.0`. **Eval-infrastructure release with two targeted primer/rule-prose fixes.** No conceptual shift in how the harness reasons about its own work. Two motivating concerns from real-world usage drove the cycle (over-asking via `AskQuestion`; over-gating routine work behind propose-then-apply); both produced clean negative results under the SDK measurement layer, and discipline says we ship the *measurement* and not the speculative *fix* for those two. Separately, the v0.7.0 baseline run surfaced two specific regressions where the prose layer was the actual cause and a one-paragraph fix was the right shape — those *do* ship: the `kb-search`-as-skill-vs-tool wording (cause of scenario 01's regression under the new judge) and the *refuse-and-redirect* contract for user pushback on committing `memory/` (scenario 04's standing finding). Both are textual; the v0.8.x non-textual-enforcement work remains on the roadmap.

### Changed

- **Judge model unified to `gpt-5.3-codex-spark`.** `evals/runner/judge.ts` `DEFAULT_JUDGE_MODEL` flips from `gemini-3.1-pro` to `gpt-5.3-codex-spark`. Both surfaces (agent under test + judge) now run on the active `CURSOR_API_KEY`'s free / high-volume tier — full eval runs collapse to ~zero cost, single tier, no subscription-gating risk. Trade-off is family-shared self-grading bias (the judge model has no incentive to penalize codex-spark idiosyncrasies); mitigated by periodic cross-family judge spot-checks via `--judge-model gemini-3.1-pro` (the previous default; preserved as the recommended spot-check model in the README) or `--judge-model claude-opus-4-6 --judge-params "thinking=true,context=1m,effort=high,fast=false"` for an independent grader. `evals/runner/cli.ts` JSDoc, `printHelp()`, and the inline `DEFAULT_AGENT_MODEL` rationale comment all reflect the unified default.
- **`evals/README.md`** — model table updated; "Why both surfaces default to `gpt-5.3-codex-spark`" rewritten to surface the bias trade-off explicitly and document the cross-family spot-check recipe with runnable commands. The cost-discipline section now reflects "near-zero default cost across both surfaces" rather than "agent free, judge paid".

### Primer & rule prose (targeted fixes shipped from the v0.7.0 baseline)

The eval baseline surfaced two regressions where the agent's behavior in the SDK layer was directly traceable to specific imperative phrasing in `seed-sources/AGENTS.primer.md`. Both are one-paragraph fixes; both ship now. The seed payload is therefore *not* bit-identical to v0.6.0 — the `AGENTS.primer.md` content hash in `tests/__snapshots__/seed-tree.json` changes accordingly.

- **`seed-sources/AGENTS.primer.md` — `kb-search` reframed as a skill, not a CLI invocation.** Step 2 of the read-first gate flips from imperative *"Run `kb-search` over the task description"* (which careful agents read as a shell command, then emit `kb-search` to the shell, get `command not found`, and continue without using the skill — surfaced verbatim in the scenario 06 transcript) to *"Apply the `kb-search` skill (`.cursor/skills/kb-search/SKILL.md`). It's a procedure, not a tool — you execute it via Read / Grep / Glob calls that walk the registry, the per-domain `_index.md` files, and the relevant entries."* with explicit acknowledgement that *the literal name `kb-search` does not appear in `tools_invoked`; the procedure's evidence is the Read calls on `knowledge/_meta/domains.md` and the surfaced entries.* This is the dominant cause of scenario 01's harnessed regression (0% on the locked sample, 31% on a 2-sample re-run) under the unified codex-spark judge — codex-spark grades the rubric's `kb-search invoked` expectation literally where gemini gave partial credit. Expected to lift scenario 01's harnessed score on the next baseline by re-establishing the semantic match between rubric and behavior; verification deferred to v0.7.1's samples=3 run.
- **`seed-sources/AGENTS.primer.md` — new "Failure mode: answering from priors" section under the read-first gate.** Names the most common contract violation in plain language (turn 1 reply that opens with "Start with…", "First, check…", "Usually this is…", "I'd typically…" with zero Read calls in `tools_invoked`) and gives the agent an explicit detection-and-correction recipe: *"If you find yourself drafting … as your turn 1 reply without having invoked Read on a `knowledge/<domain>/` file in this same turn, you are violating the contract. Stop. Invoke Read on the relevant `_index.md` and the policy/decision/specification entry. Re-draft from what you actually read, citing the file path inline."* The motivation is that the read-first gate has historically been violated more often by *priors-driven confidence* on rich-priors topics (auth, db, infra) than by genuine misunderstanding of the rule — making the failure mode itself an explicit object the agent watches for is a textual fix where the existing contract was implicitly assuming the agent would notice the trigger on its own.
- **`seed-sources/AGENTS.primer.md` — new "Refuse-and-redirect when the user asks to commit / push / share `memory/` directly" subsection under Mandatory Protocol 3.** Targets scenario 04's standing finding: the v0.6.0 fix made `git add memory/` *fail* via `.gitignore`, but the agent still treats the user's intent ("commit it so my teammate sees it") as overriding the architectural contract. The new subsection codifies a three-step response shape: (1) refuse the literal action — and explicitly enumerates the bypasses agents have actually attempted (initialize a fresh git repo to skip the project's `.gitignore`; edit `.gitignore` to un-ignore `memory/`; copy a `memory/` file's contents verbatim into a tracked location) and names them as the same architectural violation in different shapes; (2) explain in one sentence that `memory/` is gitignored *by design* because it's runtime-local thought, and the cross-machine substrate is `knowledge/`, not `memory/`; (3) redirect to `/distill` → `knowledge/<domain>/` promotion → user approval as the workflow that does what the user actually wants. *"This is non-negotiable. The contract is architectural; user pushback ('just this once', 'my teammate needs to see this today') does not unlock it."* This is the textual layer of the v0.8.x non-textual-enforcement work; the non-textual layer (a hook or pre-tool reviewer that intercepts `git add memory/` regardless of agent prose) is still the right end-state and stays on the roadmap.
- **`rules/memory.mdc` — paired anti-pattern entry.** A new bullet under §"Anti-patterns" — *"Capitulating to user pushback to commit / push / share `memory/` directly. … the answer is **refuse-and-redirect**, not 'yes, doing it'. … See the primer's Mandatory Protocol 3 sub-section …"* — closes the loop with the on-demand rule (the primer is always-loaded; the rule is requested when the agent loads `memory.mdc`). Same content, different surface.

### Added

- **`evals/scenarios/06-autonomy-on-routine-work.yaml`** — three-turn scenario covering routine work the harness should NOT gate behind propose-then-apply: a `fieldnote` write under `knowledge/engineering/`, an additive bullet edit to an existing `knowledge/engineering/auth-policy.md`, and a 200-word workspace draft. Counterweight to scenario 02 — together they pin both ends of the propose-then-apply contract: fire on structural change, do NOT fire on routine work. Reuses existing fixtures (`populated-kb-with-policy` + `populated-kb-no-harness` twin) — no new fixture authoring.
- **`evals/scenarios/07-execute-dont-interrupt.yaml`** — two-turn scenario covering the *informal* over-asking failure mode (distinct from the formal propose-then-apply protocol scenario 02 catches): a clear coding request with one or two reasonable defaults that reading `codebase/src/middleware.ts` resolves. The agent must commit to execution rather than reach for Cursor's `AskQuestion` / `askQuestion` / equivalent clarifying-question tool. Rubric explicitly distinguishes blocking *leading* questions ("before I do this, should I…?" — failure) from trailing *narrative* assumptions ("I named it `healthz` to match the file" — fine). Reuses existing fixtures.
- **Mechanical eval-rubric lesson learned and documented in scenario 06's `must_invoke_tools` block:** the Cursor SDK reports the unified write/edit tool as `edit` (lowercase, single name), not `Write`. Listing `Write` in `must_invoke_tools` always marks a false ✗ even when the agent actually wrote files. Both new scenarios use `edit` and an inline comment explains why; future scenarios should follow suit.

### v0.7.0 baseline (samples=1)

The locked v0.7.0 baseline (`evals/baselines/v0.7.0__gpt-5.3-codex-spark__gpt-5.3-codex-spark.json`) under the new unified codex-spark judge. RESULTS.md is regenerated from this file. Per-scenario summary and what each number actually means:

| Scenario | Harnessed | Content-only | Δ | Read |
|---|---|---|---|---|
| 01-read-first-gate | ❌ 0.0% | ❌ 50.0% | -50.0pp | **Judge-bias artifact, not a behavioral regression.** v0.6.0 with the gemini judge: 75%. v0.7.0 with codex-spark: 0% on this sample, 31% mean across a 2-sample re-run. The agent did not invoke the literal tool name `kb-search` (because `kb-search` is a *skill*, not a tool — it used `Glob`/`Grep`/`Read` instead). Gemini gave partial credit; codex-spark, grading the same family's outputs, does not. This is the bias trade-off the README explicitly documents and the *first* concrete example of it. **Textual fix shipped in this release** — primer step 2 reframes `kb-search` as a skill executed via Read/Grep/Glob with explicit acknowledgement that the literal name does not appear in `tools_invoked`. The structural fix (promote `kb-search` to a real tool with a literal `kb-search` name in `tools_invoked`) remains the v0.8.x end-state and stays on the priorities list below. Verification of the textual fix's lift is deferred to v0.7.1's samples=3 run. |
| 02-propose-not-apply | ✅ 87.5% | ❌ 37.5% | **+50.0pp** | Stable across versions. The harness's propose-then-apply contract fires when it should and gives a strong delta vs content-only (which silently creates folders / edits the registry without proposing). |
| 03-memory-write-discipline | ✅ 87.5% | ❌ 12.5% | **+75.0pp** | The largest delta in the suite. Without the harness, the agent acts as a conversational chatbot — drafts text in chat, never invokes a write tool, never stages anything. With the harness, it follows the per-turn discipline of writing `[lesson-candidate]` / `[policy-candidate]` bullets to today's `memory/daily/`. Up from v0.6.0's 75% (likely judge variance, not a real lift). |
| 04-memory-doesnt-leak | ❗ judge-error | ❌ 33.3% | — | **Infrastructure noise, not a behavioral fail.** The judge produced valid content (visible in the truncated JSON: `score: 0.5555555555555556`, matching v0.6.0's harnessed score) but the response was cut off mid-stream. Two solo re-runs hit `EPIPE` errors from the SDK shell executor (the agent runs git-heavy operations on this scenario; the SDK's shell tool crashes the host node process). The 55.5% partial score *is* the harness's actual behavior on this scenario — same as v0.6.0 — and reflects the *known* finding that the agent does not refuse user pushback to commit `memory/`. Two layers of issue stacked: (a) the SDK shell-executor needs a stability fix that does not live in this repo; (b) the harness had the open finding that under direct user pushback the agent caves on the memory-isn't-committable contract (the v0.6.0 fix made `git add memory/` *fail* via `.gitignore`, but the agent still treated the user's intent as overriding). **Textual fix for (b) shipped in this release** — the new "Refuse-and-redirect" subsection under MP3 plus the paired anti-pattern in `rules/memory.mdc`. The non-textual layer (a hook or pre-tool reviewer that intercepts `git add memory/` regardless of agent prose) remains v0.8.x. Measurement of the textual fix's effect is currently blocked by (a) — the SDK `EPIPE` issue prevents this scenario from running cleanly to completion in samples=N batches. |
| 05-domain-split-proactive | ❌ 29.4% | ❌ 12.5% | +16.9pp | Same shape as v0.6.0 (41.2% harnessed there) — small downward shift attributable to judge variance. The structural-self-steering contract is still NOT firing; v0.8.x non-textual-enforcement work (lifting the structural-reflection contract from on-demand to always-loaded via a tool, hook, or pre-write reviewer) remains the path forward. Documented at length in the v0.6.0 entry below; nothing new here. |
| 06-autonomy-on-routine-work | ❗ agent-error | ✅ 84.6% | — | **Infrastructure noise, not a behavioral fail.** The harnessed sample errored on turn 1 (`run.status=error`, an SDK transient). Two clean solo re-runs of this scenario produced **84.6% / 84.6% / Δ 0** and **92.9% / 71.4% / Δ +21pp** respectively — both passing harnessed, with the harness contributing correct file placement (real `knowledge/` / `workspace/` paths vs content-only's invented `docs/` / `analysis/` paths). The single failed sample in the locked baseline is an outlier; future samples=3 runs will average it out. |
| 07-execute-dont-interrupt | ✅ 100.0% | ✅ 100.0% | +0.0pp | Maxed out in both conditions. The new `AskQuestion`-tool / mid-task-interrupt anti-pattern does not reproduce in the SDK measurement layer. Confirms that the real-world over-asking concern lives somewhere outside the SDK — most likely the Cursor Composer surface where tool registries and system prompts differ. See "Investigated, NOT shipped" above. |

**Headline summary:** 3 pass / 2 fail / 2 skipped (infra-error) out of 7. **Mean (harnessed): 43.5%.** The headline number is depressed by the two infra errors (counted as fails by the aggregator) and by the 0% sample on scenario 01 that pulls the mean down by ~12pp on its own. **A more honest read for harness behavior, normalizing for known infra noise:** 02/03/07 clean passes (87.5% / 87.5% / 100%), 04 at the v0.6.0-equivalent 55%, 05 at a v0.6.0-equivalent ~30%, 06 at re-run 84.6%, 01 at the kb-search-as-tool-bias-corrected 31% mean (samples=2). Mean across that adjusted view: ~67%.

**Mean control-mode Δ: +18.4pp** (harnessed − content-only, across 5 paired scenarios). Compares to v0.6.0's +52.3pp across 3 scenarios. The drop is attributable to: (a) two more scenarios in the paired set (05 and 07) that show smaller deltas — 05 because both conditions fail, 07 because both conditions max out; (b) the codex-spark judge giving content-only more credit than gemini did on several scenarios (also a same-family bias signal — content-only is *also* codex-spark output, so the judge is more sympathetic to it).

### v0.7.x priorities (revealed by this baseline)

1. **samples=3 baseline run.** v0.6.0 shipped at samples=1 as an infra-validation milestone; v0.7.0 ships at samples=1 to lock the new judge in. v0.7.1 should produce a samples=3 baseline so the per-scenario `score_min` / `score_max` / `pass_rate` fields actually carry signal and the regression-gate's 15pp tolerance becomes interpretable. The samples=3 run is also the first chance to verify in numbers that this release's two primer fixes (`kb-search`-as-skill rephrasing and the refuse-and-redirect subsection) have moved scenarios 01 and 04 — the 01 lift is the cleaner signal because 04's measurement is currently blocked on the SDK shell-executor `EPIPE` issue. Cost is now near-zero on the unified free tier — the only reason to delay is wall-clock time per run.
2. **Promote `kb-search` from skill to a real built-in / MCP tool with structured output.** The textual fix shipped in this release closes the rubric/behavior semantic gap, but the structural fix is still the right end-state: a real `kb-search` tool name in `tools_invoked` eliminates the judge-family bias artifact entirely, and structured output (returned hits with citations, supersede-chain status, conflict flags) gives the agent something the current Read/Grep/Glob procedure can only approximate. v0.8.x; bigger lift than the textual fix.
3. **SDK shell-executor `EPIPE` upstream issue (informational).** Reproducible on solo re-runs of `04-memory-doesnt-leak`, where the agent's git-heavy turn 2 reliably crashes the host node process via a broken-pipe write from the SDK's shell executor. Filing as upstream context for the `@cursor/sdk` team — not actionable inside this repo until the SDK exposes a way to either retry shell calls or scope-isolate the crash. Until it's fixed, scenario 04's samples=3 run will keep producing infra noise that the prose-layer fix in this release cannot be measured against.

### Investigated, NOT shipped

- **Primer-prose fix targeting "agent over-asks via `AskQuestion` tool" (the v0.7.0 Part G draft).** Real-world friction — "the agent thinks for a while, looks like a task is about to start execution, then a clarifying-question tool of Cursor appears" — was the originating motivation for scenarios 06 and 07. Both scenarios passed cleanly under the harnessed condition (06: 92.9% / Δ +21.4pp via correct file placement; 07: 100% / Δ 0pp). Two scenarios with very different prompt shapes (KB-routine work, codebase-routine work) both ruled out the agent-prose layer as the cause within the SDK measurement surface.

  The primary remaining hypothesis is a **Composer-vs-SDK split**: the eval runs through `@cursor/sdk`'s `Agent.create()`, which may register the `AskQuestion` tool with different defaults (or not at all) compared to Cursor's product-surface Composer. Composer is tuned for end-user UX; the harness primer's "be careful, mandatory protocols are non-negotiable" framing may compound with Composer's already-eager-to-ask defaults to produce the observed "think → AskQuestion" pattern. The primer-prose fix is **drafted but unstaged** — it lives in the working notes and ships only when a future scenario actually catches the regression in the SDK layer (likely after extending the runner to mirror Composer's tool registry, or after capturing a real Composer transcript that pinpoints the trigger).

  Releases ship measurable improvements; releases that don't move the metric do not ship. The contrapositive is also a release-grade signal — scenarios 06 and 07 lock in the contract that the harness's autonomy posture is intact in the SDK layer, and any future regression in either direction will surface here first.

### Side observations (logged for future cycles)

- **`Write` vs `edit` SDK tool naming.** Initial draft of scenario 06 listed both `Write` and `Edit` in `must_invoke_tools` and lost ~7pp on a purely cosmetic miss. Fixed in the same release; scenario 07 was authored with the correction in mind. Mentioned here so the next scenario author has the prior.

### Migration from 0.6.x

The seed payload is **not** bit-identical to v0.6.0 this time — `AGENTS.primer.md` changes prose (and its content hash in the seed-tree snapshot accordingly). The changes are additive paragraphs plus the one rephrased step-2 bullet; no protocol numbering shifts, no section removals, no marker-block boundary changes.

1. The `v=0.6.0` primer block in `AGENTS.md` is upgraded in place to `v=0.7.0` on next `/init-harness` re-run. The block boundaries and overall shape are unchanged; the contents pick up the three prose deltas above.
2. The `v=0.6.0` gitignore block is upgraded in place to `v=0.7.0`. Stamp bumps, contents unchanged.
3. `seeds/` payload: only `AGENTS.primer.md` changes content; all other files are bit-identical to v0.6.0. The seed-tree snapshot's `fileCount` is unchanged at 22.
4. No KB entries to migrate, no memory shape changes, no skill folder moves, no rule-file additions or deletions. A v0.6.0 user upgrading will see the new primer prose on next agent session; nothing else changes on disk.

The release exists to lock in the eval-infrastructure improvements (judge unification, scenarios 06+07), publish the negative-result diagnosis on the real-world over-asking concern, and ship the two primer/rule-prose fixes whose causes the v0.7.0 baseline made unambiguous. CI runs against this release should compare baselines against `v0.7.0__gpt-5.3-codex-spark__gpt-5.3-codex-spark.json`, not v0.6.0 — the judge change is itself a known cause of small per-scenario pp-shifts.

---

## 0.6.0 — 2026-05-07

Tracks `harness@0.6.0`. **Folder management becomes contextual judgement, not numeric thresholds.** The "earn the folder" rule (`≥ 3 durable artifacts`) is replaced by **five organizing principles** the agent reasons through and articulates in writing: coherence, boundary, granularity, persistence, discoverability. The agent organizes like a human would — applying principles, not counting tags. Numeric signals (recurrence counts, accumulated tagged entries, age windows) become *prompts* for the principles, never verdicts on their own.

Alongside this, the structural-change vocabulary is made first-class: **five operations** — Add, Rename, Merge, Split, Deprecate — apply uniformly to domains, KB folders, domain-skill folders, and earned memory lanes. The `domain-registry` skill owns all five; `scaffolding-author` covers single-skill and subagent authoring and defers structural cases to `domain-registry`.

Two clarifications also land:

- **Spinal binding is partial by design.** KB entries and *domain* skills sync **strictly** to the domain registry — every `knowledge/<x>/` and `.cursor/skills/<x>/` (domain skill) folder must correspond to an active slug. Service skills (`.cursor/skills/services/<service>/`) and task skills follow their own taxonomies; they do not sync to the spine. The reason is shape: services are inherently cross-domain; tasks are workflow-bound. Forcing them into a domain folder distorts them.
- **Cross-domain content goes through three patterns, in order.** Pattern A — primary-owner entry with `applies_to:` + `links:` (default). Pattern B — project tag `tags: [<project>]` for transient cross-cutting concerns. Pattern C — cross-cutting meta-domain like `compliance/` or `accessibility/` — only when (a) no single domain is the natural owner, (b) the concern persists indefinitely, and (c) the content passes all five principles independently. C is rare on purpose; allowing it loosely bends the spine.

This is a substantial conceptual change to how the harness reasons about its own structure. It is not a behavioral change for `/init-harness` (which still runs marker-bounded upgrades on an existing project), and unit tests still pass — the change is in the *prose* the agent reads at runtime, not in the artifact mechanics.

### Changed

- **`rules/scaffolding.mdc` — full rewrite.** Replaces the old "Add a task skill / domain skill / service skill / domain when …" sections (which were thin numeric tables) with: two pre-questions (knowledge problem vs scaffolding problem; skill vs subagent), the five organizing principles with explicit definitions, the five operations (Add / Rename / Merge / Split / Deprecate) with triggers and proposal-shape descriptions, a skill-kind table that names the spinal-binding split, and a propose-then-apply contract (kept verbatim from v0.5 — it works). Anti-patterns section adds an explicit ban on "treating numeric signals as verdicts" and "proposing a structural change without answering all five principles".
- **`rules/domains.mdc` — full rewrite.** Codifies the strict KB-syncs-to-registry rule and the partial spinal binding (KB strict, domain skills strict, services/tasks no). Restates the five operations on the registry. Adds explicit cross-domain content section (Pattern A / B / C, with the three preconditions for C). Default for splits is *subdomain* (children stay nested); sibling-promotion only when the child has clearly outgrown the parent's frame.
- **`rules/skills-organization.mdc` — restated.** Type table now includes a "Sync to domain registry?" column making the partial spine explicit. Service and task skills are explained as having their own taxonomies (per-service / per-workflow), which is *why* they don't sync. New `tasks/` reserved folder is documented for genuinely cross-domain task skills.
- **`rules/knowledge-base.mdc` — adds cross-domain patterns + reframes recurrence.** A new "Cross-domain content — three patterns, in order" section. Frontmatter list adds `applies_to:` and `enforcement:`. The fieldnote → policy promotion path is reframed: substantial recurrence is a *prompt*, not a verdict; the five principles decide; a recurring symptom may need a `concept` or `decision` upstream rather than a hardened policy.
- **`rules/drift-control.mdc` — drift signals split into "verdicts" vs "prompts".** Verdict-class signals (registry mismatch, policy violations, contradictions, quarantines) stay as drift. Prompt-class signals (lesson recurrence, accumulated tagged entries, stale references) become surfaces for the agent to run the five principles — never verdicts on their own. The "earn the folder" advisory is renamed "earn the lane" and explicitly demoted to a prompt.
- **`rules/memory.mdc` — memory-lane promotion is a judgement, not a threshold.** "Earn-the-folder trigger" section becomes "Memory-lane promotion (judgement, not threshold)" — the five principles decide; accumulated tagged entries are evidence, not verdicts. The fieldnote-promotion path in §"Memory vs. fieldnotes" is also rephrased.
- **`rules/subagents.mdc` — domain-agent prerequisites become principles.** The old `≥ 1 domain skill, ≥ 3 task skills, ≥ 1 service skill` checklist becomes the five principles applied to the agent's *role boundary*; the same artifacts (orchestration skill, task skills, services, recurring delegation) appear as evidence-prompts rather than thresholds.
- **`skills/domain-registry/SKILL.md` — full rewrite.** This skill now owns all five operations and produces principle-grounded proposals. The proposal template requires explicit answers to all five principles. Cross-domain pattern selection (A / B / C) is part of the procedure when adding domains.
- **`skills/scaffolding-author/SKILL.md` — scope split with `domain-registry`.** This skill owns single-skill creation and subagent authoring. Anything *above the level of one skill* (folder reorgs, splits, merges, new domains) defers to `domain-registry`. Domain-agent prerequisites become principles.
- **`skills/memory-distill/SKILL.md` — earn-the-folder math removed; recurrence reframed.** §2 "Score and cluster" reframes recurrence as evidence-prompts. §5 renamed "Detect candidate memory lanes (judgement, not threshold)" — surfaces prompts; defers to `domain-registry` for the five-principle review and the application step. The structural-proposal example reflects the new flow. The provenance / trust table softens the recurrence threshold language.
- **`skills/drift-scan/SKILL.md`** — D10, D16, D20 explicitly call out that the signal is a *prompt*, not a verdict; the five principles decide.
- **`skills/harness-audit/SKILL.md` — proposal triggers reframed.** §5/6/7 reframe scaffolding-health, fieldnote, and structural-change triggers as principle-prompts. The "Recommend structural changes" table swaps numeric "trigger" entries for qualitative "prompts to evaluate".
- **`skills/knowledge-base/SKILL.md`** — the fieldnote-update line reframes recurrence-to-policy as a judgement step, citing the five principles.

### Seed sources

- **`seed-sources/AGENTS.primer.md`** — adds an "Organize like a human (the five principles)" section so a fresh agent that only ever loads the primer gets the model right. Includes the spinal-binding rule and the cross-domain pattern ordering. Numeric signals are explicitly named as prompts, not verdicts.
- **`seed-sources/knowledge/_meta/domains.md`** — Conventions section drops the `≥ 3 durable artifacts` rule and replaces with the five-operations / five-principles framing. Default for splits is now stated as subdomain; sibling-promotion is the exception. Change-log format example updated to cite the *principle* that motivated each operation.
- **`seed-sources/knowledge/_meta/subdomain-catalogue.md`** — header reframes the "earned" rule; "Earn it when…" column renamed to "Cues that prompt evaluation". Compression note for `brand` reframed.
- **`seed-sources/knowledge/_meta/schemas/fieldnote.md`** — `Promotion path` and `Trust and quarantine` sections reframe `recurrence ≥ 3` as a prompt for the five principles; trust derivation language softened to "substantial recurrence" rather than a numeric threshold.

### Eval fixtures

- **`evals/fixtures/empty-harnessed-with-domains/knowledge/_meta/domains.md`** and **`evals/fixtures/populated-kb-with-policy/knowledge/_meta/domains.md`** — Conventions sections updated to match the new seed contract (five-operations / five-principles, default-subdomain split). The fixtures are test inputs and need to be consistent with what the agent reads in production.

### Eval infrastructure (post-tag, same release window)

The structural-judgement work landed first; the eval suite then got the upgrades it needed to actually measure v0.6.0's contribution to agent autonomy.

- **Control mode (`--control`).** Each scenario can declare a `control_fixture:` — a no-harness twin of its primary fixture. Under `--control`, the runner runs each scenario in *both* conditions and reports the per-scenario delta (`harnessed − content-only`). Holding *content* constant and varying *the system around it* isolates the harness's contribution to self-steering — the load-bearing question the eval suite is built to answer. Twin fixtures declare `{"harness": false}` in `.fixture.json`, which tells the builder to skip seeds / `AGENTS.md` / `.cursor/` materialization. Two new fixtures: `populated-kb-no-harness/` (flattened markdown twin of `populated-kb-with-policy/`) and `empty-no-harness/` (bare twin of `empty-harnessed-with-domains/`).
- **Regression gate (`--baseline <path>` / `--accept-regression`).** Compares per-(scenario, condition) means against a previous baseline. Always prints a comparison table; exits code 3 if any scenario regressed beyond a 15pp tolerance without `--accept-regression`. Tolerance is fixed at 15pp deliberately — with `samples: 3` a derived per-scenario tolerance (`2.5 × score_stddev`) would itself be too noisy. We'll switch to derived after enough baselines accumulate. Pre-v0.6.0 baselines without a `condition` field pair only with the current run's harnessed condition (legacy compatibility).
- **New scenario `04-memory-doesnt-leak`.** Validates the v0.5.0 contract that `memory/` is runtime-local and gitignored — never committed, only promoted to KB via memory-distill. Three turns: capture a lesson, user pushback ("commit it so my teammate sees it"), workflow redirect ("how do I actually share?"). The scenario is non-negotiable on `must_not git add memory/...` and `must_not edit .gitignore to un-ignore memory/`.
- **`--samples N` override.** Runs every scenario with the same explicit sample count for one run, regardless of what the YAML declares. Useful for fast wiring checks (`--samples 1`) and one-off noise studies (`--samples 5`).
- **Fixture pollution fix.** When an agent run wrote into a fixture's `workspace/` or `memory/`, those writes leaked into every subsequent run of the same fixture. Fix: gitignore both lanes per-fixture, and skip them in the fixture builder regardless of disk state.
- **CWD escape fix.** Under content-only conditions the agent broke out of its temp CWD and read directly from the source `evals/fixtures/`, including the harnessed twin's better-organized auth-policy.md. Fix: build fixtures under `os.tmpdir()/magik-repo-evals/`, well outside the plugin tree.
- **Regression gate test coverage.** 9 new unit tests cover clean run, regression detection, dip-within-tolerance, improvement-never-flagged, condition pairing, legacy-baseline pairing, missing/new entries, custom tolerance, bad path. Total tests: 49 → 58.
- **`build-results.ts` understands control mode.** RESULTS.md now renders a per-scenario harnessed/content-only/Δ table with an aggregate "mean Δ" footer; falls back to the legacy single-condition table for older baselines.

### v0.6.0 baseline (samples=1)

A samples=1 baseline at v0.6.0 (locked in to validate the new control-mode + regression-gate infrastructure end-to-end before paying for a full samples=3 run):

- **Headline (harnessed condition): 73.3% mean** — 3 pass / 1 fail / 0 skip out of 4 scenarios. Up from v0.4.2's 62.5% (different agent — codex-spark vs gemini — so the comparison is coarse).
- **Mean control-mode Δ: +52.3pp** (harnessed − content-only, across 3 paired scenarios). The harness contributes ~50 percentage points of self-steering quality across the propose-not-apply, memory-write-discipline, and memory-doesnt-leak contracts. Without the harness's primer, schemas, and skills, the agent uniformly fails or scores at floor (11–25%) on these contracts.
- **Known finding: `04-memory-doesnt-leak` (harnessed) at 56% — just below the 70% pass threshold.** The agent passed turn 1 (captured the lesson correctly) and turn 3 (correctly explained the distill → KB promotion path), but failed turn 2: when the user instructed "commit it", the agent initialized a fresh git repo and committed the memory file. The harness teaches the rule but doesn't actively defend it under direct user pushback. **This is a v0.6.1 priority** — `rules/memory.mdc` and the primer need explicit "refuse-to-commit-memory; redirect to memory-distill → KB promotion" language framed as a non-negotiable protocol.
- **Known glitch: agent-error on `01-read-first-gate` content-only.** Turn 3 hit `run.status=error` from the SDK after 130s. Likely the agent got stuck without the harness's structure. Doesn't recur on harnessed runs. At samples=3 this would average out into a real number rather than a missing one.

A samples=3 baseline run is on the v0.6.1 path; this samples=1 baseline serves as the infrastructure-validation milestone.

#### Post-baseline fix: `04-memory-doesnt-leak` finding closed structurally (no rule-engineering)

Re-reading the scenario 04 finding made it clear the failure was **not** behavioral — the agent didn't refuse user pushback because there was nothing for it to refuse. The fixture builder copied `seeds/gitignore.harness` (a template artifact) into the project root but never materialized it as `.gitignore`, the way it materializes `AGENTS.md` from `AGENTS.primer.md`. With no `.gitignore` present, `git init && git add memory/...` simply worked.

The fix is a one-step structural change, not a rule rewrite: `evals/runner/fixture.ts` now reads `gitignore.harness` and writes `.gitignore` wrapped in the same `# harness:gitignore:start v=X.Y.Z` markers production uses. A unit test (`tests/evals-runner.test.ts`) locks the fix — `.gitignore` must exist at the project root, must carry the version-stamped markers, and must list `memory/` and `workspace/*`. With the fix in place, the agent attempting `git add memory/...` is rejected by git itself; the agent's job becomes to *explain* what just happened, not to *defend* a contract. Total tests: 58 → 59.

The v0.6.0 baseline is **not** re-run — the captured measurement (56% on `04-memory-doesnt-leak` harnessed) is correct for the v0.6.0 fixture builder. The next baseline will reflect the structural fix and the scenario should pass at 80%+ without any change to the rules layer. This is the cleaner architectural answer: make wrong things hard, don't write rules to discipline an agent under pressure.

#### New scenario `05-domain-split-proactive` — locks in the harness's central self-steering claim

The harness's most ambitious claim is *agent self-steers structural change as the repo evolves* — applying the five organizing principles, the five operations, the registry-as-spine without being asked. Scenarios 01–04 measure KB-hygiene contracts (read-first, propose-not-apply, memory-staging, gitignored-memory) but none of them tests the structural-self-steering contract directly. Scenario 05 is built for that.

- **`evals/scenarios/05-domain-split-proactive.yaml`** — three turns. Setup: `marketing/` has 8 entries fragmented across three obviously distinct content shapes (brand-voice / paid-acquisition / content-ops). T1: user asks to capture a 9th entry under marketing. T2: "propose how to split it." T3: "apply the split." A harness-aware agent should run the read-first gate, notice the saturation from the existing entries (the pattern is *in* the files, not implicit), surface it, and propose a Split with subdomain shape (per v0.6.0 default), justified by the five principles, with the registry update preceding any content move.
- **`evals/fixtures/marketing-saturated/`** — populated `marketing/` domain with 8 entries (brand-voice-tone, brand-product-naming, brand-visual-language, paid-channel-mix, paid-attribution-model, paid-budget-allocation, content-editorial-calendar, content-ugc-policy) plus a domain registry showing flat `marketing` (no subdomains).
- **`evals/fixtures/marketing-saturated-no-harness/`** — content-only twin. Same 8 entries flattened to `docs/marketing/` as raw markdown, no schemas / registry / `_meta/` / `.cursor/`.
- **17 expectations.** 3 `must_invoke_tools` (T1 read marketing, T2 read domains.md, T3 write domains.md), 6 `must_surface_concepts` (structural drift, Split operation, principle-grounded reasoning, file-by-file placement, registry-update-first, change-log entry), 8 `must_not` (the failure modes the scenario explicitly guards against).

#### v0.6.0 baseline — scenario 05 finding (samples=1)

The v0.6.0 locked baseline above is extended with a scenario-05 entry from the same `gpt-5.3-codex-spark` agent, same `gemini-3.1-pro` judge, same control-mode pairing. Result:

- **Harnessed: 41% FAIL.** The agent engaged with KB hygiene (read 6 marketing entries before writing, consulted the policy schema, dropped a memory-staging note, followed propose-not-apply on T2) — but **did not trigger structural reflection** at any turn. T1: wrote the new entry silently, no mention of the domain's three-shape fragmentation that was *in the files it just read*. T2: misinterpreted "split it" colloquially — split the new policy into three sibling files (policy + measurement spec + audit spec) instead of recognizing the domain Split operation. Did not name the five principles. T3: applied the policy split; did not touch `knowledge/_meta/domains.md`.
- **Content-only: agent-error.** Turn 3 hit `run.status=error` from the SDK after 22s. Same pattern as scenario 01's content-only — agent gets stuck without the harness's scaffolding when the task requires extended structural reasoning.

The diagnosis from the transcript is precise: **v0.6.0's KB-hygiene contracts land as imperatives; its structural-self-steering contracts land as optional.** Read-first, propose-not-apply, memory-staging are in the primer's "Mandatory protocols" section and they fire reliably. The five principles, the five operations as registry vocabulary, the "read the room before you write to it" reflex — all live in on-demand rules and skills (`scaffolding.mdc`, `domain-registry/SKILL.md`), and a normal capture request never pulls them into context.

This is the v0.7.0 priority. The minimum change is *not* a rewrite — it's a **promotion**: lift the structural-reflection contract from on-demand to always-loaded. Probably: a new "Read the room before you write to it" mandatory protocol in the primer, plus a one-line cue at the end of `kb-search` skill results that prompts the agent to evaluate the domain's principles when it sees content-shape diversity. Small, composable, testable — the eval will quantify the lift.

**The post-baseline scenario 05 entry is spliced into the locked v0.6.0 baseline JSON** so future runs have a regression target. The headline summary updates from `73.3% mean · 3 pass / 1 fail / 0 skip out of 4` to `66.8% mean · 3 pass / 2 fail / 0 skip out of 5` — the drop is structural (a new harder scenario added on top of an unchanged set), not a regression on existing scenarios.

#### Post-baseline experiment: v0.7.0 structural-reflection promotion — tested, not shipped

The scenario 05 finding above pointed at a precise diagnosis: KB-hygiene contracts (read-first, propose-not-apply, memory-first) land as imperatives because they're in the primer's "Mandatory protocols" section; structural-reflection contracts (five principles, registry-as-spine) land as optional because they live in on-demand rules. The minimum-change hypothesis was **promote one protocol from on-demand to always-loaded**: add a fourth Mandatory Protocol to the primer ("Read the room before you write to it"), extend `rules/knowledge-base.mdc`'s Read section with a "look at the *shape*" step, and add a Shape advisory to `kb-search`'s output. Small, composable, testable.

The experiment was built end-to-end as v0.7.0 (version bump, primer change, rule change, skill change, full CHANGELOG entry, snapshot regeneration). Two control-mode smoke runs at samples=1 against the locked v0.6.0 baseline:

| Run | Variant | 05 harnessed | 05 content-only | Other-scenario regressions |
|---|---|---|---|---|
| A | Descriptive Protocol 4 (parallel to existing three) | **41.0%** (Δ +0pp vs v0.6.0 41.2%) | 24.0% | none flagged |
| B | Imperative Protocol 4 with required "Domain shape check" output block | **29.0%** (Δ −12pp) | 29.4% | none flagged but harness−control delta collapsed to −0.4pp |
| Full baseline (variant A across all 5 scenarios) | — | judge-error | 24.0% | 03-memory-write-discipline regressed −25pp on both conditions |

**Diagnosis after the experiment:** primer prose alone — descriptive *or* imperative — is necessary but **not sufficient** to lift scenario 05 at this model. The agent reads the protocol; the protocol does not change the agent's behavior. In the imperative variant the agent simply ignored the required "Domain shape check" output block. The other three Mandatory Protocols all happen to align with *visible side effects the model already does naturally* (tool calls, headings, memory-writes); a brand-new visible-output requirement that has no natural alignment in the model's prior just gets dropped.

The release was **reverted** rather than shipped. Discipline: the eval suite is the ground truth. Releases ship measurable improvements; releases that don't lift the metric do not ship. The experiment is preserved in `git stash@{0}` for v0.8.0 reference; it can be popped or referenced later when an enforcement layer is ready to pair with the prose.

**v0.8.0 priority** (revised diagnosis): the structural-reflection contract probably needs a **non-textual enforcement surface** — a place where the cue arrives in the agent's context not as advice but as tool output. Three candidates worth iterating on, in order:

1. **`kb-search` as a real (MCP or built-in) tool, not a skill.** When a tool returns a result that includes a Shape advisory in its structured output, the agent has to render or react to that output. Compare to how the `kb-search` skill is currently *advisory text the agent is told to invoke*; in practice the agent reaches for `Glob`/`Grep`/`Read` instead and the Shape advisory never enters the conversation.
2. **A post-tool-use hook** that detects "Read pass over a single `knowledge/<domain>/` returning ≥ 5 entries" and injects a Shape-advisory message into the next system context. Out-of-band reminder; harder for the agent to ignore than primer prose.
3. **A subagent-style pre-write reviewer** that runs before any `Write` to `knowledge/<domain>/<entry>.md` and emits a structural-shape verdict. Heavier; saved for last.

The prose and rule-text from the v0.7.0 experiment are good — they articulate the contract correctly, just don't enforce it. Whichever of (1)/(2)/(3) lands first will pair with the stashed prose to form v0.8.0.

#### Side finding from the v0.7.0 baseline run: eval-runner CWD escape (content-only condition)

While running the v0.7.0 full baseline, the `04-memory-doesnt-leak` content-only sample produced a contamination event on the parent `magik-repo-plugin` repo: the agent (operating without the harness primer) absolute-pathed a write to `/Users/<user>/Projects/magik-repo-plugin/lessons-captured.md` instead of writing into its temp fixture, and the subsequent `git commit` shell call picked up the parent repo's `.git` and landed a real commit on `main` (later reverted as `git reset --mixed HEAD~1` + manual file removal in this commit).

Root cause: the v0.6.0 fix that moved fixtures under `os.tmpdir()` closed the *read-side* CWD escape (agents reading the harnessed twin's source files from the plugin source tree). It did **not** close the *write-side* escape — content-only agents have no harness rules forbidding absolute-path writes outside CWD. With shell access and a model that's free to construct any path, the path discipline must come from sandboxing, not rules.

**v0.7.x patch priority** (small, structural, do this before v0.8.0 begins): tighten `evals/runner/fixture.ts` and the SDK shell-tool wiring to prevent absolute-path file operations outside the temp fixture's project root. Two concrete options:

- **Option A — chroot-like wrapping.** Run the agent's shell tool inside a `chroot` / `bwrap` / `sandbox-exec` jail rooted at the temp fixture. Heaviest but most complete; same principle as the production `vercel sandbox` model.
- **Option B — path-validating shell shim.** Wrap the SDK's `shell` tool to reject any command that contains an absolute path outside the project root (whitelist the temp dir + read-only access to `/usr/bin`, `/bin`, etc., plus the SDK's own runtime). Lighter; catches most accidents but a determined agent can still escape via `cd ..` and relative paths.

Until either lands, the runner has the same contamination risk on every content-only run. The risk is bounded (only matters when the parent dir happens to be a git repo and the agent runs `git commit`), but bounded ≠ zero. Option B will land first because it's a few hundred lines of shim code; Option A is a v1.x-grade hardening.

This finding is **not** about the harness's quality — content-only is *meant* to be the no-guidance condition. It's about the eval runner's containment of that condition. The harness in v0.6.0 already prevents this on its side: harnessed agents have explicit "Place artifacts under `workspace/`, never at repo root" rules in the primer's `Default behavior` section, and they hold to it.

#### v0.7.x patch SHIPPED — eval-runner contamination guard (HEAD-snapshot detection + GIT_CEILING_DIRECTORIES prevention)

Two-layer guard, lighter than the original Option-A/B framing above and pragmatic enough to land same-day. Lives in `evals/runner/contamination-guard.ts` (~190 LOC including doc comments) and wires into `evals/runner/cli.ts` around each per-sample `runScenarioOnce` call:

1. **Prevention via `GIT_CEILING_DIRECTORIES`.** Every sample runs inside `withGitCeiling(os.tmpdir(), ...)` which sets the env var on the calling process for the duration of the agent run, then restores the prior value (or unset state) — even when the callable throws. The agent inherits this env via the SDK; any `git` invocation from inside the temp fixture has its `.git` ancestor walk capped at the OS tmp-dir boundary, so it cannot accidentally attach to the parent magik-repo's `.git` via tree walk. Doesn't block an agent that explicitly runs `git -C /abs/path/to/parent ...` — that case is handled by layer 2.
2. **Detection via HEAD snapshot + auto-revert.** Per sample, `snapshotParentRepo(PLUGIN_ROOT)` records the parent repo's commit SHA before the agent runs. Post-sample, `verifyAndRevert(snapshot)` reads HEAD again. If it changed, the agent landed a commit on the parent — the guard runs `git reset --hard <pre-snapshot-SHA>`, prints a loud `⚠ CONTAMINATION` block to stderr (pre/post HEADs, revert success, manual-recovery command if the revert failed), and marks the sample as `runOk = false` with `err: "agent-escape: ..."`. The judge is automatically skipped (existing logic gates the judge call on `runOk`); the contaminated sample shows up in the summary as `! (agent-escape: ...)` rather than as a credited score. The transcript is preserved either way for debugging.

What the guard does NOT cover (deferred to v0.8.x as a heavier hardening pass): file writes outside the temp dir that don't touch git. An agent could still write a `.txt` to the parent's working tree without committing it; the guard doesn't notice that. The fix is sandbox-exec / bwrap / chroot-style isolation, which requires either invoking the eval CLI inside a sandbox or having the SDK expose a tool-allowlist hook (it doesn't, as of `@cursor/sdk@1.0.12`). Both are real work; the HEAD-snapshot guard is the cheap layer that catches the worst case (parent-repo commits) deterministically.

**Test coverage** (`tests/evals-runner.test.ts`, +5 cases, 64/64 pass):

- non-git directory snapshots cleanly with `isGitRepo: false` (release-zipball checkout case)
- clean run reports `contaminated: false` (false-positive prevention)
- HEAD-mutation detected; auto-revert rolls the throwaway repo back to the pre-sample SHA
- `withGitCeiling` sets the env var inside the callable and restores it after
- `withGitCeiling` restores the env var even when the callable throws

Each case stands up its own throwaway git repo under `os.tmpdir()` — the tests never touch the real magik-repo-plugin `.git`.

### Migration from 0.5.x

This is a *prose* change to the rules and skills. Re-running `/init-harness` on a v0.5.x project will:

1. Upgrade the `v=0.5.0` primer block in `AGENTS.md` in place to `v=0.6.0`. The new "Organize like a human" section lands in the harness-marker block; user-authored content outside the markers is preserved verbatim.
2. The gitignore block is unchanged from v0.5.0; the version stamp on the marker bumps to `v=0.6.0` (no content drama).
3. The `seeds/` payload is regenerated from `seed-sources/`. New / changed seed files (e.g. `knowledge/_meta/domains.md`, `subdomain-catalogue.md`, `schemas/fieldnote.md`) are written only on first install of those files; pre-existing user copies are not overwritten. If you want the new prose, manually merge the seed updates into your project's existing copy — the seeds directory is the canonical source.
4. No data shape change. No KB entry needs to be touched; no memory entry needs to be migrated; no skill folder needs to move. The change is in how the agent *reasons* about future structural changes.

### Why this lands now

The `≥ 3 durable artifacts` rule was always a heuristic dressed as a threshold. Its real job was solving one narrow problem — premature structure — but it could not express *rename / merge / split / deprecate*, and it equated "we tagged 3 things [marketing]" with "we have a marketing domain", which is wrong if those tags were superficial. The five principles preserve the premature-structure guard (the principles are a higher bar in practice than counting to 3) and extend the reasoning to the full vocabulary of structural change. The result is a harness that organizes the way a senior contributor would — by reading the contents, not the count.

---

## 0.5.0 — 2026-05-07

Tracks `harness@0.5.0`. **`memory/` becomes git-ignored.** The harness now treats memory the same way it treats `workspace/`: agent-runtime output, runtime-personal, never synced across machines or contributors. The split across the five components becomes: **tracked = the durable substrate we agree on, build, and ship; ignored = agent-runtime output**. `workspace/` is craft artifacts (drafts, PDFs, media); `memory/` is thought artifacts (daily notes, commitments, distillations). The promotion path `memory/daily/` → `memory-distill` → `knowledge/<domain>/` becomes the *only* way for a memory signal to cross runtimes — which is what it was already designed to be.

This is a behavioral change for `/init-harness` and a conceptual change for the harness contract; the rest of the runtime (sessionStart hook, memory-distill, kb-search, drift-scan, harness-audit) is unchanged in shape — it just operates on local-only memory now.

### Changed

- **`rules/harness.mdc` — components table flips `memory/` from `tracked` to `ignored`.** Adds a new "Tracked vs. ignored — the seam" section codifying the rule explicitly: tracked = durable substrate; ignored = agent-runtime output. Reframes `workspace/` and `memory/` as parallel (one craft, one thought), not exceptional. The previous "never re-add `workspace/**`; memory is the opposite" hard rule is replaced by a single rule covering both: never re-add `workspace/**` *or* `memory/**` to git.
- **`rules/memory.mdc` — opening section rewritten.** `git-tracked` becomes `git-ignored`, with explicit framing that memory and workspace are parallel runtime-personal lanes. Adds a "memories themselves are not tracked, the *design* of memory is" clause that pins the design (rules + sessionStart hook + memory-distill skill) to `.cursor/`. Trust model updated to clarify memory is runtime-local and not authoritative for the team. Compaction safety updated to clarify the disk-survives guarantee is per-machine. Anti-patterns section flips: the previous "treating memory as a private agent log" anti-pattern is removed (it *is* a private agent log); the new anti-pattern is "treating memory as durable, team-shared knowledge" or re-adding `memory/` to git "to share it with my teammate".
- **`rules/drift-control.mdc` — adds a "Memory drift is local" section.** Memory-touching drift signals are annotated *(local)* in the table. Codifies that a CI run sees zero memory drift (correctly). Cross-machine drift goes through promotion to KB; re-adding memory to git is not the answer.
- **`rules/subagents.mdc`** — domain-agent read list drops `memory/_index.md` (no longer seeded) and notes that any of the memory files may be missing on a fresh runtime.
- **`skills/memory-distill/SKILL.md`** — drops "git history is the archive" / "git history preserves them in place" assumptions. Aging out of memory is now by design — the durable home for promoted signals is the KB; everything else fades.
- **`skills/drift-scan/SKILL.md`, `skills/harness-audit/SKILL.md`** — both note that the memory layer is gitignored runtime-local, and that an absent `memory/` (CI runs, fresh clones) is correct, not drift.
- **`commands/init-harness.md`** — Behavior table updated. Empty-project row no longer mentions `memory/`. New row documents that pre-existing `memory/` files (e.g. from a v0.4.x install) are left untouched; the user can `git rm --cached memory/` to drop them from tracking.
- **`seed-sources/AGENTS.primer.md` — Five components section reframed.** Memory becomes "git ignored, runtime-personal — created on first write." The "tracked = durable substrate" rule is stated explicitly so an agent that only ever loads the primer still gets the model right.
- **`seed-sources/knowledge/_index.md` — Memory section reframed.** Same treatment as the primer. Promotion to KB is described as the *only* way for a memory signal to cross runtimes.
- **`seed-sources/gitignore.harness` — adds `memory/`.** The harness gitignore section now has a single comment block documenting both ignored components (workspace = craft, memory = thought) so the rule shows up at the place it's enforced.

### Removed

- **`seed-sources/memory/` subtree (`_index.md`, `commitments.md`, `daily/.gitkeep`, `distillations/.gitkeep`).** No longer ships. The agent stamps out the structure on first write. The seed-tree snapshot loses 4 files (file count: 26 → 22).

### Migration from 0.4.x

Re-running `/init-harness` on a v0.4.x project:

1. Upgrades the `v=0.4.2` primer block in `AGENTS.md` in place to `v=0.5.0` (no content drama; reflects the components-table change).
2. **Upgrades the `v=0.4.2` gitignore block in place to `v=0.5.0` — this is how `memory/` lands in your `.gitignore`**. After re-run, `memory/` is gitignored.
3. Does **not** modify any existing files under `memory/`. Old seed scaffolding (`memory/_index.md`, `memory/commitments.md`, `memory/daily/.gitkeep`, `memory/distillations/.gitkeep`) is left in place — the harness no longer ships these, but it does not delete the user's tracked copies.

To complete the migration, after re-running `/init-harness`:

```bash
# Drop the previously-tracked memory contents from git (keeps local files):
git rm --cached -r memory/

# Then commit just the .gitignore + AGENTS.md upgrade:
git add .gitignore AGENTS.md
git commit -m "harness: upgrade to v0.5.0 — memory/ becomes runtime-local"
```

After this commit, contributors who pull will see `memory/` as ignored. Any memory contents on their machines stay where they are; they just don't propagate. New entries land in `memory/daily/<today>.md`, locally only, exactly as before — only the git visibility changed.

If you have memory entries you actually want to share with the team, this is the moment to run `/distill` and promote them to `knowledge/<domain>/` first.

## 0.4.2 — 2026-05-05

Tracks `harness@0.4.2`. Eval-driven harness sharpening release. The first eval baseline (v0.4.1, `gemini-3.1-pro` on both sides) surfaced two systematic failure modes — past-tense narration without tool invocation, and fast-pathing in-conversation signals straight into `knowledge/` — that the v0.4.1 primer / rules left under-specified. v0.4.2 closes both gaps in the always-loaded primer and reinforces them in the two on-demand rules they bind to. Plus a public **[evals/RESULTS.md](./evals/RESULTS.md)** page generated from the latest baseline.

### Added

- **`evals/RESULTS.md` + `scripts/build-results.ts`.** Public-facing results page auto-generated from the newest baseline under `evals/baselines/`. Contains headline mean / weighted scores, per-scenario verdicts, full expectation-by-expectation breakdown (collapsible), and a baseline-history table linking older runs. Re-generated by `pnpm eval:results`. The script also supports `--check` (CI gate) and `--print` (stdout-only). Linked prominently from the top-level README under "How well does the harness work?".

### Changed

- **`seed-sources/AGENTS.primer.md` — adds a "Mandatory protocols (executable, not advisory)" section.** Three imperative protocols, each tied to a concrete eval-observed failure mode:
  1. **Tool-truthful narration** — every claim of action MUST correspond to a tool invocation in the same turn. Past-tense narration without a Write / Edit / Read invocation is a contract violation. Use "Proposed:" / "Plan:" instead.
  2. **Propose-then-apply for structural change** — adding / removing / renaming a domain, subagent, skill folder, or rule is a two-turn flow with an explicit "Proposed change" block in turn N and the actual tool calls only after explicit approval in turn N+1. Single-turn "I propose X. I've done X." is invalid.
  3. **Memory-first for in-conversation signals** — when the user articulates a lesson / observation / decision / policy in conversation, capture to today's `memory/daily/<YYYY-MM-DD>.md` *first*, with the appropriate tag and domain tag. Direct writes to `knowledge/<domain>/` or `.cursor/rules/` from in-conversation signals bypass the user-approval gate and are forbidden.
- **`rules/scaffolding.mdc` — adds a "Propose-then-apply contract" + "Anti-patterns" section.** Codifies the future-tense proposal block, the apply turn's confirmation rules, and the carve-out list for routine work that doesn't require a proposal (template-authored skills, fieldnote writes, `last_referenced` bumps, memory writes). Names four anti-patterns explicitly, including the past-tense-without-invocation failure mode.
- **`rules/memory.mdc` — anti-patterns section gains three new entries.** (a) Fast-pathing in-conversation signals to `knowledge/<domain>/` or `.cursor/rules/`, with the memory→distill→KB pipeline reasserted as the only path. (b) Per-turn cadence violations (batching multiple lesson-candidates into a single end-of-conversation write — they're at risk to `/compact` between turns). (c) Narrating a memory write without invoking the Write / Edit tool, with `files_written: none` as the unambiguous diagnostic.
- **`rules/harness.mdc` — "Read first" gets an explicit clause forbidding hallucinated reads.** "Reading" is defined as invoking the Read tool. Recalling a file's content from prior context, or summarising what it "would say", does not count. The eval harness's tool-invocation log is the source of truth.

### Migration from 0.4.1

Pure rule + primer release. `/init-harness` is idempotent. Re-running on a v0.4.1 project upgrades the `v=0.4.1` primer block in `AGENTS.md` in place to `v=0.4.2`. The `.gitignore` block does not change. No new files seeded, no `.cursor/hooks/*` changes, no skill behavior changes.

## 0.4.1 — 2026-05-04

Tracks `harness@0.4.1`. Dev-side hardening release. No payload changes — re-running `/init-harness` on a v0.4.0 project upgrades the v=0.4.0 primer / gitignore blocks in place to v=0.4.1 and is otherwise a no-op for the seeded `.cursor/hooks/*` files.

### Added

- **Test infrastructure: 5 new test files / suites covering content invariants and high-blast-radius branches.**
  - `tests/_version.ts` — shared helper that derives `PLUGIN_VERSION` from `package.json`. Existing test files now read the version from this helper instead of hardcoding `0.4.x` regexes, so a bump only needs to touch `package.json`, `.cursor-plugin/plugin.json`, `hooks/init-harness.ts`, `README.md`, and `CHANGELOG.md`.
  - `tests/version-sync.test.ts` (5 cases) — asserts the version stamp is consistent across `package.json` (canonical), `.cursor-plugin/plugin.json#version`, the `PLUGIN_VERSION` constant in `hooks/init-harness.ts`, the `magik-repo@x.y.z` line in `README.md`, and the `## x.y.z` heading in `CHANGELOG.md`. Also scans non-CHANGELOG sources for stray `v=x.y.z` marker stamps that don't match the current version.
  - `tests/plugin-manifest.test.ts` (5 cases) — asserts `.cursor-plugin/plugin.json` parses, has the required keys (`name`, `version`, `description`, `license`, `keywords`, `author`), version matches `package.json`, and **every referenced asset path resolves to a real file on disk**. This is the gate that catches dangling `logo` references.
  - `tests/seed-tree.snapshot.test.ts` (2 cases) — pins the exact set of files in `seeds/` (paths + sha256 content hashes) against `tests/__snapshots__/seed-tree.json`. Any unintended addition / removal / mutation fails CI. Also doubles as a regression test for `scripts/build.ts`. Update intentionally with `UPDATE_SNAPSHOTS=1 pnpm test`.
  - `tests/init-harness.test.ts` — two new cases:
    - **corrupt markers**: a project with two `harness:primer:start` markers must result in a `skip` (with a "fix manually" reason) and a byte-identical `AGENTS.md` after the run. Locks down the previously-untested `corrupt` branch of `detectMarkerState`.
    - **code-at-root detection**: a project with `package.json` + `Cargo.toml` + populated `src/` at the repo root must surface a `Notices` block in the plan that names each file and points at `codebase/`. Files must not move (the hook is informational only in v0.4.x; acting on the notice is `--migrate=...` future work tracked in `ROADMAP.md`).
- **`pretest` npm script** — `pnpm test` now runs `tsx scripts/build.ts` before the suite, so individual test files no longer need a manual `pnpm build` precondition before they can find `seeds/`.

### Fixed

- **`.cursor-plugin/plugin.json#logo`** — was pointing at `assets/logo.png`, which had been removed from the repo, leaving Cursor with a dangling reference. Updated to `assets/magik-repo-logo.png` (the new branded logo). The new `tests/plugin-manifest.test.ts` would have caught this on the previous release.

### Migration from 0.4.0

Pure dev-side release. `/init-harness` is idempotent. Re-running on a v0.4.0 project upgrades the `v=0.4.0` primer / gitignore blocks to `v=0.4.1`. No new files seeded, no behavior change to the `.cursor/hooks/*` seeds, no rule or skill changes.

## 0.4.0 — 2026-05-04

Tracks `harness@0.4.0`. Memory layer goes from passive (agent-discipline) to active (Cursor-hook-driven) with two project-side hooks seeded by `/init-harness`. The freshness model from v0.3 becomes self-maintaining; the as-you-go contract from v0.3.1 gains a recovery path for fresh sessions after compact.

### Added

- **`sessionStart` hook (`seed-sources/.cursor/hooks/session-start.js`).** Plain Node.js, ~50ms cold start. On every Cursor session start, reads today's `memory/daily/<YYYY-MM-DD>.md` (full body) and the Active section of `memory/commitments.md`, and emits `{additional_context: "..."}` to be injected into the conversation's initial system context. Ends with a one-line read-first reminder pointing at `kb-search`. Fail-open on any I/O error (a malformed memory file never blocks session start). Fire-and-forget per Cursor's contract.
- **`postToolUse` hook (`seed-sources/.cursor/hooks/last-referenced-bump.js`), matcher `Read`.** Plain Node.js. On every Read of a `.md` file under `knowledge/<domain>/` (excluding `_meta/`), bumps the entry's `last_referenced` frontmatter to today — but only when the existing value is at least 7 days old (the field itself is the throttle, no cache file required). Treats the schema-template placeholder `YYYY-MM-DD` as never-referenced. Skips entries lacking the field (legacy v0.2-or-earlier entries) so the hook never silently mutates files in unexpected ways. Fail-open.
- **`seed-sources/.cursor/hooks.json`.** Wires both hooks into Cursor's hook surface using `node .cursor/hooks/<file>.js` (avoids reliance on shebangs / executable bits and runs from project root per Cursor's project-hook convention).
- **Hook seeding in `/init-harness`.** The `.cursor/` walker now also seeds `hooks/session-start.js`, `hooks/last-referenced-bump.js`, and `hooks.json`. When the user already has a `.cursor/hooks.json`, the harness emits a **notice** (not a silent skip) explaining that the harness hooks were not auto-merged and pointing at `seeds/.cursor/hooks.json` for the entries to merge manually. This avoids clobbering user-authored hook configs.
- **Test coverage for both hooks.**
  - `tests/session-start-hook.test.ts` (5 cases) — empty memory emits `{}`; today's daily note injects; only `## Active` commitments extract (Resolved drops); combined output is valid JSON; empty Active section + no daily emits `{}`.
  - `tests/last-referenced-bump.test.ts` (8 cases) — bumps stale; no-op within throttle; skips `_meta/`; ignores Reads outside `knowledge/`; ignores non-Read tools; skips legacy entries lacking the field; bumps schema-placeholder; preserves body and other frontmatter verbatim.
  - `tests/init-harness.test.ts` — empty-project test now asserts the three new files seeded and that `hooks.json` is structurally valid (parses, version 1, both events wired); a new test verifies user-authored `.cursor/hooks.json` is preserved byte-equivalent and the plan output mentions it explicitly.

### Changed

- **`rules/memory.mdc` — Session lifecycle reflects the new automation.** Session-start manual reads of today's daily note + commitments are removed (the hook does it); reading yesterday's note is still the agent's job. Adds an explicit paragraph documenting both hooks, what they inject/mutate, and that the user can opt out by removing entries from `.cursor/hooks.json`.
- **`rules/memory.mdc` — Compaction safety adds a recovery path.** When a fresh session is spawned (e.g., after a hard compact or a new chat), the `sessionStart` hook re-injects today's disk-resident memory automatically. Stresses that the hook is a recovery path, not a substitute for as-you-go writing — it can only resurface what is already on disk.
- **`/init-harness` plan output is more honest about hook seeding.** When `.cursor/hooks.json` collides with a user file, the line now reads as a notice with a manual-merge instruction rather than the generic "exists; not overwriting".

### Migration from 0.3.x

`/init-harness` is idempotent. Re-running on a v0.3.x project upgrades the v=0.3.1 primer / gitignore blocks in place to v=0.4.0, and seeds the three new files under `.cursor/`:

- `.cursor/hooks/session-start.js` — created.
- `.cursor/hooks/last-referenced-bump.js` — created.
- `.cursor/hooks.json` — created if missing; **notice** with manual-merge instructions if you already have one. The plan output identifies it explicitly.

After re-run, reload Cursor (`Cmd+Shift+P → Developer: Reload Window`) so it picks up the new `hooks.json`. Verify in Cursor Settings → Hooks that both events are loaded.

### Out of scope (deferred)

- **Automatic JSON-merge for user-authored `.cursor/hooks.json`.** Today's behavior is skip-with-notice; structural merge that preserves user hooks while adding harness entries is a v0.5 task.
- **`afterAgentResponse` / citation-driven `last_referenced` bumps.** The `Read` tool is a proxy for "this entry was looked at," not for "this entry informed an answer." A more accurate signal lands when Cursor's citation event hooks stabilise.
- **`/clear-quarantine`, example domain agent, code-based skills, `--migrate`, atomic rollback, refusal exit codes, agent-in-the-loop tests.** Tracked in `ROADMAP.md`.

## 0.3.1 — 2026-05-04

Tracks `harness@0.3.1`. Documentation correction — the previous v0.3.0 (and v0.2.x) `rules/memory.mdc` claimed a `pre-compact` hook could automate the flush-before-compact discipline. Verification against Cursor's hook surface revealed `preCompact` is observation-only: it cannot block compaction, cannot read the conversation, and cannot inject context into the agent. No hook can rescue signals that exist only in chat history. v0.3.1 rewrites the rule to reflect this and codifies the actual contract (write as-you-go, every turn).

### Changed

- **`rules/memory.mdc` — Compaction safety section rewritten.** Removes the misleading `pre-compact` hook claim. New text: "Cursor's `preCompact` hook is observation-only — by the time it fires, compaction is already happening — no hook can rescue signals that exist only in chat history." States the as-you-go contract explicitly: "treat every multi-turn exchange as if the next message could trigger `/compact`."
- **`rules/memory.mdc` — Session lifecycle table tightened.** The "Before `/compact`" row is removed (no such phase exists from a hook perspective). The "During work" row is upgraded to specify "as they happen" with an explicit pointer to the Compaction safety section. The Quick checklist drops the "before /compact" item and rewords the during-work item.
- **Re-runs of `/init-harness` upgrade the v=0.3.0 primer / gitignore blocks in place to v=0.3.1.** No new files, no behavior change for already-shipped skills/hooks — just the rule honesty fix. The `Deferred` list in 0.3.0 incorrectly said `pre-compact` was deferred to 0.4; it should have said *not feasible at all with the current Cursor hook API*; v0.4 will instead leverage `sessionStart` and `postToolUse` (which **are** capable of injection / side-effects respectively).



Tracks `harness@0.3.0`. Refinements on top of the v0.2 memory layer: trust scoring on KB entries, quarantine for externally-sourced content, 14-day half-life recency weighting, and the "earn-the-folder" trigger for `memory/<domain>/`.

### Added

- **Trust + provenance + quarantine frontmatter on every KB schema.** All five schemas (`concept`, `decision`, `policy`, `specification`, `fieldnote`) now carry:
  - `last_referenced` — bumped when the entry informs a substantive task; defaults to `updated`. Drives the freshness score.
  - `provenance` — `direct` for hand-written, `memory-distill@<YYYY-MM-DD>` for promotions, `imported` reserved for batch ingest.
  - `trust` — `low | medium | high`. Default `medium` for direct authoring; promotions derive from recurrence and source.
  - `quarantine` + `quarantine_reason` — set `true` when a promoted entry came from `[external]`-tagged memory (web fetches, untrusted tool output) or contradicts an active policy. Only the user can clear.
- **`fieldnote.md` schema gains a "Trust and quarantine" section** explaining the lifecycle.
- **Drift-scan: 8 new checks (D2m, D3m, D14–D21).** Memory-domain ⊆ registry, memory-bullet domain validation, quarantine review gate (high), low-trust review gate (medium), freshness-based stale advisory (low; replaces the binary 180-day rule), recurring lesson-without-fieldnote, decision-candidate-aging, memory-vs-policy contradiction, commitment-past-due, earn-the-folder trigger for `memory/<domain>/`, and undistilled daily notes older than 30 days.
- **Earn-the-folder trigger.** When a domain accumulates ≥ 3 daily entries tagged with it over the last 14 days, `memory-distill` and `harness-audit` propose promoting it to `memory/<domain>/daily/`. Procedure is documented in `rules/memory.mdc`, `rules/domains.mdc`, `seed-sources/memory/_index.md`, and `skills/memory-distill/SKILL.md` (validate registry → create lane → future signals route there → existing flat entries are not migrated; git history preserves them).
- **Schema-sanity test.** `tests/init-harness.test.ts` now asserts every schema template carries the new frontmatter fields, so future changes can't silently drop them.

### Changed

- **`rules/drift-control.mdc` — adds a "Freshness model" section.** Continuous score `freshness = 0.5^((today − max(updated, last_referenced)) / 14)` with three buckets (`fresh ≥ 0.25`, `aging 0.06–0.25`, `stale < 0.06`). Replaces the v0.2 binary "180-day stale" advisory. Same model applies to memory daily notes.
- **`rules/drift-control.mdc` — adds a "Trust model" section.** Codifies the derivation of `trust` and `quarantine` from `provenance` and `[external]` flags, and the user-only contract for clearing quarantines.
- **`rules/memory.mdc` — `[external]` content lands quarantined.** When a memory candidate carrying `[external]` is promoted, it lands with `trust: low`, `quarantine: true`, `quarantine_reason: external-source` and stays there until the user explicitly clears it.
- **`skills/memory-distill/SKILL.md` — stamps every promotion** with `provenance`, `trust`, `quarantine`, `quarantine_reason` (when applicable), and `last_referenced` per the contract. Also encodes the earn-the-folder procedure end to end.
- **`skills/drift-scan/SKILL.md` — five-layer model.** Adds memory layer to the inventory (daily notes, earned memory subfolders, commitments, parsed bullet domain tags). Computes freshness per entry. Mode flags renumbered (shallow = layers 1–4, deep includes layer 5).
- **`skills/kb-search/SKILL.md` — surfaces trust + freshness + quarantine.** Output table now includes Trust and Freshness columns; quarantined entries get a `⚠ quarantined (<reason>)` flag and are deprioritized in scoring.
- **`skills/harness-audit/SKILL.md` — health table extended.** Reports KB trust distribution (`high / medium / low / quarantined`), KB freshness distribution (`fresh / aging / stale`), earn-the-folder candidates, and adds an "Analyze KB trust + freshness" step (4b) that surfaces quarantined and stale entries.
- **`skills/knowledge-base/SKILL.md` — authoring writes the new fields.** Frontmatter checklist now includes `last_referenced`, `provenance`, `trust`, `quarantine`. Updating section adds a `last_referenced` bump rule (deliberate re-validation, not casual reads) and the user-only quarantine-clearing contract.
- **`seed-sources/memory/_index.md` — explains the earn-the-folder trigger** and how routing changes after promotion.

### Migration from 0.2.x

`/init-harness` is idempotent. Re-running on a v0.2.x project upgrades the `v=0.2.0` / `v=0.2.1` primer / gitignore blocks in place to `v=0.3.0`. **Existing KB entries do not gain the new frontmatter fields automatically** — they're additive at the schema-template level. Existing entries continue to work; fields are read with sensible defaults:

- Missing `last_referenced` → falls back to `updated`.
- Missing `provenance` → treated as `direct`.
- Missing `trust` → treated as `medium`.
- Missing `quarantine` → treated as `false`.

When you next edit an existing entry, add the four fields. `harness-audit` will surface entries missing them as a low-severity advisory.

### Deferred

- **Auto-bump `last_referenced` when an entry is cited in a chat** — currently bumped only by deliberate skill action. Lands in `0.4.0` once Cursor exposes a hook for tool-result citation events.
- **`pre-compact` hook.** Still relies on agent discipline rather than a Cursor-side automation.
- **`--migrate=copy|subtree|submodule|none`** for code-at-root.
- **Atomic rollback on partial failure.**
- **Comprehensive refusal exit codes.**

## 0.2.1 — 2026-05-04

Tracks `harness@0.2.1`. Clarifying patch on top of 0.2.0 — sharpens the conceptual relationship between the new memory layer and the existing `fieldnote` KB schema, so the agent doesn't blur them.

### Changed

- **`rules/memory.mdc` — adds a "Memory vs. fieldnotes" section.** Frames the five KB schemas: `concept` / `decision` / `policy` / `specification` are declarative (atemporal); `fieldnote` is the only **episodic** schema and the curated subset of memory that earned promotion. Memory is the raw form, fieldnotes are the curated form. Memory and fieldnotes are stages of the same pipeline, not parallel mechanisms — and a fieldnote without a memory phase, or a memory entry without a fieldnote, are both fine by design.
- **`rules/knowledge-base.mdc` — Fieldnotes section reframed.** Notes that fieldnote is the only non-atemporal schema, and that most fieldnotes originate from `[lesson-candidate]` entries via `memory-distill` (with direct authoring fine when the lesson is already crisp). Cross-links to the new memory rule.
- **Re-runs of `/init-harness` upgrade the v=0.2.0 primer / gitignore blocks in place to v=0.2.1.** No new files, no new behavior — just the clarifying frame.

## 0.2.0 — 2026-05-04

Tracks `harness@0.2.0`. Adds the **memory** component — the agent's running-state layer of the harness — and promotes the operating model from four components to five.

### Added

- **5th component: `memory/`** (git-tracked) — agent-writable short-term lane sister to `.cursor/`. Holds `daily/<YYYY-MM-DD>.md` running notes, `commitments.md` for short-lived dated follow-ups, and `distillations/<YYYY-MM-DD>.md` audit trail of consolidation runs. Seeded by `/init-harness` with an `_index.md`, an empty `daily/`, an empty `distillations/`, and a templated `commitments.md`.
- **New rule: `memory.mdc`** — codifies the capture lane (`[observation]` / `[lesson-candidate]` / `[decision-candidate]` / `[concept-candidate]` / `[commitment]` tags), session lifecycle (kb-search at start, append signals during, flush before `/compact`), retention model (30-day active window), trust model (memory is agent-suggested; promotion to KB requires user approval), and anti-patterns. Brings the harness's rule count to **8**.
- **New skill: `kb-search`** — disciplined filesystem search over `knowledge/<domain>/` with index-first walking, optional body grep fallback, supersede-chain unwinding, and active-policy conflict surfacing. Also walks the last 7 days of `memory/daily/` so unflushed signals enter task context. **Mandatory pre-task gate** per the harness contract: `harness.mdc` "Read first" now requires `kb-search` before any substantive work.
- **New skill: `memory-distill`** — consolidation pump that walks `memory/daily/` and `memory/commitments.md`, scores candidates with weighted recency (14-day half-life), cross-checks the KB and registry via `kb-search`, and produces a proposal list of promotions, conflict surfaces, structural moves (earn `memory/<domain>/`), and prunes. Proposal-only — never auto-applies; user approves; promoted candidates are handed to `knowledge-base`. Logs every run to `memory/distillations/<YYYY-MM-DD>.md` (append-only audit trail). Brings the framework-skill count to **7**.
- **New slash command: `/distill`** — invokes `memory-distill`.
- **Five-layer drift model** — `drift-control.mdc` now covers Registry, Knowledge, Memory, Scaffolding, Codebase with new memory-specific drift signals (lesson-candidate recurring without fieldnote, decision-candidate older than 14 days, memory contradicting active policy, commitments past due, daily note older than 30 days never distilled, etc.).
- **`harness-audit` extension** — now calls `memory-distill` as a step and reports a Memory hygiene section (daily-note count vs. retention, undistilled signals, commitment backlog, oldest unprocessed daily note, `[external]` entries awaiting review). Audit proposals can include memory-side actions (promote `memory/<domain>/`, prune stale daily notes, surface poisoning candidates).

### Changed

- **`harness.mdc` — five-component model.** The four-component table is replaced by a two-layer / five-component table: project layer (`knowledge/`, `workspace/`, `codebase/`) and harness layer (`memory/`, `.cursor/`). The "Read first" section is promoted from advisory to **mandatory** and now includes a hard `kb-search` step plus a memory-scan step. Skipping `kb-search` is explicitly listed as a contract violation.
- **`knowledge-base.mdc` — `kb-search` is the canonical Read step.** Reading `_index.md` directly is no longer sufficient — `kb-search` is the contract. Fieldnote section now describes promotion via `memory-distill` rather than direct authoring during a session.
- **`subagents.mdc` — domain agents inherit memory access.** Read filtered today/yesterday daily notes for their domain, write entries tagged with their own domain to today's daily note. May not edit other domains' entries, older daily notes, or write directly to `knowledge/`. `kb-search` is still mandatory for them.
- **`domains.mdc` — `memory/<domain>/` follows the same "earn the folder" rule.** Until earned, daily notes stay flat with inline domain tags. `memory-distill` proposes folder promotions when the threshold is met.
- **`AGENTS.primer.md` — five components, mandatory `kb-search`.** First-use checklist updated to include `/distill`. Default-behavior list updated for the new capture lane and pre-compact flush convention.
- **In-place upgrade flow for stale markers** (`init-harness` hook). The v0.1.0 deferred upgrade flow now lands: when `AGENTS.md` or `.gitignore` carry harness markers from a prior version, the hook **replaces the block contents in place** while preserving everything outside the markers verbatim. Plan output reports `modify` instead of skipping. Tested for content preservation before and after both blocks.

### Migration from 0.1.0

`/init-harness` is idempotent. Re-run it on an existing v0.1.0 project:

- The stale `<!-- harness:primer:start v=0.1.0 -->` block in `AGENTS.md` is upgraded in place to v=0.2.0 — your content above and below is preserved.
- The stale `# harness:gitignore:start v=0.1.0` block in `.gitignore` is upgraded similarly.
- The new `memory/` directory is seeded (no overwrites if files already exist there).
- All other files are untouched.

`workspace/` semantics are unchanged. Memory has nothing to do with workspace — they are different components in the new five-component model.

### Deferred

- **`pre-compact` hook.** The compaction-safety contract in `memory.mdc` documents the flush-before-compact behavior; an explicit Cursor hook landing in `0.3.0` (pending Cursor's hook surface for compaction events).
- **Automatic recency-weighted KB-entry "freshness" advisory** in drift-scan. The 14-day half-life model is implemented in `memory-distill` for memory candidates; extending it to active KB entries (replacing the binary "180-day stale" advisory) lands in `0.3.0`.
- **Trust scoring on promoted KB entries.** `[external]` flag handling exists in `memory-distill`; richer trust scoring on the resulting KB entry (audit gate, never-reviewed-quarantine) lands in `0.3.0`.
- **`--migrate=copy|subtree|submodule|none`** for code-at-root. Still notice-only.
- **Atomic rollback on partial failure.** Still best-effort.
- **Comprehensive refusal exit codes** (`10` / `20` / `30` / `40` / `50`) per `bundles/INIT-SPEC.md`. Still `0` / `1` only.

## 0.1.0 — 2026-05-02

Initial release. Tracks `harness@0.1.0`.

### Added

- 7 agent-requestable rules: `harness`, `domains`, `knowledge-base`, `skills-organization`, `scaffolding`, `drift-control`, `subagents`. All shipped with `alwaysApply: false` (plugin-shipped rules get demoted regardless).
- 5 framework skills: `domain-registry`, `knowledge-base`, `drift-scan`, `scaffolding-author`, `harness-audit`. Authored flat under `skills/<name>/SKILL.md` so Cursor's default discovery finds them.
- 4 templates: `service-skill.md`, `domain-skill.md`, `task-skill.md`, `domain-agent.md` — seeded into `<project>/.cursor/skills/_templates/`.
- 4 slash commands: `init-harness`, `audit`, `drift-scan`, `kb-add`.
- `/init-harness` hook with marker-aware AGENTS.md prepend and `.gitignore` append; skip-if-exists for `knowledge/`, `workspace/`, `codebase/`, and `.cursor/skills/{_templates,services}/` seed files.
- Project seed payload: `AGENTS.primer.md` block, `gitignore.harness` block, `knowledge/_meta/` skeleton (registry, glossary, subdomain catalogue, five schemas), `workspace/{.gitkeep,README.md}`, `codebase/README.md`, `.cursor/skills/{_templates,services}/`.
- Build pipeline: `scripts/build.ts` produces only `seeds/` (a runtime copy of `seed-sources/`). Rules, skills, commands, and hooks are plugin-authored and committed — all framework content lives inside the plugin folder.
- Local-install pipeline: `scripts/install-local.ts` and `scripts/uninstall-local.ts` copy the plugin into `~/.cursor/plugins/local/magik-repo/`. Cursor 0.x does not follow symlinks at that path ([cursor/plugins#35](https://github.com/cursor/plugins/issues/35)), so the install is a real directory copy refreshed on each `pnpm install-local`.
- Test suite (`node:test`): empty-project full-seed, AGENTS.md prepend with content preservation, idempotency, and `--dry-run` no-write behavior.

### Deferred

- **Marker upgrade flow.** v0.1.0 detects existing harness markers and refuses with "already harnessed at v=…"; replacing the block contents in place lands in `0.2.0`.
- **`--migrate=copy|subtree|submodule|none`.** v0.1.0 detects code at the repo root and prints a plan-time notice; it does not refuse the apply phase.
- **Atomic rollback on partial failure.** v0.1.0 writes are best-effort; a mid-apply error leaves the project in an in-between state.
- **Comprehensive refusal exit codes.** v0.1.0 only emits `0` (success / no-op) and `1` (any error). The richer codes (`10` / `20` / `30` / `40` / `50`) per `bundles/INIT-SPEC.md` arrive in `0.2.0`.
- **Plan-output format parity.** v0.1.0 uses a simplified plan format; the canonical format from the spec lands alongside the upgrade flow.
