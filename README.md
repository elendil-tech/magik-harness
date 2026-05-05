# magik-repo

> The all-in-one adaptive repo for managing projects/business. Integrates: knowledge base, memory, workspace, codebase, worker. **Try the magik!**

A Cursor plugin that gives a single repo the structure, knowledge schema, agent memory lane, and agent scaffolding to operate as an entire project — knowledge, agent state, artifacts, code, and worker config in one place. Self-adaptive: the harness evolves with the project via seven framework skills and eight agent-requestable rules.

The harness has **five components** in two layers:

- **Project layer** — `knowledge/` (tracked, ground truth), `workspace/` (ignored, operational artifacts), `codebase/` (tracked, code).
- **Harness layer** — `memory/` (tracked, agent's running state), `.cursor/` (tracked, agent's config).

## What ships

- **8 agent-requestable rules** (`rules/*.mdc`): `harness`, `domains`, `knowledge-base`, `memory`, `skills-organization`, `scaffolding`, `drift-control`, `subagents`.
- **7 framework skills** for harness self-management: `domain-registry`, `knowledge-base`, `kb-search`, `memory-distill`, `drift-scan`, `scaffolding-author`, `harness-audit`.
- **4 templates** seeded into your project at `.cursor/skills/_templates/` for authoring service / domain / task skills and domain agents.
- **5 slash commands**: `/init-harness`, `/audit`, `/drift-scan`, `/kb-add`, `/distill`.
- **`/init-harness` hook** that seeds `AGENTS.md`, `.gitignore`, `knowledge/`, `memory/`, `workspace/`, `codebase/`, and `.cursor/skills/{_templates,services}/` into a project — idempotently, marker-aware, never overwrites user content. v0.2 adds in-place upgrade of stale primer / gitignore blocks.

## Installing in a project (end users)

1. Enable the `magik-repo` plugin in Cursor (project or user scope).
2. In the project, run:

   ```
   /init-harness
   ```

   The command prints a plan and asks to apply. Use `--dry-run` to preview only, `--yes` to skip the prompt.

3. After install, run:

   ```
   /audit
   ```

   to pick the project's starting domains and seed `knowledge/_meta/domains.md`.

The plugin is **idempotent** — running `/init-harness` repeatedly is safe; existing user content is never overwritten. Marker-bounded blocks in `AGENTS.md` and `.gitignore` keep the harness's bytes separate from yours.

## Local development

```bash
pnpm install
pnpm install-local   # builds seeds/, then copies the plugin into ~/.cursor/plugins/local/magik-repo/
```

Then reload Cursor (Cmd+Shift+P → "Developer: Reload Window") and verify `/init-harness`, `/audit`, `/drift-scan`, `/kb-add` appear.

> **Why a copy, not a symlink?** Cursor 0.x's `loadUserLocalPlugins` does not follow symlinks — only real directories load. See [cursor/plugins#35](https://github.com/cursor/plugins/issues/35). Re-run `pnpm install-local` after each plugin change to refresh the install.

To uninstall:

```bash
pnpm uninstall-local
```

To wipe build outputs without uninstalling:

```bash
pnpm clean
```

## Layout

```
.
├── .cursor-plugin/plugin.json     # plugin manifest
├── assets/logo.png                # plugin logo
├── commands/*.md                  # slash commands (authored)
├── rules/*.mdc                    # framework rules (authored)
├── skills/<name>/SKILL.md         # framework skills (authored, flat)
├── hooks/init-harness.ts          # plugin hooks (authored)
├── scripts/                       # build & install tooling (authored)
│   ├── build.ts
│   ├── install-local.ts
│   └── uninstall-local.ts
├── seed-sources/                  # plugin-authored seed payload (committed)
│   ├── AGENTS.primer.md
│   ├── gitignore.harness
│   ├── knowledge/_meta/...
│   ├── workspace/...
│   ├── codebase/README.md
│   └── .cursor/skills/{_templates,services}/...
├── tests/init-harness.test.ts
├── package.json / tsconfig.json
├── README.md / LICENSE / CHANGELOG.md
│
└── seeds/    ← build output, gitignored, mirrors seed-sources/ at runtime
```

`rules/`, `skills/`, `commands/`, and `hooks/` are **plugin-authored, committed**. The build step only produces `seeds/` (a runtime copy of `seed-sources/`).

## How well does the harness work?

The harness is, fundamentally, an AI-instruction artifact — so the only honest signal of "is it doing its job?" is **whether AI agents operating inside a harnessed repo actually follow the rules**. We run a behavioral eval suite that drives multi-turn Cursor SDK sessions through scenarios designed to expose specific contracts (read-first gate, propose-not-apply, memory write discipline, …) and scores the transcript with an LLM judge.

→ **[evals/RESULTS.md](./evals/RESULTS.md)** — current baseline scores per scenario, with the full expectation-by-expectation breakdown.

The harness:

- Is **not** assumed to score 100%. Failing scenarios are concrete signals about which rule / skill language needs sharpening.
- Is tested across model surfaces (the default baseline runs `gemini-3.1-pro` on both sides because it has no subscription gating; switch the agent / judge with `--agent-model` / `--judge-model`).
- Has its eval architecture, scenario format, and rubric philosophy documented in [evals/README.md](./evals/README.md).

To add a scenario, see *Adding a scenario* in [evals/README.md](./evals/README.md). To regenerate the public results page after a new baseline, run:

```bash
pnpm eval:results
```

## Versioning

`magik-repo@0.4.2` ships `harness@0.4.2` content. See [CHANGELOG.md](./CHANGELOG.md).

## License

MIT — see [LICENSE](./LICENSE).
