# KB tagging and relations

> Part of the `kb-conventions` skill. Section numbers are stable: other skills cite them (for example "section 4.6").

## 2. Tagging standard

Tags are a **secondary, faceted index** over the KB — they complement `domain` and the folder tree, they don't replace them.

### 2.1 Rules

1. **Format.** `lowercase-kebab-case`. Words separated by hyphens, never spaces or underscores (`cause-class`, not `cause_class` or `cause class`).
2. **Count.** Keep it small — aim for roughly **3–7** tags per entry. Too few under-indexes; too many dilutes.
3. **Controlled vocabulary.** Prefer an existing canonical tag over inventing a near-synonym. New tags are fine when a genuinely new topic appears; synonyms of existing tags are not. The canonical list is the **project's** (see §5).
4. **De-duplicate.** No repeats within an entry; **no tag that merely restates a structured field** (don't tag `p0`/`severity-high` when a `priority`/`severity` field already carries it; don't tag the `domain` value).
5. **Retire dead context.** Drop tags for things the project has migrated away from, except on entries that are explicitly historical and document that (now past) reality.

### 2.2 Facets (an aid, not a schema)

Tags stay coherent when each one answers a known question. Three optional facets that together land in the 3–7 range:

- **Lifecycle / role** (≤1): what *kind* of knowledge this is as a reader signal — e.g. `foundational`, `gotcha`, `runbook`, `reference`, `historical`. (Distinct from `type`, which is structural; these are search-time signals.)
- **Area** (0–2): the subject area, when it adds cross-domain findability beyond `domain`.
- **Topic** (2–5): the concrete subjects — mechanisms, vendors, protocols, concepts.

---

## 3. Relations standard

Relations form the KB's link graph. They live in **frontmatter** (the canonical home), referencing entries by `id` in **wikilink form**.

### 3.1 Reference format

- Always **`"[[id]]"`** — a quoted wikilink to the target's `id`, which is its filename basename, so `"[[id]]"` == `[[filename]]` and resolves by filename (see 1.6), never by alias. Never a relative path, never a bare id, in relation fields. (Relative-path links remain fine *in body prose*; see 3.5.)
- **No self-references.** An entry never lists its own `id`.
- One target appears at most once per field.

### 3.2 Relation fields

| Field | Meaning | Reciprocal |
| --- | --- | --- |
| `related` | Symmetric "see also" — a relevant neighbour, no hierarchy. | `related` (A↔B) |
| `supersedes` | This entry replaces an older one. | `superseded_by` |
| `superseded_by` | This entry is replaced by a newer one (set on the `deprecated` entry). | `supersedes` |
| `implements` | This entry realizes a spec/policy/decision. | `implemented_by` |
| `implemented_by` | This entry (a spec/policy) is realized by another. | `implements` |
| `depends_on` | This entry's truth depends on another being true (directional, **not** symmetric). | *(none required)* |

### 3.3 Reciprocity

- `related` is **symmetric**: if A lists B, B should list A. When healing, add the missing back-link *only* when the pairing is clearly mutual — don't fabricate links to force symmetry.
- `supersedes` ↔ `superseded_by` and `implements` ↔ `implemented_by` are **reciprocal pairs**: set both sides.
- `depends_on` is directional; no back-link is required.

### 3.4 Deprecation rule

- A `deprecated` entry **MUST** carry `superseded_by → successor` when a successor exists; the successor carries `supersedes → this`.
- `active` entries should point at the **current** successor, not a superseded entry. When healing, if a `related` target is now `deprecated` and has a `superseded_by`, repoint to the successor.
- A `deprecated` entry with no successor keeps `status: deprecated` with no `superseded_by`; note *why* in the body.
- **Capture the transition, not just the new conclusion.** When a successor supersedes a record, the successor's body should say *what changed and why* (e.g. "switched from Redis to Postgres because durability now outweighs latency"), not merely restate the new choice. The supersession chain is only readable history if each link records the turn it represents.

### 3.5 Canonical home: frontmatter

Relations live in **frontmatter**, not a body "Relationships" section — one canonical, machine-readable home avoids drift between two lists. Body prose may still link to other entries inline (relative links or `[[id]]`) where it aids reading; those are narrative, not the relation graph.
