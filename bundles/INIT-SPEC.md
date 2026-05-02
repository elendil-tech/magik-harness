# `/init-harness` — specification (working draft)

> **Status:** draft, `v0.1.0` of the spec, targeting `harness@0.1.0`.
> **Format:** working draft in `bundles/`. Promote to `knowledge/engineering/specifications/init-harness.md` once the `engineering` domain earns its folder.
> **Companion docs:** [`manifest.md`](./manifest.md) (what ships), [`INSTALL.md`](./INSTALL.md) (manual install paths).

---

## Summary

`/init-harness` is the slash command (shipped by the `harness-worker` Cursor plugin) that seeds a project with the harness's project-side scaffolding — `AGENTS.md`, `.gitignore`, `knowledge/`, `workspace/`, `codebase/` — without overwriting anything the project already has. It works in three modes by detection:

1. **Empty project** — lay down the full seed.
2. **Existing project, no harness markers** — additive merge: prepend / append delimited blocks to existing `AGENTS.md` and `.gitignore`; create only the folders that don't yet exist.
3. **Existing harness, version mismatch** — replace only the contents *between* harness markers; everything outside is untouched.

The command is idempotent: rerunning on a current project is a no-op.

---

## Goals

- Make adoption a single command for both fresh repos and existing projects.
- Never destroy or overwrite user content. Ever.
- Make upgrades safe and surgical (replace only the harness's own delimited blocks).
- Keep the agent's role to orchestration (detect → plan → confirm). All filesystem mutation goes through a deterministic hook.
- Surface refusals clearly when the project shape is ambiguous (e.g. code at repo root) instead of silently doing the wrong thing.

## Non-goals

- Not responsible for first-time domain selection — that's `/audit`'s job after init.
- Not responsible for choosing service skills, scaffolding agents, or writing KB entries.
- Not responsible for migrating existing code into `codebase/` — only for surfacing the README that documents the migration patterns. The user runs the migration themselves.
- Not a package manager. No npm publish, no GitHub release automation, no version negotiation with remote registries.

---

## Command contract

### Invocation

```
/init-harness                      # interactive: detect → plan → confirm → apply
/init-harness --dry-run            # detect → plan → exit 0; no writes
/init-harness --yes                # detect → plan → apply without confirmation
/init-harness --upgrade            # explicit upgrade path; refuse if no harness markers found
/init-harness --version            # print plugin version and exit
```

### Working directory

The agent's cwd is the user's project root. The hook resolves all paths relative to that root. Plugin-cached files (under `~/.cursor/plugins/...`) are read sources only; the hook never writes there.

### Exit semantics

| Code | Meaning |
| --- | --- |
| `0` | Success. Plan applied, or `--dry-run` produced a plan, or no-op. |
| `10` | User aborted at the confirmation prompt. |
| `20` | Refusal: project shape requires explicit acknowledgement (see Refusal cases). |
| `30` | Hard collision: incompatible existing content (see Refusal cases). |
| `40` | Harness version mismatch and `--upgrade` not passed. |
| `50` | Internal error reading the seed payload from the plugin. |

The agent surfaces non-zero exits with the relevant diagnostic. The hook never half-writes — either the plan applies fully or nothing on disk changes.

---

## Marker grammar

All injected content lives between versioned delimited blocks so upgrades can replace just the harness's own bytes. Two file types use markers:

### `AGENTS.md`

```markdown
<!-- harness:primer:start v=0.1.0 -->

…primer body…

<!-- harness:primer:end -->
```

### `.gitignore`

```
# harness:gitignore:start v=0.1.0

…ignore rules…

# harness:gitignore:end
```

### Marker rules

1. The `start` marker carries a `v=<plugin-version>` attribute. The `end` marker has no attribute.
2. There is **at most one** harness block per file. If a second pair is detected, the hook refuses with exit code `30`.
3. The block is treated as **harness-owned**. Its contents are replaced verbatim on upgrade.
4. Anything outside the block is **user-owned** and never touched.
5. If a user wants to disable the harness's content but keep their custom edits, they delete the block (markers and all). The hook will not re-add it unless the user re-runs `/init-harness` explicitly.

### Position

- For new files: the harness block is the only content.
- For existing `AGENTS.md`: prepend the block at the top of the file (most-visible position; user content stays unchanged below).
- For existing `.gitignore`: append the block at the bottom (gitignore semantics are first-match-wins for include patterns; appending preserves earlier user rules).

---

## Seed payload

Exhaustive list of what the plugin bundles under `<plugin>/seeds/` and what the hook places at the project root.

### Always seeded (created if missing, otherwise marker-merged)

| Source (in plugin) | Destination (in project) | Behavior if exists |
| --- | --- | --- |
| `seeds/AGENTS.primer.md` | `AGENTS.md` | Marker-merge (prepend block) |
| `seeds/gitignore.harness` | `.gitignore` | Marker-merge (append block) |
| `seeds/knowledge/_index.md` | `knowledge/_index.md` | Skip if file exists |
| `seeds/knowledge/_meta/domains.md` | `knowledge/_meta/domains.md` | Skip if file exists |
| `seeds/knowledge/_meta/glossary.md` | `knowledge/_meta/glossary.md` | Skip if file exists |
| `seeds/knowledge/_meta/subdomain-catalogue.md` | `knowledge/_meta/subdomain-catalogue.md` | Skip if file exists |
| `seeds/knowledge/_meta/schemas/concept.md` | `knowledge/_meta/schemas/concept.md` | Skip if file exists |
| `seeds/knowledge/_meta/schemas/decision.md` | `knowledge/_meta/schemas/decision.md` | Skip if file exists |
| `seeds/knowledge/_meta/schemas/policy.md` | `knowledge/_meta/schemas/policy.md` | Skip if file exists |
| `seeds/knowledge/_meta/schemas/specification.md` | `knowledge/_meta/schemas/specification.md` | Skip if file exists |
| `seeds/knowledge/_meta/schemas/fieldnote.md` | `knowledge/_meta/schemas/fieldnote.md` | Skip if file exists |
| `seeds/workspace/.gitkeep` | `workspace/.gitkeep` | Skip if file exists |
| `seeds/workspace/README.md` | `workspace/README.md` | Skip if file exists |
| `seeds/codebase/README.md` | `codebase/README.md` | Skip if file exists |

### Folders created if missing

`knowledge/`, `knowledge/_meta/`, `knowledge/_meta/schemas/`, `workspace/`, `codebase/`.

### Never touched at runtime

`knowledge/<domain>/`, `.cursor/skills/<domain>/`, `.cursor/skills/services/`, `.cursor/agents/`, `.cursor/hooks/`, `codebase/<contents>/`. These are user-owned at all times.

### Note on the schemas

Schemas must be project-local — they are referenced as files to copy into `knowledge/<domain>/<id>.md` per the `knowledge-base` skill. They cannot live only in the plugin cache because the agent's "copy this template" action requires a project-relative source path.

---

## Detection matrix

Each row defines (a) what the hook checks, (b) the resulting state label, and (c) what `apply` will do for that state.

### `AGENTS.md`

| State label | Detection | Apply |
| --- | --- | --- |
| `absent` | File does not exist | Write file with primer block as full contents |
| `clean` | Exists, no `harness:primer:*` markers | Prepend primer block to top of file |
| `current` | Markers present, `v=<current>` matches plugin version | No-op |
| `stale` | Markers present, `v=<other>` ≠ plugin version | Replace block contents only (preserves rest of file) |
| `corrupt` | Multiple block pairs, or unmatched start/end | Refuse, exit `30`, instruct user to fix manually |

### `.gitignore`

Same five states as `AGENTS.md`, with marker `harness:gitignore:*` and append-instead-of-prepend behavior.

### `knowledge/`

| State label | Detection | Apply |
| --- | --- | --- |
| `absent` | Folder does not exist | Create folder + all seed files |
| `partial` | Folder exists, missing one or more seed files under `_meta/` | Create only the missing files |
| `complete` | Folder exists, all seed `_meta/` files present | No-op |

### `workspace/`

Same three states as `knowledge/` for `.gitkeep` and `README.md`. User-created `<domain>/` subfolders are ignored by the matrix.

### `codebase/`

| State label | Detection | Apply |
| --- | --- | --- |
| `absent` | Folder does not exist | Create folder + `README.md` |
| `empty` | Folder exists, only `README.md` present (or also empty) | Create / overwrite `README.md` only if absent or unchanged from a prior seed version (marker-less; uses content hash) |
| `populated` | Folder exists with user content | Skip; warn in plan output |

### Code-at-root detection

Heuristics for code presence at the project root (not inside `codebase/`):

- `package.json`, `pnpm-lock.yaml`, `yarn.lock`, `bun.lockb` at repo root.
- `pyproject.toml`, `poetry.lock`, `uv.lock`, `requirements.txt` at repo root.
- `Cargo.toml`, `go.mod`, `Gemfile`, `mix.exs`, `composer.json`, `pom.xml`, `build.gradle` at repo root.
- A populated `src/` directory at repo root.

If any matches, the plan **flags but does not move** the code, and the apply phase requires `--migrate=<copy|subtree|submodule|none>` to be set explicitly. Without that flag, exit `20`.

---

## Plan output format

The plan phase prints a single block to stdout for human review (and for the agent to summarize). Format:

```
/init-harness — plan (harness@0.1.0)

  AGENTS.md         prepend harness primer (delimited block)
  .gitignore        append harness section (delimited block)
  knowledge/        create with _meta/ schemas, registry, glossary, catalogue
  workspace/        create with .gitkeep and README
  codebase/         skip — already populated (3 files, ignored)

  Notice: detected package.json and src/ at repo root.
          The harness expects code under codebase/.
          See codebase/README.md for migration patterns. Not moved.
          Re-run with --migrate=copy|subtree|submodule|none to acknowledge.

  Net writes:       2 files modified, 8 files created, 5 folders created.
  Refusals:         0.

Proceed? [Y/n]
```

The format is stable across versions so it can be machine-read by tests and by the agent.

---

## Apply phase semantics

1. Compute the full set of writes from the plan.
2. Validate seed payload integrity (every source file exists in the plugin's `seeds/` directory).
3. Open every target file for write *in memory* before touching disk; abort the entire run if any open fails.
4. Write all files. On any failure mid-write, attempt rollback by truncating files that were created in this run and restoring previously-read contents for files that were modified.
5. Print summary:
   ```
   /init-harness — applied (harness@0.1.0)

     Created:  knowledge/_index.md, knowledge/_meta/domains.md, …
     Modified: AGENTS.md, .gitignore
     Skipped:  codebase/

   Next: run /audit to pick your starting domains.
   ```

The "all-or-nothing" property is important — partial application leaves the project in a confusing in-between state and breaks idempotency.

---

## Upgrade matrix

Re-running `/init-harness` (or `/init-harness --upgrade`) on an already-seeded project compares the plugin version to the markers' `v=` attribute and produces an upgrade plan.

| Files with markers | Behavior |
| --- | --- |
| All `current` | Plan: no-op. Print "harness@<v> already current." Exit 0. |
| Any `stale` | Plan: replace block contents in those files. Print diff if `--verbose`. Apply on confirmation. |
| Any `corrupt` | Refuse with exit 30. |

| Files without markers (skipped category) | Behavior |
| --- | --- |
| New seed files added in this version (e.g. a new schema) | Plan: create the new files only if missing. Existing files untouched even if their content has drifted from the new version. |
| Renamed seed files | Plan: print rename note; require user to manually move (renames are not auto-applied to avoid data loss). |
| Removed seed files (e.g. a schema deprecated) | Plan: do not delete. Print a deprecation note and let the user decide. |

The asymmetry is deliberate: marker-bounded files have a clear contract for "harness owns this block"; skip-category files (schemas, glossary, etc.) are owned by the user once seeded. The harness adds, never deletes.

---

## Idempotency

- A second `/init-harness` invocation on a project at the same plugin version produces a no-op plan.
- A `/init-harness --dry-run` always produces the same plan as the next non-dry run, given an unchanged filesystem.
- The hook makes no time-dependent decisions. It does not write `created:` timestamps to seed files (the schemas accept user-set timestamps; the hook doesn't fill them in).

---

## Refusal cases

The hook refuses (does not apply, prints a clear message, exits non-zero) in these cases:

| Case | Exit | Required action |
| --- | --- | --- |
| Code detected at repo root, no `--migrate` flag | `20` | Re-run with `--migrate=copy\|subtree\|submodule\|none` |
| Multiple harness blocks in `AGENTS.md` or `.gitignore` | `30` | Manually resolve so exactly zero or one block remains |
| Existing `knowledge/_meta/domains.md` with content but missing required frontmatter | `30` | Manually conform or remove the file |
| Plugin's `seeds/` directory missing or unreadable | `50` | Reinstall or update the plugin |
| `--upgrade` passed but no harness markers found anywhere | `40` | Drop the flag; this is not an upgrade scenario |

Refusal messages always state (a) what was detected, (b) why it was refused, (c) the exact command or manual edit to resolve.

---

## Plugin file tree (`harness-worker`)

```
<plugin-root>/
├── .cursor-plugin/
│   └── plugin.json
├── README.md
├── LICENSE
├── CHANGELOG.md
├── rules/                                 # 7 .mdc files, all agent-requestable
│   ├── harness.mdc
│   ├── domains.mdc
│   ├── knowledge-base.mdc
│   ├── skills-organization.mdc
│   ├── scaffolding.mdc
│   ├── drift-control.mdc
│   └── subagents.mdc
├── skills/
│   ├── _core/
│   │   ├── domain-registry/SKILL.md
│   │   ├── knowledge-base/SKILL.md
│   │   ├── drift-scan/SKILL.md
│   │   ├── scaffolding-author/SKILL.md
│   │   └── harness-audit/SKILL.md
│   └── _templates/
│       ├── service-skill.md
│       ├── domain-skill.md
│       ├── task-skill.md
│       └── domain-agent.md
├── commands/
│   ├── init-harness.md                    # this command's slash spec
│   ├── audit.md
│   ├── drift-scan.md
│   └── kb-add.md
├── seeds/                                 # source-of-truth for project seed
│   ├── AGENTS.primer.md                   # the marker block content
│   ├── gitignore.harness                  # the marker block content
│   ├── knowledge/
│   │   ├── _index.md
│   │   └── _meta/
│   │       ├── domains.md
│   │       ├── glossary.md
│   │       ├── subdomain-catalogue.md
│   │       └── schemas/
│   │           ├── concept.md
│   │           ├── decision.md
│   │           ├── policy.md
│   │           ├── specification.md
│   │           └── fieldnote.md
│   ├── workspace/
│   │   ├── .gitkeep
│   │   └── README.md
│   └── codebase/
│       └── README.md
└── hooks/
    └── init-harness.ts                    # deterministic file ops
```

### `commands/init-harness.md` (slash spec)

A short markdown file describing the command's purpose, flags, and the orchestration the agent performs:

1. Read the seed payload manifest from `<plugin>/seeds/`.
2. Run the detection matrix against the user's project root.
3. Print the plan.
4. Confirm (skip if `--yes`).
5. Invoke `<plugin>/hooks/init-harness.ts` with the resolved plan as JSON over stdin.
6. Surface the hook's stdout/stderr and exit code to the user.

The agent does no filesystem writes itself. All bytes go through the hook.

### `hooks/init-harness.ts` (deterministic file ops)

Implementation language: TypeScript, executed via `npx tsx` or compiled to JS at plugin build time. Precedent: `continual-learning`'s `continual-learning-stop.ts` in `~/.cursor/plugins/cache/cursor-public/continual-learning/`.

Responsibilities:

- Read the JSON plan from stdin.
- Read seed files from `<plugin-root>/seeds/`.
- Read existing project files (for marker detection).
- Compute the diff.
- Apply the diff atomically (all-or-nothing semantics from the Apply phase).
- Print the summary block.

The hook is the only piece that actually writes to disk. The agent's role is to orchestrate, not to mutate.

---

## Open questions

1. **Plugin name.** Currently using `harness-worker`. Alternatives: `project-harness`, `harness-init`, `cursor-harness`. Decide before publishing.
2. **Plugin source location.** Two options:
   - Develop in this repo at `codebase/` (this repo dogfoods itself; symlink to `~/.cursor/plugins/local/harness-worker/` for local testing).
   - Develop in a separate repo and consume this one as a template.
3. **Hook implementation language.** TypeScript (matches `continual-learning` precedent) vs. shell (no Node dependency). Lean TypeScript for marker parsing reliability.
4. **Where the always-applied rules end up.** Current spec says zero `.mdc` rules go into the project — AGENTS.md does the priming. If empirical testing shows that's not enough, the seed adds a single thin `.cursor/rules/harness-primer.mdc` to the project. Validate via the rule-demotion experiment before settling.
5. **Schema versioning across upgrades.** If a schema gains a new optional frontmatter field in `harness@0.2.0`, do we add it as an unmarkered new file (skipped if exists) or do we extend the seed-with-markers pattern to schemas? Probably the former; revisit if it bites.
6. **Telemetry / dry-run reporting.** Should the hook write a `bundles/.harness-state.json` with last-applied version + plan hash for faster idempotency checks? Probably yes; not in v0.1.0.
7. **Per-project plugin activation toggle.** Cursor allows project/user-scope activation of installed plugins. The spec assumes the plugin is enabled in the project; behavior when it isn't is out of scope (the slash command simply isn't available).

These move to `decision` entries (and out of this section) as they are resolved.

---

## Change log

- `v0.1.0` — 2026-05-02 — Initial draft.
