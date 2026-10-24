# KB frontmatter schema

> Part of the `kb-conventions` skill. Section numbers are stable: other skills cite them (for example "section 4.6").

## 1. Frontmatter schema

Every **entry** (a content `.md` file) carries YAML frontmatter. `_index.md` orientation maps are exempt — they may carry just `status` + `updated`, or nothing.

### 1.1 Field set

| Field | Tier | Type / format | Notes |
| --- | --- | --- | --- |
| `status` | **required** | enum: `active` \| `deprecated` | The only lifecycle gate. `draft` is an optional pre-publication value (see 1.3). |
| `updated` | **required** | ISO date `YYYY-MM-DD` | The last **substantive** change to the entry's *content*, not mechanical reformatting. |
| `id` | recommended | `kebab-case`, stable | The entry's permanent handle **and its filename basename** (`<id>.md`). Relations point at `id`, so it must not change when files move — and the filename must change with it (see 1.6). |
| `aliases` | recommended | list of strings | Human-readable alternative names (e.g. the `title`) for `[[` autocomplete and unlinked-mention discovery. **Aliases do not resolve `[[id]]` links** — the filename does (see 1.6). |
| `type` | recommended | enum (see 1.2) | The entry's kind. |
| `domain` | recommended | `kebab-case` | The area the entry belongs to (usually mirrors its folder). |
| `title` | recommended | quoted string | Human title. If absent, the body `# H1` serves. |
| `summary` | recommended | one-line string | One-sentence "what this is", for search/preview. |
| `tags` | recommended | flow list, controlled vocab (see §2) | A small set of lowercase-kebab tags. |
| relations | recommended | see §3 | `related`, `supersedes`/`superseded_by`, `implements`/`implemented_by`, `depends_on`. |

**Type-specific fields** are allowed and unconstrained — carry whatever a given `type` needs (e.g. `decision`/`alternatives`/`consequences`/`deciders` for a decision; `enforcement`/`applies_to`/`scope`/`exceptions` for a policy; `severity`/`recurrence` for a fieldnote; `version`/`owner` for a specification). They sit between `summary` and the relations block.

### 1.2 `type` enum

| `type` | Meaning |
| --- | --- |
| `concept` | Explanatory / contextual entry — an overview, model, framing, or durable background. |
| `decision` | A recorded decision (ADR-style), usually dated, with context + alternatives + consequences. |
| `specification` | A precise description of how something is built or behaves — a contract, design spec, or interface. |
| `policy` | A normative rule that must be followed; typically carries `enforcement` and `applies_to`. |
| `fieldnote` | An observation or lesson from operations/incidents; typically carries `severity` + `recurrence`. |

A project may extend this enum in its own `conventions.md`, but prefer reusing a generic kind over inventing a near-synonym.

These types split into two maintenance lifecycles: `concept`/`specification`/`policy` are **living state documents** (edited in place to stay current); `decision`/`fieldnote` are **immutable records** (corrected by superseding, never rewritten). This distinction governs how you update them — see §4.6.

### 1.3 `status` lifecycle

- `active` — current ground truth.
- `deprecated` — no longer current. **MUST** carry `superseded_by` pointing at the successor entry **when a successor exists**. If the entry was obsoleted with no replacement, `superseded_by` may be omitted, but the body should say *why* it's gone.
- `draft` — optional, pre-publication. Not part of the required floor; use it for entries not yet adopted, and promote to `active` (or delete) once settled.

How an entry is *updated* depends on its kind: **living** entries (`concept`/`specification`/`policy`) are edited in place and keep `updated` current; **record** entries (`decision`/`fieldnote`) are an immutable ledger — corrected by **superseding**, never by rewriting the original reasoning. See §4.6.

### 1.4 Canonical field order

For consistency, emit fields in this order (omit any that don't apply):

```
id → aliases → type → domain → title → status → updated → summary
→ [type-specific fields]
→ implements → implemented_by → supersedes → superseded_by → depends_on → related
→ tags
```

### 1.5 Empty fields

Do **not** carry empty placeholder relation fields (`supersedes: []`, `related: []`). Omit a relation field entirely when it has no members — absence and emptiness should read the same.

### 1.6 Filename and `[[id]]` resolution

`[[id]]` wikilinks (used for all relations, §3) resolve **by filename, never by alias**. In Obsidian-style vaults a `[[wikilink]]` is matched against a note's filename/path; `aliases` only feed the `[[` autocomplete dropdown and unlinked-mention discovery — they do **not** make a link resolve.

So the rule is simple:

- **An entry's filename basename MUST equal its `id`** — store the entry as `<id>.md`. Then `"[[id]]"` == `[[filename]]` and resolves.
- Filename resolution is **basename-based and folder-independent**: `[[auth]]` finds `engineering/auth.md` wherever it sits in the tree. That is what makes `id` path-independent — the link survives a file move as long as the basename keeps matching the `id`.
- If you rename an entry's `id`, **rename the file to match** (and update inbound `"[[id]]"` refs). If two entries would share a basename, their `id`s collide — pick distinct `id`s.
- `aliases` are optional and purely for discoverability (autocomplete shows `[[Real Title|alias]]`). Never rely on an alias to resolve a relation.

### 1.7 `id` is opaque — categorization lives elsewhere

An `id` is an **opaque, permanent handle** (and the filename) — not a path. Taxonomy and categorization come from the entry's **folder location + `domain` + `tags`**, never from parsing an `id` prefix. Don't read meaning into a `payments-…` or `eng-…` prefix; read `domain`/`tags`/the folder.

- After a restructure, an `id`'s prefix may no longer match the entry's current folder. **This is expected and acceptable.** Do **not** realign or rename `id`s to mirror folder paths — that re-couples `id`s to a mutable location and defeats their path-independence.
- **Moving an entry between folders keeps the same `id`/filename.** Re-file freely; the handle is stable, and `[[id]]` keeps resolving (basename resolution is folder-independent, §1.6).
- *Portability tip:* tools and skills that reference KB entries should prefer a **folder-glob** (e.g. `knowledge/payments/**`) over pinning exact entry filenames, so they don't churn when entries are added, moved, or renamed.
