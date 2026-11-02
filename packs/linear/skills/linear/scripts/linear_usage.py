#!/usr/bin/env python3
"""linear_usage.py: read-only census of a Linear workspace against the Free-plan issue cap.

Counts active (not archived) issues per team, splits them into open and closed, and reports
how fast issues are being created, how many days are left at that rate, and how many closed
issues will auto-archive soon. It sends GraphQL queries only: nothing is created, changed or
deleted, and the test suite fails if a mutation is ever sent.

Environment
  LINEAR_API_KEY   a Linear personal API key (required; never printed)
  LINEAR_API_URL   GraphQL endpoint override (default https://api.linear.app/graphql; used by tests)

Exit codes
  0  below the warn line
  1  warn  (active issues >= --warn)
  2  act   (active issues >= --act, which includes being over the cap)
  3  the census could not run (no key, network or API error)

Usage
  python3 linear_usage.py                       # all teams, human-readable
  python3 linear_usage.py --json                # machine-readable
  python3 linear_usage.py --team ENG --team OPS # limit the per-team table (the cap still counts every team)
  python3 linear_usage.py --cap 250 --warn 200 --act 230 --window-days 30
"""

from __future__ import annotations

import argparse
import json
import os
import sys
import urllib.error
import urllib.request
from datetime import datetime, timezone
from typing import Any

DEFAULT_URL = "https://api.linear.app/graphql"
OPEN_TYPES = {"triage", "backlog", "unstarted", "started"}
CLOSED_TYPES = {"completed", "canceled"}
DAYS_PER_MONTH = 30.4375

TEAMS_QUERY = "query { teams(first: 50) { nodes { key name autoArchivePeriod } } }"
ISSUES_QUERY = """
query($after: String) {
  issues(first: 100, after: $after) {
    pageInfo { hasNextPage endCursor }
    nodes { identifier createdAt completedAt canceledAt state { type } team { key } }
  }
}
"""


class CensusError(Exception):
    """The census could not run; main() turns it into exit code 3."""


def gql(url: str, key: str, query: str, variables: dict[str, Any] | None = None) -> dict[str, Any]:
    """Run one GraphQL query. The key is sent as the raw Authorization header and never echoed."""
    body = json.dumps({"query": query, "variables": variables or {}}).encode()
    request = urllib.request.Request(
        url, data=body, headers={"Authorization": key, "Content-Type": "application/json"}
    )
    try:
        with urllib.request.urlopen(request, timeout=60) as response:
            payload = json.load(response)
    except urllib.error.HTTPError as err:
        raise CensusError(f"Linear API answered HTTP {err.code}: {err.read().decode(errors='replace')[:200]}") from None
    except (urllib.error.URLError, TimeoutError, OSError) as err:
        raise CensusError(f"could not reach the Linear API: {err}") from None
    except ValueError:
        raise CensusError("the Linear API answered with something that is not JSON") from None
    if payload.get("errors"):
        raise CensusError(f"Linear API error: {json.dumps(payload['errors'])[:300]}")
    return payload["data"]


def parse_time(value: str | None) -> datetime | None:
    if not value:
        return None
    return datetime.fromisoformat(value.replace("Z", "+00:00"))


def fetch(url: str, key: str) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
    teams = gql(url, key, TEAMS_QUERY)["teams"]["nodes"]
    issues: list[dict[str, Any]] = []
    after: str | None = None
    while True:
        page = gql(url, key, ISSUES_QUERY, {"after": after})["issues"]
        issues.extend(page["nodes"])
        if not page["pageInfo"]["hasNextPage"]:
            return teams, issues
        after = page["pageInfo"]["endCursor"]


