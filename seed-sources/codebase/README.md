# codebase/

The project's code lives here. The harness deliberately nests code one level below the repo root because the repo root is the **project** — its knowledge, artifacts, and code combined. Code is one component, not the whole.

If your project does not ship code (knowledge-only / business / brand / research project), you can leave this folder empty or delete it. Its presence is not enforced.

---

## Boundary

- This folder runs its own tooling: lockfiles, linters, formatters, tests, CI/CD configs.
- Add a code-specific `.gitignore` here (`node_modules/`, `dist/`, `.next/`, `__pycache__/`, etc.). The harness root `.gitignore` only covers harness-level concerns.
- CI/CD workflows that build, test, or deploy code should attach to changes inside `codebase/**`, not the entire repo.
- The harness's agent treats `codebase/` as read-only context by default. Only the engineering subagent (when one earns its place) gets write access here.

---

## Migrating an existing code repo

Three patterns, pick the one that fits your case.

### A. Copy in (no history)

Simplest. Drops your code into `codebase/` and starts fresh. History of the old repo is lost.

```bash
rsync -av --exclude=.git /path/to/old-repo/ ./
```

### B. Subtree merge (preserves history)

Imports the old repo's full history under the `codebase/` prefix in **this** repo's git log. One repo afterwards.

```bash
# from the harness root
git subtree add --prefix=codebase https://github.com/<you>/<old-repo> main
```

To pull subsequent updates from the original repo:

```bash
git subtree pull --prefix=codebase https://github.com/<you>/<old-repo> main
```

### C. Submodule (repos stay separate)

Keeps the old repo as its own git repo; this harness tracks only a pointer to a specific commit.

```bash
# from the harness root
git submodule add https://github.com/<you>/<old-repo> codebase
```

Use this when the code repo has independent contributors, release cadence, or visibility (e.g. open-source code embedded in a private harness).

---

## Starting fresh

If you're starting a new code project, just `cd codebase/` and bootstrap normally:

```bash
cd codebase
npm init -y                    # or: pnpm init / cargo init / uv init / poetry init / ...
git init                       # only if you want codebase/ to be its own repo (Option C above)
```

---

## What does *not* belong here

- Operational artifacts (PDFs, designs, media) → `workspace/`.
- Knowledge documents (decisions, specs, policies, fieldnotes) → `knowledge/<domain>/`.
- Cursor rules / skills / agents → `.cursor/`.

If you're unsure, the rule of thumb is: *would another tool/team need to build, test, or deploy this?* If yes, it's code and lives here. If no, it lives in one of the other components.
