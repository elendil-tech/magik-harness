# Installing the harness in a new project

Three options, simplest first.

## Option 1 — `degit` (recommended)

`degit` clones the seed without history, leaving you with a clean repo to commit into.

```bash
npx degit <owner>/magik-repo-plugin my-new-project
cd my-new-project
git init
git add .
git commit -m "chore: bootstrap project harness"
```

## Option 2 — git clone + reset

```bash
git clone https://github.com/<owner>/magik-repo-plugin my-new-project
cd my-new-project
rm -rf .git
git init
git add .
git commit -m "chore: bootstrap project harness"
```

## Option 3 — GitHub template repository

If this repo is configured as a "Template repository" in GitHub:

1. Click **Use this template → Create a new repository**.
2. Clone the new repo locally.

## First run inside Cursor

Open the project in Cursor and run:

```
/audit
```

This invokes `harness-audit` in first-time-setup mode and walks you through:

1. Confirming project name and description.
2. Picking starting domains from the catalogue in `knowledge/_meta/domains.md`.
3. Confirming what to do with the seeded `codebase/` folder (keep empty, migrate an existing repo in, or delete).

After setup, capture initial decisions with `/kb-add` and add service skills as you wire up integrations.

## Sanity check after install

- `git status` should show `workspace/` untouched (it's gitignored — only `.gitkeep` and `README.md` are tracked).
- `.cursor/rules/*.mdc` should be visible to the agent (rules with `alwaysApply: true`).
- `knowledge/_meta/domains.md` should show an empty `domains: []` until you run `/audit`.

## Updating an installed harness

There is no automated upgrade path in v0.1.0. Manual diff against `bundles/manifest.md` of the upstream harness, then apply selectively.

Project-specific files (KB entries, custom skills under domain folders, agents) must not be touched by an upgrade.
