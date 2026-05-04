---
name: distill
description: Run memory-distill — consolidate signals from memory/daily/ and memory/commitments.md into proposed KB promotions, conflict surfaces, and pruning actions. Proposal-only; user approves.
---

Run the memory consolidation pump. Walks `memory/daily/*.md` and `memory/commitments.md`, scores candidates with weighted recency, cross-checks the KB and registry, and produces a numbered proposal list of promotions, conflicts, structural moves, and prunes.

Invoke the `memory-distill` skill and follow it strictly. The skill is **proposal-only** — never auto-applies. For each approved proposal, hand off to:

- the `knowledge-base` skill for KB writes (fieldnote / decision / concept promotions),
- the `domain-registry` skill if a memory candidate would require a new or modified domain,
- `memory-distill`'s own apply step for memory pruning and structural moves inside `memory/`.

Always log the run to `memory/distillations/<YYYY-MM-DD>.md` (the audit trail is append-only and never pruned).

Do not mutate files outside those skills.
