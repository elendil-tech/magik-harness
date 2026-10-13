#!/usr/bin/env python3
"""ci_usage.py - GitHub Actions pool status for one account (read-only, stdlib only).

Answers three questions for a UTC month (default: the current one):

  1. How much of GitHub's free private-repo pool is used?  (hosted minutes,
     Linux x1, Windows x2, macOS x10, every job rounded up to a whole minute)
  2. How much has overflowed to a managed runner (Ubicloud) and what would it
     cost after the monthly credit?
  3. Is anything stuck?  (queued/in-progress runs older than --stuck-min, and
     jobs that never got a runner because the hosted pool was exhausted)

Needs only an authenticated `gh` (scope `repo`).  It never writes anything;
cancel commands for stuck runs are printed, not executed.

Examples
  ci_usage.py                       # this month, all private repos you own
  ci_usage.py --month 2026-09       # a past month
  ci_usage.py --json > usage.json   # machine-readable
  ci_usage.py --repos api,web --top 12
"""
from __future__ import annotations

import argparse
import collections
import concurrent.futures as cf
import datetime as dt
import json
import math
import re
import subprocess
import sys
import time

HOSTED_WEIGHT = {"linux": 1, "windows": 2, "macos": 10}
UBICLOUD_RE = re.compile(r"^ubicloud(?:-(standard|premium))?(?:-(\d+))?")


def gh_api(args: list[str], retries: int = 3) -> str:
    for attempt in range(retries):
        proc = subprocess.run(["gh", "api", *args], capture_output=True, text=True)
        if proc.returncode == 0:
            return proc.stdout
        time.sleep(1.5 * (attempt + 1))
    return ""


def json_lines(text: str) -> list[dict]:
    rows = []
    for line in text.splitlines():
        line = line.strip()
        if line.startswith("{"):
            try:
                rows.append(json.loads(line))
            except ValueError:
                pass
    return rows


def parse_ts(value: str) -> dt.datetime:
    return dt.datetime.fromisoformat(value.replace("Z", "+00:00"))


def classify(labels: list[str]) -> tuple[str, int]:
    """Return (pool, vcpus). pool: linux|windows|macos|ubicloud|self-hosted|other."""
    low = [x.lower() for x in labels]
    for label in low:
        m = UBICLOUD_RE.match(label)
        if m:
            return "ubicloud", int(m.group(2) or 2)
    if any("macos" in x for x in low):
        return "macos", 0
    if any("windows" in x for x in low):
        return "windows", 0
    if any("self-hosted" in x for x in low):
        return "self-hosted", 0
    if any("ubuntu" in x or x == "linux" for x in low):
        return "linux", 0
    return "other", 0


def list_repos(owner: str, only: set[str] | None, include_public: bool) -> list[tuple[str, bool]]:
    out = gh_api(
        [
            "--paginate",
            "user/repos?affiliation=owner&per_page=100",
            "--jq",
            '.[] | {name, private, archived, login: .owner.login} | tojson',
        ]
    )
    repos = []
    for row in json_lines(out):
        if row["login"].lower() != owner.lower() or row["archived"]:
            continue
        if only and row["name"] not in only:
            continue
        if not row["private"] and not include_public:
            continue
        repos.append((row["name"], bool(row["private"])))
    return repos


def fetch_runs(owner: str, repo: str, since: str) -> list[dict]:
    out = gh_api(
        [
            "--paginate",
            f"repos/{owner}/{repo}/actions/runs?created=%3E%3D{since}&per_page=100",
            "--jq",
            ".workflow_runs[] | {id,name,event,status,conclusion,created_at,head_branch,run_attempt} | tojson",
        ]
    )
    return json_lines(out)


