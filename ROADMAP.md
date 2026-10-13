# Roadmap

What magik-harness does **not** ship today, and why. The [CHANGELOG](CHANGELOG.md) is the record of what is shipped; this file is what is deliberately deferred. The floor is small on purpose (a pointer, a hook, a few skills, an installer that owns what it writes), so most of this is optional layers, not obligations.

## Before 2.0.0 is published

The code, tests and docs are on the `refactor/magik-harness` branch. Release steps that are the maintainer's to take:

- Run CI on a pull request marked ready: the matrix covers Linux, macOS and Windows, and until it runs only Linux-like behavior has been exercised locally.
- Rename the GitHub repository (and its description and topics), then replace the old repository URL (`magik-repo-plugin`) in `README.md`, `package.json` and the primer text in `content/`.
- Publish to npm and flip `"private": true` in `package.json`; then drop the `npx github:…` fallback from the README.
- Refresh the Cursor marketplace listing (name, description, logo) and reinstall the local plugin with `pnpm install-plugin`.
- Update anything that calls a script by its 1.x plugin path (see [docs/MIGRATION.md](docs/MIGRATION.md#if-you-used-the-cursor-plugin)).

## Tools

- **Claude Code and Codex: from experimental to verified.** The adapters are implemented from documentation and file-level tests. Each needs one run of the [live check](docs/TOOLS.md#checking-it-in-a-live-session) against the real tool, with the version and date recorded in `docs/TOOLS.md`.
- **The Cursor IDE.** Only `cursor-agent` has been exercised; the IDE reads the same files, but a run per platform would settle whether anything differs.
- **More adapters** (Gemini CLI, GitHub Copilot, Windsurf, OpenCode, Amp, …). An adapter is one file; see [Adding a tool](docs/TOOLS.md#adding-a-tool). Contributions welcome once a tool has a documented session hook or instruction file worth targeting.

## Installer

- **`doctor --fix`.** Today every finding carries the command that fixes it. Applying the safe ones (re-registering a missing hook, restoring a deleted managed file) automatically is a candidate; anything involving a file you edited stays manual.
- **An update hint.** `status` already says when the installed version is older than the CLI. A once-a-day, opt-in check against the registry could say when the CLI itself is behind. No network call without an explicit opt-in.
- **More hook delivery** for tools that can run a command at session start but cannot read a JSON payload.

## Knowledge base and memory

- **Starter KB templates per project type.** `init` creates an empty `knowledge/_index.md`. Opinionated starting structures (SaaS, agency, library), strictly opt-in and easy to discard, would stay compatible with the principle that the harness is agnostic to the KB's structure.
- **`_index.md` auto-maintenance.** `kb-sanitize` flags drift; a future option could regenerate the orientation map from the KB's actual shape, on approval.
- **Memory retention.** Memory grows without bound. A helper could summarize or prune old `memory/daily/` notes on request, never automatically: memory is the agent's, and pruning is destructive.
- **A reference MCP-backed store.** `accessVia: mcp` is carried in the pointer and the hook prints the mount id, but wiring a remote store is left to your MCP configuration. A reference adapter could ship if there is demand.
- **Skill-efficacy evals.** A way to score whether skills a team authored actually change an agent's behavior: opt-in tooling, not a revival of the old in-repo eval runner.

## Not planned

- A background service or a network component. The harness is files, a script that runs for a moment at session start, and a CLI.
- Runtime dependencies or a build step in the published package (the point of `npx` working on a clean machine).
- Telemetry of any kind.
- Owning the structure of your knowledge base.
