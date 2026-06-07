<div align="center">

<img src="./assets/banner.png" alt="magik-repo-plugin — The all-in-one adaptive repo for full business management in Cursor" width="100%" />

<p>
  <a href="https://github.com/codeisalifestyle/magik-repo-plugin/releases">
    <img alt="Version" src="https://img.shields.io/badge/version-0.8.1-8A2BE2?style=for-the-badge" />
  </a>
  <a href="https://github.com/codeisalifestyle/magik-repo-plugin/blob/main/LICENSE">
    <img alt="License" src="https://img.shields.io/badge/license-MIT-22c55e?style=for-the-badge" />
  </a>
  <a href="https://docs.cursor.com/plugins">
    <img alt="Cursor Plugin" src="https://img.shields.io/badge/Cursor-Plugin-0ea5e9?style=for-the-badge&logo=cursor&logoColor=white" />
  </a>
  <a href="https://github.com/codeisalifestyle">
    <img alt="By codeisalifestyle" src="https://img.shields.io/badge/by-codeisalifestyle-fbbf24?style=for-the-badge&logo=github&logoColor=white" />
  </a>
</p>

🪄 **Promote a code repo into a live business repo.**
A Cursor plugin that turns any repository into a full project / business space — with an integrated knowledge base, memory layer, workspace, codebase, and AI agent configuration, all in one place.

**Try the magik!** ✨

</div>

---

## 🤔 What is magik-repo?

**magik-repo is a Cursor harness.** It takes a plain code repo and *promotes* it into a **business-level project space** that an AI agent can actually run with — not just a folder of files, but an environment with ground-truth knowledge, a memory lane, craft artifacts, code, and worker config side by side.

A "harness" here means: the scaffolding around the agent — rules, skills, slash commands, hook-driven seeding — that gives it durable context, a place to think, and a contract for how to act. The harness is **self-adaptive**: it evolves with the project via a small set of framework skills and agent-requestable rules that keep the structure honest as the project grows.

The result: **one repo becomes the project**. Knowledge, agent state, artifacts, code, and agent config all live in the same place, version-controlled where it matters, ignored where it shouldn't sync.

## 🧱 The five components

The harness organizes any repo into **five components, in two layers**:

### 🏗️ Project layer (the durable substrate — *tracked*)

📚 **`knowledge/`** — The knowledge base. Ground truth across five schemas (`concept`, `decision`, `policy`, `specification`, `fieldnote`), one folder per domain. Versioned. This is what the team and the agent both *agree on*.

💻 **`codebase/`** — Code. What you build and ship.

🎨 **`workspace/`** — *Craft artifacts*. Drafts, PDFs, media, exploratory outputs the agent generates in flight. Gitignored — runtime-personal, doesn't sync across machines or contributors.

### 🛠️ Harness layer (the agent's working surface)

⚙️ **`.cursor/`** — Agent configuration. Skills, subagents, rules, templates. Tracked, because how the agent works is part of the project.

🧠 **`memory/`** — *Thought artifacts*. The agent's short-term lane: daily notes, commitments, distillations. Gitignored — runtime-personal. Anything that needs to cross runtimes is **promoted** to `knowledge/<domain>/` via the `memory-distill` skill.

> 💡 **One rule covers the split:** tracked = the durable substrate we agree on, build, and ship. Ignored = agent-runtime output, runtime-personal. `workspace/` is craft, `memory/` is thought; both are created in flight by the agent and don't sync across machines or contributors.

## ✨ Features

🪄 **One command to harness any repo** — `/init-harness` seeds the full five-component layout in seconds, idempotently and marker-aware, **never overwriting your content**.

🧬 **Self-adaptive structure** — eight agent-requestable rules and seven framework skills let the harness evolve with the project: domains can be added, renamed, merged, split, or deprecated through a controlled protocol.

