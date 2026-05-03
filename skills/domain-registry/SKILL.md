---
name: domain-registry
description: Read, propose, and update the project's domain registry at knowledge/_meta/domains.md. Use when adding / renaming / splitting / deprecating a domain, or before any structural change to knowledge/<domain>/ or .cursor/skills/<domain>/.
---

# Domain registry

This skill is the **only** sanctioned way to mutate `knowledge/_meta/domains.md`. The registry is the spine of the harness; folder layout under `knowledge/` and `.cursor/skills/` mirrors it.

## When to invoke

- User asks to add, rename, split, merge, or deprecate a domain.
- A new piece of content appears not to belong in any active domain.
- A folder appears under `knowledge/<x>/` or `.cursor/skills/<x>/` that is not in the registry (drift signal — high severity).
- Before scaffolding a new skill or KB entry whose domain placement is unclear.

## Procedure

### 1. Read

```
Read knowledge/_meta/domains.md
```

Parse the YAML registry section. Note `domains:` (list), each with `slug`, `status`, `subdomains:`.

### 2. Diagnose intent

Ask which operation is needed:
- **Add** a domain or subdomain.
- **Rename** (slug change).
- **Split** (extract subdomain into its own domain or split a domain into subdomains).
- **Merge** (collapse one into another).
- **Deprecate** (mark stale; keep folders for history).

### 3. Apply thresholds

Before adding (domain or subdomain):
- Has the project accumulated **≥ 3 durable artifacts** (KB entries, skills, or specs) that would belong here?
- Is the boundary clear and not overlapping an existing domain?
- If both yes → proceed. If not → propose recording the artifacts first under the closest existing parent (or `research/`), and revisit.

Before deprecating:
- Has the domain had no writes in **≥ M months** (default M=6)?
- Are there current references to it from other domains? (If yes, propose a successor first.)

### 3a. Consult the subdomain catalogue (for splits)

When proposing a **subdomain split**, read `knowledge/_meta/subdomain-catalogue.md` and find the parent's recommended set. Match user intent against the catalogue:

- If the proposed slug matches a catalogue entry → use the catalogue's `name`, `purpose`, and "earn it when…" language verbatim.
- If it doesn't match → flag it. Either pick the closest catalogue slug, propose adding a new entry to the catalogue, or document why this project diverges.
- For a fresh `engineering/` split, consider proposing the **suggested first ADRs** for the subdomain (placeholder `decision` entries) — only if the user wants seed content.

The catalogue is **advisory**. You may diverge with explicit user confirmation.

### 4. Propose to user

Always confirm structural changes before committing them. Output a concrete diff:

```
Proposed registry change
------------------------
ADD domain:
  slug: brand
  name: Brand
  purpose: Visual identity, voice, design tokens, brand assets.
  knowledge_path: knowledge/brand/
  skills_path:    .cursor/skills/brand/
  workspace_path: workspace/brand/
  created: 2026-05-02

Folders to create:
  knowledge/brand/_index.md
  .cursor/skills/brand/_domain/SKILL.md  (optional)

Affected drift items: none.

Approve? [y/n]
```

### 5. Apply

On approval:
1. Edit `knowledge/_meta/domains.md` (the YAML block + change log).
2. Create `knowledge/<slug>/_index.md` from the index template (see below).
3. Do **not** pre-create `.cursor/skills/<slug>/` unless content is being authored now.
4. Append to the change log at the bottom of `domains.md`.

### 6. Verify

Run `drift-scan` to confirm no new drift was introduced.

## Index template (for new domain)

```markdown
# <Domain name>

> **Domain.** <One-paragraph purpose, mirroring the registry entry.>

## Active entries

*(none yet)*

## Subdomains

*(none yet)*

## Open questions

- …
```

## Anti-patterns

- Editing `knowledge/_meta/domains.md` without going through this skill.
- Creating `knowledge/<x>/` or `.cursor/skills/<x>/` before the registry has the entry.
- Adding a domain "just in case." Defer until the threshold is met.
- Renaming silently. Rename = breaking change; require explicit confirmation.
