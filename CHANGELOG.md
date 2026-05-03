# magik-repo

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
