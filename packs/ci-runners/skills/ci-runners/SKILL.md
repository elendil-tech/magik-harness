---
name: ci-runners
description: >-
  An opinionated CI runner and workflow-hygiene policy for private GitHub repositories on a free plan:
  GitHub's free hosted pool first, a managed runner provider (Ubicloud) as overflow, never a paid GitHub
  plan, and local-first CI so minutes are not wasted. Use when creating, editing or reviewing
  .github/workflows, choosing `runs-on`, adding a private repo, opening a PR or marking it ready, pushing,
  dispatching or re-running CI, checking CI minutes or runners, or when "job was not started because recent
  account payments have failed", queued-forever or disk-full failures come up. How-to procedures are in
  references/procedures.md.
---

# CI runners and workflow hygiene

> An **opinionated example policy**, shipped as an opt-in pack of magik-harness. It assumes private repositories on a GitHub Free account and uses Ubicloud as the overflow provider. Adapt it, or install your own pack with `--pack-dir`, if your situation differs.

CI minutes are one budget shared by every private repo on the account. The aim is **no waste during development** and **no job stranded on an empty pool**.

Spend order: (1) GitHub's free hosted pool, (2) the managed provider's monthly free credit, (3) the provider's list price (pennies), **never** (4) GitHub overage. Do not suggest a paid GitHub plan, a GitHub spending budget or larger GitHub-hosted runners.

## Facts this policy rests on

Verified in October 2026; re-check current pricing before relying on the numbers.

- **GitHub Free**: 2,000 hosted minutes a month for private repos; each job rounds up to a whole minute; Linux x1, Windows x2, macOS x10. Public repos are free and unmetered. With no payment method, a hosted job is refused once the pool is empty: it fails in about 3 s with no steps ("The job was not started because recent account payments have failed...") and is not billed. The pool resets on the 1st (UTC).
- **Ubicloud** (managed runners through a GitHub App; Linux only): `ubicloud-standard-2` $0.00125/min, `-4` $0.0025, `-8` $0.005; a monthly credit of about $2.50 (plan on roughly 1,250 standard-2 minutes); then the card on file. Runners are fresh per job and register as self-hosted, so GitHub does **not** meter them against the hosted pool. Observed: starts 8 to 20 s after queueing; Ubuntu 24.04 image; Docker, service containers, Playwright with Chromium, `sudo`, `/dev/net/tun`, Android SDK and Java 17, outbound 22 and 443. `standard-2` is 2 vCPU, about 8 GB RAM and **about 12 GB free disk**; `standard-4` is 4 vCPU, about 16 GB and about 85 GB free. Egress IPs are not stable.
- **Free-plan limits**: no branch protection or required checks on private repos, so aggregator ("summary", "gate", "all-checks") jobs protect nothing; they only bill.

## Runner routing: the one pattern

Linux jobs in a private repo never pin `ubuntu-*`. Add one `runner` job and point the others at it. When the hosted pool is empty the router is refused, its output is empty, and the fallback label takes over (dependents still start with the default `if`, and the run concludes `success`).

```yaml
jobs:
  runner:
    name: Runner pool
    runs-on: ubuntu-24.04
    timeout-minutes: 2
    continue-on-error: true
    outputs:
      label: ${{ steps.pick.outputs.label }}
    steps:
      - id: pick
        run: echo "label=ubuntu-24.04" >> "$GITHUB_OUTPUT"

  test:
    needs: runner
    runs-on: ${{ needs.runner.outputs.label || 'ubicloud-standard-2' }}
```

1. **Tiny workflows skip the router.** The router costs one hosted minute per run. If a whole run bills under about 3 minutes (cron monitors, release automation, single-job deploys), use `runs-on: ubicloud-standard-2` directly.
2. **Heavy jobs fall back to 4 vCPU**: Docker image builds, Android or Gradle, Playwright suites, PyInstaller, anything that needs more than about 10 GB of disk: `${{ needs.runner.outputs.label || 'ubicloud-standard-4' }}`.
3. **Avoid macOS jobs** in private repos unless you truly need them (a hosted macOS minute is 10 pool minutes). Windows is the only non-Linux job worth keeping; it stays GitHub-hosted (the provider is Linux only, and Windows is x2) and only in tag or release workflows. If a macOS or Windows job is explicitly requested, run `ci_usage.py` (below) first; with a nearly empty pool, wait for the 1st or build locally.
4. **Public repos stay on GitHub-hosted** (`ubuntu-latest` or pinned). No router, no overflow provider.
5. **Drafts**: put the draft guard on the router only (`if: github.event_name != 'pull_request' || !github.event.pull_request.draft`); dependents then skip with it. Jobs that use `always()` or `!cancelled()` need the guard too.
6. **Reusable workflows**: pass the resolved label in as an input (`runs_on_label`) instead of adding a second router inside the callee.
7. **Re-running after a refusal**: if a run fails with "job was not started because recent account payments have failed" *after* the router picked `ubuntu-24.04` (the pool emptied mid-run), re-run **all** jobs (`gh run rerun <id>`), not `--failed`. A partial re-run reuses the router's stale output and is refused again.
8. **Lint**: keep `.github/actionlint.yaml` declaring the provider's labels so `actionlint` stays clean (template in `references/agents-md-block.md`).

