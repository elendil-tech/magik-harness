# magik-repo

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