📚 **Integrated knowledge base** — five schemas (`concept`, `decision`, `policy`, `specification`, `fieldnote`) under `knowledge/<domain>/`, with cross-linking, supersede chains, and a mandatory read-first gate before any substantive work.

🧠 **First-class agent memory** — a dedicated short-term lane under `memory/` with session lifecycle, compaction safety, and a **promotion contract** to lift durable signal up into the knowledge base.

🧭 **Drift control** — built-in protocol to detect and reconcile disagreements across registry / knowledge / memory / scaffolding / codebase. Run `/drift-scan` any time; `/audit` for a holistic review.

🎯 **Domain-shaped subagents** — author specialist workers (engineering-agent, marketing-agent, …) hired for a single domain, with the right templates and placement.

🧰 **Five slash commands** out of the box — `/init-harness`, `/audit`, `/drift-scan`, `/kb-add`, `/distill`.

🧪 **Behavioral evals** — multi-turn Cursor SDK sessions across model surfaces score whether agents *actually follow the rules*. The harness is tested, not assumed.

📦 **Pure additive install** — drops into existing repos as a Cursor plugin, with no migrations and no lock-in. Uninstall = delete the folders.

---

## 📦 Install

Enable the `magik-repo` plugin in Cursor (project or user scope), then run from any project:

```bash
/init-harness
```

The command prints a plan and asks to apply. Use `--dry-run` to preview only, `--yes` to skip the prompt.

After install, pick the project's starting domains and seed the registry:

```bash
/audit
```

> 🛡️ **Idempotent and safe.** Running `/init-harness` repeatedly never overwrites user content. Marker-bounded blocks in `AGENTS.md` and `.gitignore` keep the harness's bytes cleanly separate from yours.

## 🚀 Quick start

Once installed in a project, drive the harness with these five commands:

| Command | Does |
| --- | --- |
| 🪄 `/init-harness` | Seeds the four-component layout (`AGENTS.md`, `.gitignore`, `knowledge/`, `workspace/`, `codebase/`, `.cursor/skills/`). `memory/` is created on first agent write. |
| 🧭 `/audit` | First-time setup on empty projects, periodic review otherwise. Picks domains, surfaces drift, recommends restructures. |
| 🔍 `/drift-scan` | Detects disagreements across registry / knowledge / scaffolding / (optionally) codebase. Outputs a triage report. |
| 📝 `/kb-add` | Adds a knowledge base entry, guided by schema (`concept` / `decision` / `policy` / `specification` / `fieldnote`), domain, and id. |
| 🧠 `/distill` | Consolidates signals from `memory/daily/` and `memory/commitments.md` into proposed KB promotions. **Proposal-only — you approve.** |

### 🧭 A typical session

```text
You:   /init-harness
Agent: → seeds knowledge/, workspace/, codebase/, .cursor/skills/, AGENTS.md, .gitignore
       → memory/ is gitignored; agent will create memory/daily/<today>.md on first write

You:   /audit
Agent: → walks domain choices, seeds knowledge/_meta/domains.md
       → flags scale-up / scale-down / merge / deprecate suggestions

You:   work, think, capture signal in memory/daily/<today>.md

You:   /distill
Agent: → scores recency-weighted candidates from memory/
       → proposes promotions to knowledge/<domain>/ (you approve each)
       → logs to memory/distillations/<YYYY-MM-DD>.md (append-only audit trail)

You:   /drift-scan
Agent: → triages disagreements across layers, proposes fixes
```

---

## 🧰 What ships

📜 **8 agent-requestable rules** (`rules/*.mdc`) — the contracts the agent reads on demand: `harness`, `domains`, `knowledge-base`, `memory`, `skills-organization`, `scaffolding`, `drift-control`, `subagents`.

🧪 **7 framework skills** for harness self-management — `domain-registry`, `knowledge-base`, `kb-search`, `memory-distill`, `drift-scan`, `scaffolding-author`, `harness-audit`.

🧱 **4 templates** seeded into your project at `.cursor/skills/_templates/` for authoring **service / domain / task** skills and **domain agents**.

