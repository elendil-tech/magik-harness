---
name: magik-repo-kb-code-sync
description: Check for drift between the knowledge base and the code. Verifies that documented policies and features are actually implemented, and that the code hasn't diverged from documented truth. Outputs a triage report.
---

Reconcile the knowledge base against the code in this repo. Resolve the KB mount via `.cursor/harness.json`, then compare it to the codebase.

Invoke the `kb-code-sync` skill and follow it strictly. It does not mutate state — it produces a triage report.

What it checks:

- **Unimplemented truth** — a `policy` or `specification` in the KB that the code does not satisfy.
- **Undocumented reality** — a meaningful behavior in the code that the KB claims something different about, or is silent on where it should not be.
- **Stale references** — KB entries pointing at code paths/APIs that have moved or been removed.

Output the report as the skill specifies (Summary, High, Medium, Low, Proposals). Approved reconciliations are applied as ordinary KB edits (KB is human-authored; the agent edits it only with your go-ahead) or surfaced as code work — never both silently.
