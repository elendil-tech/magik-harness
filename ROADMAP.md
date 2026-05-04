# Roadmap

What `magik-repo` does **not** ship today, grouped by theme. The CHANGELOG is the canonical record of what is shipped; this file captures what is deliberately deferred and why.

## Memory automation (incremental)

- **`/clear-quarantine` slash command.** User-initiated workflow for clearing `quarantine: true` flags after review. Today, clearing is a manual edit to the entry's frontmatter. Targets v0.5.
- **Cross-session memory pool.** A repo-level "what other agents found" pool that domain agents can consult before starting work. Touches subagent boundaries and would need a new top-level lane in `memory/`. Not in scope until a clear demand surfaces.
- **Auto-prune `memory/daily/` past retention.** Today, prunes happen via `memory-distill` proposal. A non-interactive prune on a schedule (or in `harness-audit`) is a candidate for v0.5.
- **Drift-scan: structured YAML parsing.** Today, drift-scan extracts frontmatter via line-oriented regex. A real YAML parse would catch malformed entries earlier and enable richer checks.

## Hook surface (extending v0.4)

- **`postToolUse` matcher for MCP tool reads.** Currently the `last_referenced` bump only fires for the `Read` tool. MCP-tool-cited KB entries (e.g., a domain agent reading via an MCP filesystem) miss the bump.
- **JSON-merge for `.cursor/hooks.json`.** Today, `/init-harness` skips seeding `hooks.json` when one exists and prints a notice. Proper JSON-merge that adds the harness hook entries while preserving user hooks lands in v0.5.
- **`afterAgentResponse` hook for citation-driven `last_referenced` bumps.** A more accurate signal than `Read` (the entry actually informed an answer). Pending stable behavior of that hook.

## Init-harness rigor

- **`--migrate=copy|subtree|submodule|none`** for code-at-root projects. v0.1 detected code at the repo root and printed a notice; v0.4 still does not act. Acting on the flag is the v0.5+ work.
- **Atomic rollback on partial failure.** Today's `/init-harness` is best-effort: a mid-apply error leaves the project in an in-between state. Atomic apply (write-to-temp + rename) is a cleanup task.
- **Refusal exit codes.** v0.1's INIT-SPEC defined `10` / `20` / `30` / `40` / `50` for distinct refusal reasons. The hook still emits only `0` / `1`.

## Scaffolding

- **Example `engineering-agent` domain agent.** Ship a fully realized example under `seed-sources/.cursor/skills/_templates/` so users have a concrete reference, not just a template. Likely v0.5.
- **Code-based skills.** A `skills/<name>/scripts/` convention for skills that are TypeScript-implemented (vs. instruction-only). The scaffolding-author skill already mentions this is reserved; actual support lands when there's a use case.

## Testing

- **Agent-in-the-loop tests.** Today's tests cover `init-harness` and schema sanity. v0.4 adds fixture tests for `kb-search`, `memory-distill`, and `drift-scan` skill *procedures*. Live agent-driven tests (does an agent following the rules actually write the right files?) are a separate effort, likely via the Cursor SDK.