def fetch_jobs(owner: str, repo: str, run_id: int) -> list[dict]:
    out = gh_api(
        [
            f"repos/{owner}/{repo}/actions/runs/{run_id}/jobs?per_page=100&filter=all",
            "--jq",
            ".jobs[] | {name,conclusion,status,started_at,completed_at,labels,runner_name,runner_group_name} | tojson",
        ]
    )
    return json_lines(out)


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--owner", help="GitHub login (default: the authenticated user)")
    ap.add_argument("--month", help="UTC month YYYY-MM (default: current)")
    ap.add_argument("--repos", help="comma-separated repo names (default: all private repos you own)")
    ap.add_argument("--include-public", action="store_true", help="also scan public repos (free; for completeness)")
    ap.add_argument("--pool", type=int, default=2000, help="free hosted minutes per month (default 2000)")
    ap.add_argument("--credit", type=float, default=2.50, help="managed-runner monthly credit in USD (default 2.50)")
    ap.add_argument("--rate-per-vcpu", type=float, default=0.000625,
                    help="managed-runner USD per vCPU-minute (Ubicloud standard: 0.000625)")
    ap.add_argument("--stuck-min", type=int, default=15, help="flag queued/in-progress runs older than N minutes")
    ap.add_argument("--top", type=int, default=10, help="rows in the per-workflow table")
    ap.add_argument("--json", action="store_true", help="print JSON instead of tables")
    args = ap.parse_args()

    owner = args.owner or gh_api(["user", "--jq", ".login"]).strip()
    if not owner:
        print("error: could not determine the GitHub login (is `gh auth login` done?)", file=sys.stderr)
        return 2
    today = dt.datetime.now(dt.timezone.utc)
    month = args.month or today.strftime("%Y-%m")
    start = dt.datetime.strptime(month + "-01", "%Y-%m-%d").replace(tzinfo=dt.timezone.utc)
    nxt = (start.replace(day=28) + dt.timedelta(days=4)).replace(day=1)
    only = {x.strip() for x in args.repos.split(",")} if args.repos else None

    repos = list_repos(owner, only, args.include_public)
    if not repos:
        print("no matching repositories", file=sys.stderr)
        return 1
    private = dict(repos)

    runs: list[tuple[str, dict]] = []
    with cf.ThreadPoolExecutor(5) as ex:
        for (name, _), rows in zip(repos, ex.map(lambda r: fetch_runs(owner, r[0], start.strftime("%Y-%m-%d")), repos)):
            for row in rows:
                created = parse_ts(row["created_at"])
                if start <= created < nxt:
                    runs.append((name, row))

    def jobs_of(item: tuple[str, dict]):
        name, run = item
        if run["event"] == "dynamic":  # Dependabot etc.: not attributable to a workflow file
            return name, run, []
        return name, run, fetch_jobs(owner, name, run["id"])

    with cf.ThreadPoolExecutor(6) as ex:
        results = list(ex.map(jobs_of, runs))

    per_repo = collections.defaultdict(lambda: collections.Counter())
    per_wf = collections.defaultdict(lambda: collections.Counter())
    per_day = collections.Counter()
    blocked_runs: dict[int, tuple[str, str]] = {}
    stuck = []
    dynamic_runs = collections.Counter()

    for name, run, jobs in results:
        if run["event"] == "dynamic":
            dynamic_runs[name] += 1
            continue
        age_min = (today - parse_ts(run["created_at"])).total_seconds() / 60
        if run["status"] in ("queued", "in_progress", "waiting", "pending") and age_min > args.stuck_min:
            stuck.append((name, run, round(age_min)))
        for job in jobs:
            pool, vcpus = classify(job.get("labels") or [])
            if not job.get("runner_name") and not job.get("runner_group_name"):
                # No runner ever picked the job up. `failure` = refused at start (quota/payment);
                # skipped / cancelled-in-queue jobs are neither billed nor "blocked".
                if job.get("status") == "completed" and job.get("conclusion") == "failure":
                    per_repo[name]["blocked_jobs"] += 1
                    blocked_runs[run["id"]] = (name, run["name"])
                continue
            if job.get("conclusion") == "skipped" or not job.get("started_at") or not job.get("completed_at"):
                continue
            seconds = (parse_ts(job["completed_at"]) - parse_ts(job["started_at"])).total_seconds()
            minutes = max(1, math.ceil(seconds / 60))
            key = f"{name}|{run['name']}"
            if pool in HOSTED_WEIGHT:
                if not private[name]:
                    continue  # public repos are free
                weighted = minutes * HOSTED_WEIGHT[pool]
                per_repo[name]["hosted"] += weighted
                per_repo[name][f"raw_{pool}"] += minutes
                per_wf[key]["hosted"] += weighted
                per_day[run["created_at"][:10]] += weighted
            elif pool == "ubicloud":
                per_repo[name]["ubicloud_min"] += minutes
                per_repo[name]["ubicloud_vcpu_min"] += minutes * vcpus
                per_wf[key]["ubicloud"] += minutes
            else:
                per_repo[name]["other_min"] += minutes
            per_repo[name]["jobs"] += 1
            per_wf[key]["jobs"] += 1

    hosted_total = sum(c["hosted"] for c in per_repo.values())
    ubi_min = sum(c["ubicloud_min"] for c in per_repo.values())
    ubi_vcpu_min = sum(c["ubicloud_vcpu_min"] for c in per_repo.values())
    ubi_usd = ubi_vcpu_min * args.rate_per_vcpu
    ubi_due = max(0.0, ubi_usd - args.credit)
    blocked_jobs = sum(c["blocked_jobs"] for c in per_repo.values())
    days_elapsed = max(1.0, min((today - start).total_seconds(), (nxt - start).total_seconds()) / 86400)
    days_total = (nxt - start).days
    projected = hosted_total / days_elapsed * days_total if today < nxt else hosted_total

    report = {
        "owner": owner,
        "month": month,
        "pool": {"limit": args.pool, "used": hosted_total, "remaining": max(0, args.pool - hosted_total),
                 "projected_month_end": round(projected)},
        "ubicloud": {"minutes": ubi_min, "vcpu_minutes": ubi_vcpu_min, "estimated_usd": round(ubi_usd, 3),
                     "credit_usd": args.credit, "estimated_due_usd": round(ubi_due, 3)},
        "blocked_jobs": blocked_jobs,
        "blocked_runs": [{"repo": r, "workflow": w, "run_id": i} for i, (r, w) in sorted(blocked_runs.items())],
        "stuck_runs": [{"repo": n, "workflow": r["name"], "run_id": r["id"], "status": r["status"], "age_min": a}
                       for n, r, a in stuck],
        "dependabot_dynamic_runs": dict(dynamic_runs),
        "repos": {n: dict(c) for n, c in per_repo.items()},
        "workflows": {k: dict(c) for k, c in per_wf.items()},
        "hosted_by_day": dict(sorted(per_day.items())),
    }
    if args.json:
        json.dump(report, sys.stdout, indent=2)
        print()
        return 0

    pct = 100 * hosted_total / args.pool if args.pool else 0
    print(f"\n{owner} - {month} (UTC)   private repos: {sum(1 for v in private.values() if v)}")
    print(f"GitHub hosted pool : {hosted_total:>6} / {args.pool} min  ({pct:.0f}%)   "
          f"remaining {max(0, args.pool - hosted_total)}   projected month-end ~{round(projected)}")
    print(f"Ubicloud overflow  : {ubi_min:>6} min  ~${ubi_usd:.2f} at list price, "
          f"credit ${args.credit:.2f} -> due ~${ubi_due:.2f}")
    print(f"Never got a runner : {blocked_jobs:>6} jobs in {len(blocked_runs)} runs"
          + ("   <- hosted pool exhausted or a label nobody serves" if blocked_jobs else ""))
    if dynamic_runs:
        print(f"Dependabot/dynamic : {sum(dynamic_runs.values())} runs (not counted above)")

    print(f"\n{'repo':<26}{'hosted':>8}{'ubicloud':>10}{'blocked':>9}{'jobs':>7}")
    for name, c in sorted(per_repo.items(), key=lambda kv: -(kv[1]["hosted"] + kv[1]["ubicloud_min"])):
        print(f"{name[:25]:<26}{c['hosted']:>8}{c['ubicloud_min']:>10}{c['blocked_jobs']:>9}{c['jobs']:>7}")

    print(f"\nTop workflows (hosted-weighted min | ubicloud min | jobs)")
    ranked = sorted(per_wf.items(), key=lambda kv: -(kv[1]["hosted"] + kv[1]["ubicloud"]))[: args.top]
    for key, c in ranked:
        print(f"  {key[:56]:<58}{c['hosted']:>6} | {c['ubicloud']:>5} | {c['jobs']:>4}")

    if per_day:
        top_days = sorted(per_day.items(), key=lambda kv: -kv[1])[:5]
        print("\nBusiest days (hosted min): " + ", ".join(f"{d[5:]}={m}" for d, m in top_days))

    if stuck:
        print(f"\nQueued / running longer than {args.stuck_min} min (cancel with the command shown):")
        for name, run, age in stuck:
            print(f"  {name} :: {run['name']} [{run['status']}, {age} min, branch {run.get('head_branch')}]"
                  f"\n      gh run cancel {run['id']} -R {owner}/{name}")
    else:
        print(f"\nNo run queued or in progress longer than {args.stuck_min} min.")
    print()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
