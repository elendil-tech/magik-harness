# magik-repo

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
