# Workspace

Operational artifacts for the project — the equivalent of a company drive. **Always git-ignored** (see root `.gitignore`); only this README and `.gitkeep` are tracked.

## What goes here

Anything that is *produced* by the project that is not code:

- Brand assets (`.ai`, `.eps`, `.svg`, `.pdf`)
- Marketing assets (images, videos, ad creatives)
- Research reports, market data (`.csv`, `.xlsx`, `.pdf`)
- Legal documents (contracts, NDAs, policies)
- Drafts and source files for blog posts, decks, proposals
- Recordings, transcripts, raw notes
- Lead lists, campaign exports
- Any other operational artifact

## What does **not** go here

- **Ground truth / definitions** → `knowledge/<domain>/`
- **Code** → `codebase/`
- **Worker configuration** → `.cursor/`

If an artifact in `workspace/` materially settles the truth of a domain (e.g., a final brand guide PDF is approved), the **agent should propose a corresponding KB entry** in `knowledge/<brand>/` that points to the artifact path. The artifact stays in workspace; the *interpretation* is recorded in knowledge.

## Organization

Free-form, but the harness suggests mirroring the **domain registry** for human navigation:

```
workspace/
├── brand/
├── marketing/
├── legal/
├── product/
├── research/
└── ...
```

You may also organize by project, campaign, vendor, date — whatever fits. There is no drift control on workspace shape (only on whether KB references in workspace stay alive).

## Size

Workspace is gitignored partly because artifact files are often large and binary. For very large or shared assets, consider symlinking to an external storage mount (`workspace/<domain>/` → `/Volumes/Drive/...`) — links are not tracked either.