def census(
    teams: list[dict[str, Any]],
    issues: list[dict[str, Any]],
    now: datetime,
    cap: int,
    warn: int,
    act: int,
    window_days: int,
    only: set[str],
) -> dict[str, Any]:
    period_days = {t["key"]: (t.get("autoArchivePeriod") or 6) * DAYS_PER_MONTH for t in teams}
    rows: dict[str, dict[str, int]] = {
        t["key"]: {"active": 0, "open": 0, "closed": 0, "closed_older_than_window": 0, "archiving_soon": 0, "created_in_window": 0}
        for t in teams
    }
    for issue in issues:
        team = (issue.get("team") or {}).get("key", "?")
        row = rows.setdefault(
            team, {"active": 0, "open": 0, "closed": 0, "closed_older_than_window": 0, "archiving_soon": 0, "created_in_window": 0}
        )
        row["active"] += 1
        state = (issue.get("state") or {}).get("type")
        created = parse_time(issue.get("createdAt"))
        if created and (now - created).total_seconds() <= window_days * 86400:
            row["created_in_window"] += 1
        if state in CLOSED_TYPES:
            row["closed"] += 1
            closed_at = parse_time(issue.get("completedAt")) or parse_time(issue.get("canceledAt"))
            if closed_at:
                age = (now - closed_at).total_seconds() / 86400
                if age > window_days:
                    row["closed_older_than_window"] += 1
                # Archives once its age reaches the team's period; "soon" means within the window (or overdue).
                if age >= period_days.get(team, 6 * DAYS_PER_MONTH) - window_days:
                    row["archiving_soon"] += 1
        else:
            row["open"] += 1  # triage, backlog, unstarted and started all hold a slot and count as open

    total = sum(r["active"] for r in rows.values())
    created = sum(r["created_in_window"] for r in rows.values())
    per_day = created / window_days if window_days else 0.0
    headroom = cap - total
    level = "act" if total >= act else "warn" if total >= warn else "ok"
    shown = {k: v for k, v in rows.items() if not only or k in only}
    return {
        "total": total,
        "cap": cap,
        "headroom": headroom,
        "warn_at": warn,
        "act_at": act,
        "level": level,
        "window_days": window_days,
        "created_in_window": created,
        "created_per_day": round(per_day, 2),
        "days_to_cap": None if per_day == 0 else max(0, int(headroom / per_day)),
        "closed_older_than_window": sum(r["closed_older_than_window"] for r in rows.values()),
        "archiving_soon": sum(r["archiving_soon"] for r in rows.values()),
        "teams": shown,
    }


def render(result: dict[str, Any]) -> str:
    w = result["window_days"]
    lines = [
        f"Linear census: {result['total']} active of {result['cap']} "
        f"({result['headroom']} left)  [{result['level'].upper()}; warn at {result['warn_at']}, act at {result['act_at']}]",
        "",
        f"{'team':<8}{'active':>8}{'open':>8}{'closed':>8}{f'made {w}d':>10}{'archiving soon':>16}",
    ]
    for key, r in sorted(result["teams"].items()):
        lines.append(f"{key:<8}{r['active']:>8}{r['open']:>8}{r['closed']:>8}{r['created_in_window']:>10}{r['archiving_soon']:>16}")
    days = result["days_to_cap"]
    when = "no issues were created in the window" if days is None else f"about {days} days left at that rate if nothing archives"
    lines += [
        "",
        f"Created in the last {w} days: {result['created_in_window']} (~{result['created_per_day']}/day, a lower bound): {when}.",
        f"Closed for more than {w} days and still active: {result['closed_older_than_window']}. "
        f"Closed and auto-archiving within {w} days (or overdue): {result['archiving_soon']}.",
    ]
    if result["level"] != "ok":
        lines.append("Next: see 'Relieve the cap' in references/procedures.md (it needs the owner's approval before anything is deleted).")
    return "\n".join(lines)


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Read-only census of a Linear workspace against the Free-plan issue cap.")
    parser.add_argument("--team", action="append", default=[], metavar="KEY", help="show only this team in the table (repeatable); the cap counts every team")
    parser.add_argument("--cap", type=int, default=250, help="active-issue cap (default 250)")
    parser.add_argument("--warn", type=int, default=200, help="warn at this many active issues (default 200)")
    parser.add_argument("--act", type=int, default=230, help="act at this many active issues (default 230)")
    parser.add_argument("--window-days", type=int, default=30, help="window for the creation rate and archive forecast (default 30)")
    parser.add_argument("--json", action="store_true", help="print JSON instead of text")
    args = parser.parse_args(argv)

    key = os.environ.get("LINEAR_API_KEY")
    if not key:
        print("linear_usage: LINEAR_API_KEY is not set (have your secrets manager inject a Linear personal API key)", file=sys.stderr)
        return 3
    url = os.environ.get("LINEAR_API_URL", DEFAULT_URL)
    try:
        teams, issues = fetch(url, key)
    except CensusError as err:
        print(f"linear_usage: {err}", file=sys.stderr)
        return 3

    result = census(teams, issues, datetime.now(timezone.utc), args.cap, args.warn, args.act, args.window_days, set(args.team))
    print(json.dumps(result, indent=2) if args.json else render(result))
    return {"ok": 0, "warn": 1, "act": 2}[result["level"]]


if __name__ == "__main__":
    sys.exit(main())
