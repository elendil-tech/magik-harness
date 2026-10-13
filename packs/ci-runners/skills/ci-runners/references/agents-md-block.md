# Snippets: `AGENTS.md` block and `actionlint` template

Part of the `ci-runners` skill.

## `.github/actionlint.yaml`

```yaml
self-hosted-runner:
  labels: [ubicloud-standard-2, ubicloud-standard-4, ubicloud-standard-8, ubicloud-standard-16]
```

## Block for each repo's `AGENTS.md` (copy verbatim, keep the markers)

Replace `<skills>` with where the skill is installed (`.agents/skills`, `~/.agents/skills`, or `.cursor/skills`).

````markdown
<!-- ci-policy:v1 -->
## CI policy (private repo: GitHub Free pool first, then Ubicloud)

CI minutes are one budget shared by every private repo. Never add a paid GitHub plan.

- **Local first.** Run the CI-equivalent commands before pushing. CI is a milestone check, not a debugger.
- **Draft until ready.** Open PRs as drafts; WIP commits carry `[skip ci]`; `gh pr ready` triggers the one CI run.
- **One run per ref.** No dispatch or empty-commit loops. After red: `gh run view <id> --log-failed`, fix locally, push once. Stop and report after three red runs. Infra flake: `gh run rerun <id> --failed` (all jobs after a "job was not started" refusal).
- **Runners.** Linux jobs never pin `ubuntu-*`: use a `runner` router job and `runs-on: ${{ needs.runner.outputs.label || 'ubicloud-standard-2' }}` (`-4` for heavy builds), or `runs-on: ubicloud-standard-2` directly when a whole run bills under 3 minutes. macOS and Windows stay GitHub-hosted (10x and 2x) and only for releases. Public repos stay on GitHub-hosted.
- **Hygiene.** `pull_request` CI only (never push and PR on one branch); `push` only for deploy branches; `paths-ignore` docs; PR concurrency cancels, deploy concurrency does not; `timeout-minutes` on every job; no summary or gate jobs; never re-test in deploy what the PR passed; lowest useful cron.
- **Pool check** before releases: `python3 <skills>/ci-runners/scripts/ci_usage.py`. Full policy: the `ci-runners` skill (magik-harness `ci-runners` pack).
<!-- /ci-policy:v1 -->
````
