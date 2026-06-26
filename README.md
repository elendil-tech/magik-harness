<div align="center">

<img src="./assets/banner.png" alt="magik-repo-plugin — the light harness for Cursor" width="100%" />

<p>
  <a href="https://github.com/codeisalifestyle/magik-repo-plugin/releases">
    <img alt="Version" src="https://img.shields.io/badge/version-1.4.0-8A2BE2?style=for-the-badge" />
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

🪄 **Point your code repo at a knowledge + memory vault — then let the agent read first and keep it clean.**
A light Cursor harness: your repo stays a normal code repo, and the knowledge base (the project's ground truth) and memory (the AI's log) live in an external vault the agent connects to.

**Try the magik!** ✨

</div>

---

## 🤔 What is magik-repo?

**magik-repo is a light Cursor harness — a pointer plus a janitor.** Your repo stays a normal code repo. The harness adds two external *services* and a tracked pointer to them:

- 📚 **Knowledge base** — the project's foundational truth (decisions, policies, specs, business context, decisions). The agent reads it before work and maintains it on request.
- 🧠 **Memory** — the agent's running log of what happened and was learned. The agent writes it freely, never auto-promoted into the KB.

Both are plain Markdown in an **external vault** (a folder outside the repo, e.g. an Obsidian vault). A tracked `.cursor/harness.json` names the vault and the mounts, so every git worktree of your clone resolves the **same** source.

## 🧱 How it's wired

```text
code repo (your repo)                external vault (your storage)
├── <your code at root>             ├── <mount>/knowledge/   ← ground truth
├── AGENTS.md   (primer block)      │   └── _index.md
└── .cursor/                        └── <mount>/memory/      ← the AI's log
    ├── harness.json  ← pointer ───▶    └── daily/<date>.md
    └── hooks/session-start.js
```

```json
{
  "schema": "magik-repo/harness@1",
  "vault": "~/Projects/elendil-technologies-vault",
  "knowledge": { "mount": "falconproxy/knowledge", "accessVia": "path", "autonomy": "open" },
  "memory":    { "mount": "falconproxy/memory",    "accessVia": "path" }
}
```

