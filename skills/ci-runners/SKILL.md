---
name: ci-runners
description: >-
  Procedures for GitHub Actions on private repos under the CI runner policy
  (GitHub's free hosted pool first, Ubicloud managed runners as overflow, never a
  paid GitHub plan): check pool status, convert a workflow to the router pattern,
  onboard a new private repo, diagnose "job was not started" / queued-forever /
  disk-full failures, and prepare a macOS/Windows release. Use whenever you create
  or edit .github/workflows, pick `runs-on`, add a private repo, open or mark a PR
  ready, or see CI minutes, runners or queues mentioned. Policy text lives in rule
  `ci-runners`.
---

# CI runners — procedures

Policy (spend order, routing rules, hygiene, agent behaviour) is in rule
`ci-runners` — read it first. This skill is the how-to.

## 1. Check the pool (read-only, ~40 s)

```sh
python3 ~/.cursor/plugins/local/magik-repo/skills/ci-runners/scripts/ci_usage.py
```

Shows this month's GitHub hosted minutes (weighted x1/x2/x10) against the 2,000 free
pool, Ubicloud overflow with an estimated bill after the credit, jobs that never got a
runner, and runs queued/in progress for more than 15 minutes (with the exact
`gh run cancel` commands; the tool never cancels anything itself). Options:
`--month YYYY-MM`, `--repos a,b`, `--json`, `--top N`.

Read it like this:

| You see | Meaning | Do |
|---|---|---|
| hosted < ~70% | router jobs run free on GitHub | nothing |
| hosted ~100%, Ubicloud rising | overflow in effect, as designed | nothing; est. due is usually $0 inside the credit |
| "never got a runner" > 0 for a repo | a job there still pins hosted `ubuntu-*`, or the pool emptied mid-run | convert the workflow (section 2) or re-run all jobs (section 4) |
| stuck run on an `ubicloud-*` label | Ubicloud app does not cover that repo, or a label typo | section 3 |
| Ubicloud est. due > $5 | something is wasteful | find the top workflows in the table; apply hygiene |

## 2. Convert a workflow to the policy

1. Classify each job: Linux in a private repo -> router or direct Ubicloud; macOS/Windows
   -> stays hosted; public repo -> leave alone.
2. If the whole run bills under ~3 minutes: `runs-on: ubicloud-standard-2` on every job,
   no router. Otherwise add the router job (rule `ci-runners`) and change each Linux job
   to `needs: runner` + `runs-on: ${{ needs.runner.outputs.label || 'ubicloud-standard-2' }}`
   (`-4` for Docker builds, Android/Gradle, Playwright suites, anything needing more than
   ~10 GB disk; standard-2 has ~12 GB free).
3. For PR workflows: `on.pull_request.types: [opened, synchronize, reopened,
   ready_for_review]`; draft guard on the router only
   (`if: github.event_name != 'pull_request' || !github.event.pull_request.draft`);
   `paths-ignore` for docs, after grepping tests/scripts for files they read.
4. Hygiene pass: `timeout-minutes` on every job; PR concurrency cancels, deploy
   concurrency never; delete summary/gate jobs; merge sub-minute jobs; no re-test in deploy
   of what the PR passed; no `workflow_dispatch` on CI workflows; lowest useful cron.
5. Keep plain `needs`/default `if` wherever possible. Avoid clever `always()` guards: a
   mistake there silently skips tests. Where `always()` is unavoidable use
   `!cancelled()` and test both the refused-router and skipped-router cases.
6. Add `.github/actionlint.yaml` (rule `ci-runners`, Tools) and run `actionlint`.
7. Verify with ONE run: open the PR as a draft, run local checks, `gh pr ready`, then
   read job labels and durations:

   ```sh
   gh api repos/<owner>/<repo>/actions/runs/<id>/jobs \
     --jq '.jobs[]|[.name,.conclusion,(.labels|join(","))]|@tsv'
   ```

   The `Runner pool` job showing `failure` with no steps is the **expected** signature of
   an empty hosted pool (continue-on-error keeps the run green).

## 3. Onboard a new private repo

1. Confirm the Ubicloud GitHub App covers it (Ubicloud console -> GitHub; or run any
   Ubicloud job and see it start within ~20 s). A job queued for minutes on an `ubicloud-*`
   label means the app does not cover the repo: cancel the run
   (`gh run cancel <id> -R <owner>/<repo>`) and add the repo to the app.
2. Start from the router template (rule `ci-runners`); add `.github/actionlint.yaml`.
3. Add the AGENTS.md block (rule `ci-runners`, last section) verbatim.
4. Make sure the repo's secrets/environments exist; Ubicloud runners use the same
   repo secrets as hosted runners.

## 4. Diagnose

| Symptom | Cause | Fix |
|---|---|---|
| Job fails in ~3 s, no steps: "not started because recent account payments have failed" | hosted pool empty and the job pins `ubuntu-*` | route it (section 2) |
| Same, but the router picked `ubuntu-24.04` | pool emptied mid-run | re-run **all** jobs: `gh run rerun <id>` (not `--failed`) |
| `Runner pool` job red, rest green | expected when the pool is empty | nothing |
| Job queued for minutes on `ubicloud-*` | repo not covered by the Ubicloud app, or label typo | section 3 / fix label |
| "No space left on device" or a test reading disk usage fails | standard-2 has ~12 GB free | `ubicloud-standard-4` (~85 GB free) |
| Tool missing that hosted images have | image parity gap (pnpm and tailscale are not preinstalled on either) | install it in the job |
| Tailscale/SSH deploy fails only on Ubicloud | egress IPs are not stable; TUN device exists | use the tailnet, not IP allowlists; read the join step log |
| macOS/Windows job refused | hosted pool empty (Ubicloud has no macOS/Windows) | wait for the 1st, or build locally |

## 5. Release checklist (macOS / Windows builds)

1. Run `ci_usage.py`. A macOS minute costs 10 pool minutes; a 12-minute macOS build is
   ~120 of the 2,000.
2. If remaining pool < ~300: build the macOS artifact locally (it also keeps signing keys
   off CI), or wait for the 1st (UTC).
3. Tag-triggered release workflows only; never dispatch them as a test.
4. After the release, run `ci_usage.py` again so the next release decision is informed.

## 6. Monthly review (2 minutes)

On or after the 25th: `ci_usage.py` for the month. Compare per-repo minutes with the
previous month; any repo that grew >50% gets a hygiene pass on its top workflow. Record
nothing in the KB unless a durable decision changed.
