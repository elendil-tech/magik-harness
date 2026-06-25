---
name: magik-repo-kb-code-sync
description: Check for drift between the knowledge base and the code. Verifies that documented policies and features are actually implemented, and that the code hasn't diverged from documented truth. Outputs a triage report.
---

Reconcile the knowledge base against the code in this repo. Resolve the KB mount via `.cursor/harness.json`, then compare it to the codebase.

Invoke the `kb-code-sync` skill and follow it strictly. It never edits code on its own; it produces a triage report and reconciles the KB side per `knowledge.autonomy`.

What it checks:

- **Unimplemented truth** — a `policy` or `specification` in the KB that the code does not satisfy.
- **Undocumented reality** — a meaningful behavior in the code that the KB claims something different about, or is silent on where it should not be.
- **Stale references** — KB entries pointing at code paths/APIs that have moved or been removed.

Output the report as the skill specifies (Summary, High, Medium, Low, Proposals). KB-side reconciliations are applied per `knowledge.autonomy` (default `open`: safe fixes applied directly, judgment calls surfaced; `ask`: only with your go-ahead; `readonly`: report only); code-side fixes are always surfaced for you to approve — never both silently.