`accessVia` is `path` (local folder, default) or `mcp` (remote storage wired through your MCP config). `~` expands at resolve time. `knowledge.autonomy` tunes how freely the agent writes the KB (`open` default / `ask` / `readonly` — see [Tuning KB autonomy](#-tuning-kb-autonomy)). Whether the vault is user-level (many projects) or project-level (one) is **your** choice — the harness doesn't enforce it.

## 🧭 The three rules

1. **Read the KB before substantive work.** The agent resolves the KB and reads it before producing, modifying, or committing anything domain-relevant. If an active policy would be violated, it stops and surfaces it.
2. **Keep the KB in sync — at the autonomy you grant.** It's human-authored ground truth; `knowledge.autonomy` tunes how freely the agent maintains it. Default `open` — it keeps the KB in step with its work *without asking*, surfacing only large or destructive restructurings. See [Tuning KB autonomy](#-tuning-kb-autonomy).
3. **Memory is the agent's; the KB is yours.** The agent writes memory freely and never auto-promotes it into the KB. Durable, shared truth belongs in the KB, not memory.

## ✨ Features

🪄 **One command to wire any repo** — `/magik-repo-setup` is a short Q&A (vault path, layout, access method) that writes the pointer, primer, and hook, and scaffolds the vault — idempotently, marker-aware, **never overwriting your content**.

📚 **Read-first knowledge base** — a mandatory `kb-search` gate before substantive work, over your external, human-authored KB. Light structure floor (frontmatter + links + optional `_index.md`), no enforced schemas.

🧠 **Agent-owned memory** — a daily log in the vault; the session-start hook injects today's notes. No promotion ceremony — past lessons are found with the agent's own search.

🧹 **Two janitor commands** — `/magik-repo-kb-sanitize` heals the KB from the inside (conflicts, legacy remnants, broken links, and metadata-standard drift — tags, relations, dangling `[[id]]` refs); `/magik-repo-kb-code-sync` checks documented policies/features against the code. Both honor `knowledge.autonomy`.

🎚️ **Tunable KB autonomy** — `knowledge.autonomy` in the manifest sets how hands-free the agent is with the KB: `open` (default — maintain it in sync with the work, no asking), `ask` (write only on request/approval), or `readonly` (report only). Chosen at setup; change it any time by editing the manifest.

🏷️ **Recommended metadata standard** — a portable, project-agnostic convention (`kb-conventions`) for frontmatter, tagging, and relations, plus the judgment for applying it coherently. Additive only: the required floor stays `status` + `updated`; each project owns its tag vocabulary.

📦 **Pure additive install** — drops into existing repos with no migrations and no lock-in. The repo footprint is tiny: a pointer, a primer block, a `.gitignore` secret block, and one hook.

---

## 📦 Install & setup

Enable the `magik-repo` plugin in Cursor (project or user scope), then run from any project:

```bash
/magik-repo-setup
```

`/magik-repo-setup` asks where your vault is (or creates one), how it's laid out (user-level vs project-level → mounts), how the agent reaches it (`path` or `mcp`), and how freely it may write the KB (`knowledge.autonomy`: `open` default / `ask` / `readonly`). It then writes `.cursor/harness.json`, the `AGENTS.md` primer block, a slim `.gitignore` secret block, and the session-start hook — and scaffolds the vault side (knowledge `_index.md`, memory dir).

> 🛡️ **Idempotent and safe.** Re-running `/magik-repo-setup` never overwrites your content. Marker-bounded blocks in `AGENTS.md` and `.gitignore` keep the harness's bytes cleanly separate from yours, and upgrade in place.

## 🚀 The three commands

| Command | Does |
| --- | --- |
| 🪄 `/magik-repo-setup` | Point this repo at a vault (interactive). Writes the pointer + primer + hook; scaffolds the vault. |
| 🧹 `/magik-repo-kb-sanitize` | Heal the KB from the inside — logical conflicts, legacy/orphaned entries, broken/obsolete links. Applies per `knowledge.autonomy`. |
| 🔍 `/magik-repo-kb-code-sync` | Check for drift between the KB and the code — documented policies/features vs. reality. Triage report; reconciles the KB per `knowledge.autonomy`. |

### 🎚️ Tuning KB autonomy

`knowledge.autonomy` in `.cursor/harness.json` controls how freely the agent writes the KB **on its own initiative**. Pick it at setup; change it any time by editing the manifest.

| Value | What the agent does |
| --- | --- |
| **`open`** (default) | Maintains the KB as part of its work — adds and updates the entries a task touches to keep documentation and code from drifting, **without asking**. Large or destructive restructurings (mass renames, folder reorgs, deleting/rewriting others' entries) are still surfaced first. |
| **`ask`** | Reads always; writes or reshapes the KB **only** when you ask, or when you approve a `/magik-repo-kb-sanitize` / `/magik-repo-kb-code-sync` proposal. |
| **`readonly`** | Never writes the KB — reports what it would change and leaves the edit to you. |

An explicit instruction always overrides the default for that action. Whatever the setting, the agent never silently reorganizes structure or rewrites your entries.

### 🧭 A typical session

```text
You:   /magik-repo-setup
Agent: → Q&A: vault path, layout, access; writes .cursor/harness.json, AGENTS.md primer,
         .gitignore block, session-start hook; scaffolds <vault>/knowledge + memory

You:   author the project's foundational context in the vault KB

You:   work — the agent reads the KB first, writes lessons to memory/daily/<today>.md

You:   /magik-repo-kb-sanitize    → proposes fixes for conflicts / legacy / broken links (you approve)
You:   /magik-repo-kb-code-sync   → reports where the code and the documented truth disagree
```

---

## 🧰 What ships

📜 **4 agent-requestable rules** (`rules/*.mdc`) — `harness` (the operating model + manifest resolution + the three rules), `knowledge-base` (read/maintain the human-authored KB + structure floor), `memory` (the agent-owned log, no promotion), `kb-conventions` (the recommended metadata standard — frontmatter, tags, relations — + the judgment for it).

🧪 **3 framework skills** — `kb-search` (read-first gate), `kb-sanitize` (internal KB coherence), `kb-code-sync` (KB ↔ code drift).

🎮 **3 slash commands** — `/magik-repo-setup`, `/magik-repo-kb-sanitize`, `/magik-repo-kb-code-sync`.

🪝 **1 setup hook** (`hooks/setup.ts`) that performs `/magik-repo-setup`'s deterministic writes, plus a seeded `session-start` hook that resolves the manifest and injects today's memory + a read-first reminder.

---

## 🧑‍💻 Local development

```bash
pnpm install
pnpm install-local   # builds seeds/, then copies the plugin into ~/.cursor/plugins/local/magik-repo/
```

Then reload Cursor (Cmd+Shift+P → "Developer: Reload Window") and verify `/magik-repo-setup`, `/magik-repo-kb-sanitize`, `/magik-repo-kb-code-sync` appear.

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
├── commands/*.md                  # /magik-repo-setup, /magik-repo-kb-sanitize, /magik-repo-kb-code-sync (authored)
├── rules/*.mdc                    # harness, knowledge-base, memory, kb-conventions (authored)
├── skills/<name>/SKILL.md         # kb-search, kb-sanitize, kb-code-sync (authored)
├── hooks/setup.ts                 # the /magik-repo-setup hook (authored)
├── scripts/                       # build & install tooling (authored)
├── bundles/ARCHITECTURE-v1.md     # the light-harness design spec
├── seed-sources/                  # plugin-authored seed payload (committed)
│   ├── AGENTS.primer.md
│   ├── gitignore.harness
│   ├── .cursor/
│   │   ├── harness.json           # the vault-pointer template (tokens filled at /magik-repo-setup)
│   │   ├── hooks.json             # sessionStart wiring
│   │   └── hooks/session-start.js
│   └── vault/                     # vault-side seeds (knowledge/_index.md)
├── tests/                         # node:test suite (setup, hook, version, seed-tree, manifest)
├── package.json / tsconfig.json
├── README.md / LICENSE / CHANGELOG.md
│
└── seeds/    ← build output, gitignored, mirrors seed-sources/ at runtime
```

`rules/`, `skills/`, `commands/`, and `hooks/` are **plugin-authored, committed**. The build step only produces `seeds/` (a runtime copy of `seed-sources/`).

---

## 🧪 Testing

The plugin ships a deterministic `node:test` suite (`pnpm test`) covering the setup hook's writes (manifest, primer/`.gitignore` markers, idempotency, dry-run, `accessVia=mcp`), the session-start hook's manifest resolution, version-stamp sync across `package.json` / manifest / hook, the plugin manifest's validity, and a seed-tree snapshot. It runs offline with no API keys and no cost.

---

## 🏷️ Versioning

`magik-repo@1.4.0` ships `harness@1` content. See [CHANGELOG.md](./CHANGELOG.md) for the full history.

## 📄 License

MIT — see [LICENSE](./LICENSE). Build cool things. 🪄

---

<div align="center">

<sub>Made with 🪄 by <a href="https://github.com/codeisalifestyle">codeisalifestyle</a> · Powered by <a href="https://cursor.com">Cursor</a></sub>

</div>
