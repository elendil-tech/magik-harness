---
schema: fieldnote
id: <kebab-case-id>
domain: <domain-slug>
status: active
created: YYYY-MM-DD
updated: YYYY-MM-DD
severity: low      # low | medium | high
recurrence: 1      # increment each time this is encountered again
links: []
tags: []
---

# <Short imperative title — e.g. "Never run drizzle push against prod">

> **Fieldnote** — a time-stamped lesson, gotcha, or surprise. The persistent project-memory layer. Write one whenever you make a non-trivial mistake, find a non-obvious gotcha, or repeat the same fix.

## What happened

One paragraph. What was being attempted; what went wrong (or what surprised you).

## Why it happened

Root cause in one paragraph. Not the symptom — the cause.

## Lesson / rule of thumb

The one-sentence takeaway. Phrase as an imperative.

## How to detect / avoid in future

- Concrete signals to watch for.
- Tooling, scripts, or skill changes that would prevent recurrence.

## Promotion path

- If this recurs (`recurrence ≥ 3`) or carries `severity: high`, consider promoting to a `policy`.
- If the lesson is general enough, also add the term to `_meta/glossary.md`.
