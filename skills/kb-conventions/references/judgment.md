# Applying the standard with judgment

> Part of the `kb-conventions` skill. Section numbers are stable: other skills cite them (for example "section 4.6").

## 4. Judgment — applying the standard coherently

The schema above is the *grammar*; this section is the *taste*. Metadata is only useful when it is **honest and consistent with the entry's actual content and the surrounding KB**. Apply it the way a careful librarian would, not as a checklist to maximize.

### 4.1 Relations: link the real dependency, not every neighbour

- **Add a relation when the graph would mislead without it** — a reader on entry A genuinely needs B to act correctly, or B is the authoritative source A defers to. Add `depends_on` when A's claims stop being true if B changes; `implements`/`implemented_by` when one entry is the spec and another is its realization; `supersedes`/`superseded_by` when one truly replaces another.
- **Don't add a relation just because two entries share a topic** — that's what `tags` and `domain` are for. `related` is for a meaningful "you'll also want this", not "these both mention auth". A handful of high-signal links beats a dense mat of weak ones.
- **Keep direction honest.** `depends_on` points from the dependent to the depended-upon; don't invert it to look symmetric. Reserve `related` for genuinely peer relationships.
- **Repoint, don't accumulate.** When a target is deprecated, move the link to its successor rather than keeping both. Stale links to dead entries are worse than no link.

### 4.2 Tags: describe, don't duplicate or sprawl

- **Choose from the project's vocabulary first.** Reach for an existing canonical tag before coining one. Coin a new tag only when a genuinely new topic appears that no existing tag covers — and then it becomes part of the vocabulary (record it; see §5).
- **Tag what the entry is *about*, at the altitude a searcher would use** — not every noun it mentions. If a tag wouldn't help someone *find* this entry among its siblings, it's noise.
- **Don't restate structured fields as tags** (`type`, `domain`, `status`, `priority`, `severity` are already indexed). Tags add a *different* axis, not a copy of one you already have.
- **Prefer the canonical synonym.** If the vocabulary maps `billing → payments`, use `payments`. Drift in tag spelling fragments the index silently.

### 4.3 Scope: one coherent claim per entry

- **An entry should answer one question well.** If you can't write a one-line `summary` that honestly covers the whole file, it's probably two entries — **split** it, and connect the parts with `related` (or `implements`/`depends_on` if there's a real hierarchy).
- **Conversely, don't shatter a single idea** across many thin stubs that each say almost nothing. If two entries can't stand alone without constantly cross-referencing each other, **merge** them.
- **Match scope to `type`.** A `decision` records *one* decision with its context and consequences; a `policy` states *one* rule; a `specification` describes *one* thing's behavior. When an entry's body has outgrown its `type`, fix the `type` or split the entry — don't let a "decision" quietly become a sprawling design doc.

### 4.4 `type` and `domain`: keep them honest

- **`type` reflects what the entry *is*, not what you wish it were.** A page of observations from an incident is a `fieldnote`, even if it lives in a "decisions" folder. If the content and the `type` disagree, the content wins — change the `type` (and propose moving the file if `domain`/folder now mislead).
- **`domain` usually mirrors the folder**, but it tracks the *subject*, not the path. If a file was filed under the wrong area, the fix is to correct placement, not to bend `domain` to match a bad location.
- **`status` and `updated` must tell the truth.** Bump `updated` only on substantive content change. Flip to `deprecated` the moment an entry stops being current — and link forward — rather than leaving a stale entry `active` because no one revisited it.

### 4.5 When unsure

Convention serves coherence, not the other way around. If applying a field would force a dishonest value (a `type` that doesn't fit, a relation that overstates a link), **omit it and note the uncertainty** rather than inventing structure. During maintenance, surface the ambiguity as a proposal for the human to settle — never silently impose a guess (see `knowledge-base`, `kb-sanitize`).

### 4.6 Decision records vs. state documents

Two kinds of entry coexist in the KB and are maintained in **opposite** ways. The seam runs along `type`:

- **State documents** (`concept`, `specification`, `policy`) are the **living surface** — the go-to for *what is true now*. Maintain them **in place**: edit the body to keep it current and bump `updated` on substantive change. They *can* go stale, so they are what the context gather (`skills/kb-search`) and `skills/kb-code-sync` scrutinize hardest.
- **Records** (`decision`, `fieldnote`) are an **immutable ledger** — a dated snapshot of *what was chosen or observed, and why, at a point in time*. Do **not** rewrite a settled record to "keep it current"; that erases exactly the reasoning it exists to preserve. Correct it by **superseding**: write a new record, set the old one `status: deprecated` with `superseded_by → "[[new]]"`, and the new one `supersedes → "[[old]]"` (capturing the transition, §3.4). Fixing a typo or adding a forward link is fine — that's metadata, not rewriting the decision. A record never "goes stale"; only its *implications* do, which is what a superseding record captures.

**Single source, no duplication.** The *current value* lives once, in the state document; the *rationale and history* live once, in the ledger. A record may quote a value as a point-in-time snapshot (fine — it's explicitly historical), but it is never the thing you edit when the value later changes.

**Wiring the two.** A state document whose current shape was set by a decision should link to that decision, so the *why* is one hop away and maintenance knows what to revisit when the decision is superseded. The default, no-new-vocabulary wiring is `depends_on → "[[decision]]"` on the **state document** (semantically: *if that decision changes, revisit me*). A project that wants the relationship to be unambiguous may adopt an explicit reciprocal `decided_by`/`decides` pair in its `conventions.md` (§5). When you supersede the decision, repoint the state document's link to the successor **and** update its value in place.

**Deciding in the moment:**

1. **Settled a real choice among alternatives with lasting consequences?** → append a `decision` (immutable). If it wasn't a genuine, preservation-worthy choice, don't mint a record — over-recording is bloat (record only what's architecturally/strategically significant).
2. **The current truth of how something is or works changed?** → edit the living state document in place; bump `updated`.
3. **Both (the common case)?** → append the decision, update the state document, and link them.

When **reading**, the go-to is always the living surface; you follow links into the ledger only when you need the *why*.