## Workflow hygiene

- **Triggers**: feature-branch CI on `pull_request` with `types: [opened, synchronize, reopened, ready_for_review]`; `push` only for the default and deploy branches; never both for the same branch; `workflow_dispatch` only on deploy, release and maintenance workflows; `paths-ignore` for docs-only changes (but not paths that tests read); schedules at the lowest useful frequency.
- **Concurrency**: PR and CI groups `cancel-in-progress: true`; deploy groups `false`.
- **`timeout-minutes`** on every job (15 to 30 for builds, 2 for the router).
- **Fewer, fatter jobs**: every job bills a minimum of one minute. Merge setup, lint and typecheck; avoid fan-out of sub-minute jobs; no aggregator, summary or gate jobs.
- **Never re-test in deploy** what the PR already passed (deploy-only, or a tree-hash gate). A manual `run_tests` input is fine for emergencies.
- **Cache** package managers and builds; run **linters and formatters locally** first.
- **Dependabot**: monthly, grouped, a small PR limit. Its runs bill too.

## Agent behaviour (any agent: Cursor, Claude Code, Codex, orchestrators)

1. **Verify locally first.** Run the CI-equivalent commands before pushing; CI is a milestone check, never a debugger.
2. **Draft until ready.** Open PRs as drafts; push freely with `[skip ci]` on WIP commits; `gh pr ready` once local checks pass is the one CI run.
3. **One run per ref.** No push, dispatch or empty commit to "see what happens". After a red run read `gh run view <id> --log-failed`, fix, verify locally, push once. Stop and report after three red runs.
4. **Rerun, do not re-dispatch** for infrastructure flakes: `gh run rerun <id> --failed` (all jobs after a "not started" refusal, see 7 above).
5. **Apply this policy to every workflow you write or touch**, including generated ones. If a requirement conflicts, say so instead of quietly pinning a runner.
6. **Check the pool before releases or experiments that fan out** (matrix builds, re-running many PRs) with `ci_usage.py`.
7. Where a repo's own CI document is stricter, follow the stricter rule.
8. **`[skip ci]` belongs to WIP checkpoints on feature branches.** Never let it reach a commit that merges into a deploy branch: squash messages copy branch commit messages and the production deploy push would be silently skipped. Merge with an explicit `gh pr merge --squash --subject ... --body ...` (procedures, section 7).
9. **A conversion changes where jobs run, not what they check.** Run `workflow_diff_audit.sh` on every workflow-conversion diff and confirm each removal. After it lands, refire refused PRs with the ready cycle (procedures, section 6), never `gh run rerun` (it replays the old workflow file).
10. **Autonomy follows the repo owner's delegation.** Where the owner has delegated CI/CD to the agent (say so in the repo's `AGENTS.md`), land workflow changes yourself: draft PR, local checks and `actionlint`, one CI run, explicit squash merge. Without that delegation, ask before merging workflow changes. Ask first before deleting data, credentials or cloud resources either way.

## Tools

`<skills>` below is where the skill is installed: `.agents/skills` (project), `~/.agents/skills` (global), or `.cursor/skills` when the installer fell back to it.

```sh
# pool status, overflow spend, stuck runs (read-only; needs only `gh auth`)
python3 <skills>/ci-runners/scripts/ci_usage.py
python3 <skills>/ci-runners/scripts/ci_usage.py --month 2026-09 --repos api,web --json

# what a workflow diff removes besides runner scaffolding (read-only)
<skills>/ci-runners/scripts/workflow_diff_audit.sh origin/main HEAD
```

## Procedures

How to check the pool, convert a workflow, onboard a repo, diagnose failures, run a release checklist, unblock refused PRs, land a conversion safely, and do the monthly review: `references/procedures.md`. A block to paste into each repo's `AGENTS.md`, and the `actionlint` template: `references/agents-md-block.md`.