🎮 **5 slash commands** — `/init-harness`, `/audit`, `/drift-scan`, `/kb-add`, `/distill`.

🪝 **`/init-harness` hook** that seeds `AGENTS.md`, `.gitignore`, `knowledge/`, `workspace/`, `codebase/`, and `.cursor/skills/{_templates,services}/` into a project — idempotently, marker-aware, never overwrites user content. `memory/` is **not** seeded — it's gitignored runtime-local agent state (parallel to `workspace/`); the agent creates `memory/daily/<today>.md` on its first signal capture. v0.2+ adds in-place upgrade of stale primer / gitignore blocks.

---

## 🧑‍💻 Local development

```bash
pnpm install
pnpm install-local   # builds seeds/, then copies the plugin into ~/.cursor/plugins/local/magik-repo/
```

Then reload Cursor (Cmd+Shift+P → "Developer: Reload Window") and verify `/init-harness`, `/audit`, `/drift-scan`, `/kb-add`, `/distill` appear.

> ❓ **Why a copy, not a symlink?** Cursor 0.x's `loadUserLocalPlugins` does not follow symlinks — only real directories load. See [cursor/plugins#35](https://github.com/cursor/plugins/issues/35). Re-run `pnpm install-local` after each plugin change to refresh the install.

🗑️ Uninstall:

```bash
pnpm uninstall-local
```

🧹 Wipe build outputs without uninstalling:

```bash
pnpm clean
```

## 🗂️ Layout

```text
.
├── .cursor-plugin/plugin.json     # plugin manifest
├── assets/                        # banner, logo, social card
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
├── evals/                         # behavioral eval suite + results
├── package.json / tsconfig.json
├── README.md / LICENSE / CHANGELOG.md
│
└── seeds/    ← build output, gitignored, mirrors seed-sources/ at runtime
```

`rules/`, `skills/`, `commands/`, and `hooks/` are **plugin-authored, committed**. The build step only produces `seeds/` (a runtime copy of `seed-sources/`).

---

## 🧪 How well does the harness work?

The harness is, fundamentally, an AI-instruction artifact — so the only honest signal of "is it doing its job?" is **whether AI agents operating inside a harnessed repo actually follow the rules**. We run a behavioral eval suite that drives multi-turn Cursor SDK sessions through scenarios designed to expose specific contracts (read-first gate, propose-not-apply, memory write discipline, …) and scores the transcript with an LLM judge.

➡️ **[evals/RESULTS.md](./evals/RESULTS.md)** — current baseline scores per scenario, with the full expectation-by-expectation breakdown.

The harness:

- ❌ Is **not** assumed to score 100%. Failing scenarios are concrete signals about which rule / skill language needs sharpening.
- 🤖 Is tested **across model surfaces**. Default agent is `gpt-5.3-codex-spark` (free / high-volume tier) — running on a smaller, free model is a more honest test of what the harness contributes, since a stronger model can fake some of what the harness gives via raw capability. The judge is `gemini-3.1-pro` (low-volume / longer-session — fits transcript grading). Cross-family checks are one flag away: `--agent-model gemini-3.1-pro` swaps the agent.
- 📐 Has its eval architecture, scenario format, and rubric philosophy documented in [evals/README.md](./evals/README.md).

🆕 To add a scenario, see *Adding a scenario* in [evals/README.md](./evals/README.md). To regenerate the public results page after a new baseline:

```bash
pnpm eval:results
```

---

## 🏷️ Versioning

`magik-repo@0.8.1` ships `harness@0.8.1` content. See [CHANGELOG.md](./CHANGELOG.md) for the full history.

## 📄 License

MIT — see [LICENSE](./LICENSE). Build cool things. 🪄

---

<div align="center">

<sub>Made with 🪄 by <a href="https://github.com/codeisalifestyle">codeisalifestyle</a> · Powered by <a href="https://cursor.com">Cursor</a></sub>

</div>
