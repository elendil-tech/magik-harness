#!/usr/bin/env python3
"""wt_audit.py - inventory and fail-closed removal of git worktrees (stdlib only).

    wt_audit.py inventory [--repos-root DIR]... [--only REPO]... [--prs] [--sizes] [--json]
    wt_audit.py remove PATH [--delete-branch] [--vault] [--accept-ignored]
                            [--stack-torn-down] [--allow-open-pr] [--allow-unmerged]
                            [--apply]

`inventory` never modifies anything. `remove` is a dry run unless --apply is given,
never passes --force to git, and refuses (exit 2) whenever a check fails.

Environment:
    WORKTREES_HOME   durable root (default ~/worktrees)
    WT_REPOS_ROOT    colon-separated dirs that hold primary checkouts (default ~/Projects)
    WT_PROTECT       comma-separated worktree names that are never removed (default dev,dev2,dev3)
    WT_STACK_MARKERS comma-separated files that mark a worktree as having a running stack (default .devstack.local)
    ORCA_WORKSPACES  Orca's workspace directory (default: Orca's live profile store, then its legacy
                     data file, else ~/orca/workspaces)

POSIX only (macOS, Linux): it relies on lsof, symlinks and POSIX paths.
"""
from __future__ import annotations

import argparse
import fnmatch
import json
import os
import re
import shutil
import sqlite3
import subprocess
import sys
import time
from pathlib import Path
from urllib.parse import quote

HOME = Path.home()
ENV = {**os.environ, "GIT_OPTIONAL_LOCKS": "0", "GIT_TERMINAL_PROMPT": "0", "LC_ALL": "C"}

# Processes that watch files but do not "use" a worktree.
PASSIVE_PROCS = {
    "watchman", "mds", "mds_stores", "mdworker", "mdworker_shared", "fseventsd",
    "lsof", "corespotlightd", "backupd",
}
# Ignored paths any checkout can regenerate; other ignored files need --accept-ignored.
REGENERABLE_PARTS = {
    "node_modules", ".next", ".turbo", ".nuxt", ".svelte-kit", "dist", "build", "out",
    "coverage", "target", "__pycache__", ".pytest_cache", ".mypy_cache", ".ruff_cache",
    ".venv", "venv", ".cache", ".gradle", ".DS_Store", ".idea", ".parcel-cache",
    ".eslintcache",
}
REGENERABLE_PATHS = {".magik/harness.local.json", ".orca-vault-checkout"}
# Files whose presence means the worktree has a running stack (compose project, dev containers)
# that must be torn down before the worktree goes. Override with WT_STACK_MARKERS (comma-separated).
STACK_MARKERS = [m.strip() for m in os.environ.get("WT_STACK_MARKERS", ".devstack.local").split(",") if m.strip()]


# --------------------------------------------------------------------------- helpers
def run(cmd: list[str], cwd: str | Path | None = None, timeout: int = 120) -> tuple[int, str]:
    try:
        p = subprocess.run(
            cmd, cwd=str(cwd) if cwd else None, env=ENV,
            capture_output=True, text=True, timeout=timeout,
        )
    except (FileNotFoundError, subprocess.TimeoutExpired):
        return 127, ""
    return p.returncode, p.stdout.rstrip("\n")


def git(cwd: str | Path, *args: str) -> tuple[int, str]:
    return run(["git", "-C", str(cwd), *args])


def real(p: str | Path) -> str:
    return os.path.realpath(str(p))


def under(p: str, root: str) -> bool:
    return p == root or p.startswith(root.rstrip("/") + "/")


def tilde(p: str | Path) -> str:
    s = str(p)
    h = str(HOME)
    return "~" + s[len(h):] if s == h or s.startswith(h + "/") else s


def find_key(obj, key):
    if isinstance(obj, dict):
        if key in obj:
            return obj[key]
        for v in obj.values():
            r = find_key(v, key)
            if r is not None:
                return r
    elif isinstance(obj, list):
        for v in obj:
            r = find_key(v, key)
            if r is not None:
                return r
    return None


# --------------------------------------------------------------------------- roots
def orca_live_workspace_dir() -> str | None:
    """Orca 1.4+ keeps its settings in a SQLite profile store; orca-data.json is only the
    copy from before the migration, frozen at that moment, so it can name a stale directory.
    Reads only: a read-only attach never creates -wal/-shm files next to Orca's data."""
    base = next((b for b in (HOME / "Library/Application Support/orca", HOME / ".config/orca")
                 if b.is_dir()), None)
    if base is None:
        return None
    profile = "local-default"
    try:
        idx = json.loads((base / "orca-profile-index.json").read_text())
        profile = idx.get("activeProfileId") or profile
    except (OSError, ValueError, AttributeError):
        pass
    db = base / "profiles" / profile / "profile-state.db"
    if not db.is_file():
        return None
    wal = Path(str(db) + "-wal")
    # Orca stopped: the main file is complete and `immutable` reads it with no side effects.
    # Orca running: newer pages sit in the WAL, so attach read-only the normal way.
    mode = "mode=ro" if wal.exists() and wal.stat().st_size > 32 else "immutable=1"
    try:
        con = sqlite3.connect(f"file:{quote(str(db))}?{mode}", uri=True, timeout=2)
        try:
            row = con.execute(
                "select payload from profile_state_documents where domain = 'settings'").fetchone()
        finally:
            con.close()
        val = json.loads(row[0]).get("workspaceDir") if row else None
    except (sqlite3.Error, OSError, ValueError, TypeError, AttributeError):
        return None
    return val if isinstance(val, str) and os.path.isabs(os.path.expanduser(val)) else None


def orca_dir() -> Path:
    env = os.environ.get("ORCA_WORKSPACES")
    if env:
        return Path(env).expanduser()
    live = orca_live_workspace_dir()
    if live:
        return Path(live).expanduser()
    for f in (HOME / "Library/Application Support/orca/orca-data.json",
              HOME / ".config/orca/orca-data.json"):
        try:
            val = find_key(json.loads(f.read_text()), "workspaceDir")
        except (OSError, ValueError):
            continue
        if isinstance(val, str) and os.path.isabs(os.path.expanduser(val)):
            return Path(val).expanduser()
    return HOME / "orca" / "workspaces"


def durable_root() -> str:
    """$WORKTREES_HOME (empty counts as unset, a leading ~ is expanded), else ~/worktrees.
    An empty value must not fall through to realpath(""), which is the current directory."""
    return real(Path(os.environ.get("WORKTREES_HOME") or HOME / "worktrees").expanduser())


def roots() -> dict[str, str]:
    return {
        "durable": durable_root(),
        "cursor": real(HOME / ".cursor" / "worktrees"),
        "orca": real(orca_dir()),
    }


def repos_roots(extra: list[str] | None) -> list[str]:
    if extra:
        return [real(Path(p).expanduser()) for p in extra]
    env = os.environ.get("WT_REPOS_ROOT")
    if env:
        return [real(Path(p).expanduser()) for p in env.split(":") if p]
    return [real(HOME / "Projects")]


def classify(path: str, primary: str, rts: dict[str, str], rr: list[str]) -> str:
    p = real(path)
    if p == real(primary):
        return "primary"
    for name in ("durable", "cursor", "orca"):
        if under(p, rts[name]):
            return name
    return "legacy" if any(under(p, r) for r in rr) else "other"


def cursor_settings() -> dict[str, float]:
    for f in (HOME / "Library/Application Support/Cursor/User/settings.json",
              HOME / ".config/Cursor/User/settings.json"):
        try:
            text = f.read_text(errors="ignore")
        except OSError:
            continue
        out = {}
        for key in ("cursor.worktreeMaxCount", "cursor.worktreesGlobalMaxSizeGb",
                    "cursor.worktreeCleanupIntervalHours"):
            m = re.search(r'"%s"\s*:\s*(\d+(?:\.\d+)?)' % re.escape(key), text)
            if m:
                out[key] = float(m.group(1))
        return out
    return {}


def cursor_entries(cursor_root: str) -> list[dict]:
    """What Cursor's janitor counts (checked against Cursor 3.24): every <root>/<repo>/<id>
    folder that holds a `.git` and resolves to a repository, whether or not git registers it.
    A symlink to a worktree counts as one more entry (Cursor follows links), and so does a
    `<id>.vault` clone. The folder's mtime stands in for Cursor's last-access time."""
    found: list[dict] = []
    try:
        repo_dirs = sorted(k for k in Path(cursor_root).iterdir() if k.is_dir())
    except OSError:
        return found
    for rd in repo_dirs:
        try:
            ids = sorted(k for k in rd.iterdir() if k.is_dir())
        except OSError:
            continue
        for e in ids:
            if not (e / ".git").exists() or git(e, "rev-parse", "--show-toplevel")[0] != 0:
                continue
            try:
                mtime = int(os.stat(e).st_mtime)
            except OSError:
                continue
            found.append({"path": str(e), "mtime": mtime,
                          "alias_of": real(e) if e.is_symlink() else None})
    return found


# --------------------------------------------------------------------------- git facts
def primary_of(path: str | Path) -> Path | None:
    rc, out = git(path, "rev-parse", "--git-common-dir")
    if rc != 0 or not out:
        return None
    common = Path(real(Path(path) / out))
    return common.parent if common.name == ".git" else common


def list_worktrees(primary: Path) -> list[dict]:
    rc, out = git(primary, "worktree", "list", "--porcelain")
    if rc != 0:
        return []
    res = []
    for block in out.split("\n\n"):
        wt = {"path": None, "head": "", "branch": None, "detached": False,
              "locked": False, "prunable": False, "bare": False}
        for line in block.splitlines():
            if line.startswith("worktree "):
                wt["path"] = line[9:]
            elif line.startswith("HEAD "):
                wt["head"] = line[5:]
            elif line.startswith("branch "):
                b = line[7:]
                wt["branch"] = b[11:] if b.startswith("refs/heads/") else b
            elif line == "detached":
                wt["detached"] = True
            elif line.startswith("locked"):
                wt["locked"] = True
            elif line.startswith("prunable"):
                wt["prunable"] = True
            elif line == "bare":
                wt["bare"] = True
        if wt["path"]:
            res.append(wt)
    return res


def integration_refs(primary: Path) -> list[str]:
    refs = []
    rc, head = git(primary, "symbolic-ref", "-q", "--short", "refs/remotes/origin/HEAD")
    if rc == 0 and head:
        refs.append(head)
    for r in ("origin/develop", "origin/main", "origin/master"):
        if r not in refs and git(primary, "rev-parse", "-q", "--verify", r)[0] == 0:
            refs.append(r)
    return refs


def load_prs(primary: Path) -> dict[str, dict] | None:
    rc, out = run(
        ["gh", "pr", "list", "--state", "all", "--limit", "300", "--json",
         "number,state,isDraft,headRefName,headRefOid"], cwd=primary, timeout=60)
    if rc != 0 or not out:
        return None
    try:
        items = json.loads(out)
    except ValueError:
        return None
    by: dict[str, dict] = {}
    for it in items:
        cur = by.get(it["headRefName"])
        if cur is None or (it["state"] == "OPEN" and cur["state"] != "OPEN"):
            by[it["headRefName"]] = it
    return by


def open_files() -> list[tuple[str, str, str]]:
    """One lsof sweep: (pid, command, path) for everything open, minus this tool itself."""
    rc, out = run(["lsof", "-w", "+c", "0", "-Fpcn"], timeout=90)
    me = str(os.getpid())
    entries, pid, cmd = [], "", ""
    for line in out.splitlines():
        if line.startswith("p"):
            pid = line[1:]
        elif line.startswith("c"):
            cmd = line[1:]
        elif line.startswith("n") and pid != me:
            entries.append((pid, cmd, line[1:]))
    return entries


def users_of(path: str, entries: list[tuple[str, str, str]]) -> list[str]:
    p = real(path)
    found = {f"{cmd}(pid {pid})" for pid, cmd, name in entries
             if cmd not in PASSIVE_PROCS and under(name, p)}
    return sorted(found)


def ignored_irregular(path: str) -> list[str]:
    rc, out = git(path, "status", "--porcelain", "--ignored")
    bad = []
    for line in out.split("\n"):
        if not line.startswith("!! "):
            continue
        rel = line[3:].rstrip("/")
        parts = rel.split("/")
        if rel in REGENERABLE_PATHS or any(p in REGENERABLE_PARTS for p in parts):
            continue
        if any(fnmatch.fnmatch(parts[-1], pat) for pat in ("*.pyc", "*.tsbuildinfo")):
            continue
        bad.append(rel)
    return bad


def du_mb(path: str) -> float | None:
    rc, out = run(["du", "-sk", path], timeout=180)
    try:
        return int(out.split()[0]) / 1024
    except (ValueError, IndexError):
        return None


# --------------------------------------------------------------------------- inspection
def inspect(primary: Path, wt: dict, is_primary: bool, refs: list[str], prs: dict | None,
            files: list, rts: dict, rr: list[str], protect: set[str], sizes: bool) -> dict:
    path = wt["path"]
    d = {
        "path": path, "branch": wt["branch"] or ("(detached)" if wt["detached"] else "?"),
        "head": wt["head"][:8], "primary": is_primary,
        "where": classify(path, str(primary), rts, rr),
        "missing": not Path(path).is_dir(), "locked": wt["locked"],
        "tracked": 0, "untracked": 0, "unpushed": None, "upstream": None,
        "ahead": None, "behind": None, "merged": False, "pr": None,
        "age_days": None, "created": None, "vault": Path(path + ".vault").exists(),
        "in_use": [], "size_mb": None, "name": Path(path).name,
    }
    if d["missing"]:
        d["verdict"] = "primary" if is_primary else "MISSING"
        return d
    _, out = git(path, "status", "--porcelain")
    lines = [ln for ln in out.split("\n") if ln]
    d["untracked"] = sum(1 for ln in lines if ln.startswith("??"))
    d["tracked"] = len(lines) - d["untracked"]
    rc, out = git(path, "rev-list", "--count", "HEAD", "--not", "--remotes")
    d["unpushed"] = int(out) if rc == 0 and out.isdigit() else None
    rc, up = git(path, "rev-parse", "--abbrev-ref", "@{u}")
    if rc == 0 and up:
        d["upstream"] = up
        rc, lr = git(path, "rev-list", "--left-right", "--count", "@{u}...HEAD")
        if rc == 0 and lr:
            b, a = lr.split()
            d["behind"], d["ahead"] = int(b), int(a)
    d["merged"] = any(git(path, "merge-base", "--is-ancestor", "HEAD", r)[0] == 0 for r in refs)
    rc, ct = git(path, "log", "-1", "--format=%ct", "HEAD")
    if rc == 0 and ct.isdigit():
        d["age_days"] = int((time.time() - int(ct)) / 86400)
    try:
        st = os.stat(Path(path) / ".git")
        d["created"] = int(getattr(st, "st_birthtime", st.st_mtime))
    except OSError:
        pass
    if prs is not None and wt["branch"]:
        pr = prs.get(wt["branch"])
        if pr:
            d["pr"] = {"number": pr["number"], "state": pr["state"],
                       "draft": pr.get("isDraft", False), "tip": pr["headRefOid"]}
    d["in_use"] = users_of(path, files)
    if sizes:
        d["size_mb"] = du_mb(path)
    d["verdict"] = verdict(d, protect, wt["head"])
    return d


def verdict(d: dict, protect: set[str], head_full: str) -> str:
    if d["primary"]:
        return "primary"
    if d["name"] in protect:
        return "STANDING"
    if d["missing"]:
        return "MISSING"
    if d["locked"]:
        return "LOCKED"
    if d["in_use"]:
        return "IN-USE"
    if d["tracked"] or d["untracked"]:
        return "DIRTY"
    pr = d["pr"]
    # A PR merged at exactly this HEAD has landed, even when git counts its commits as unpushed:
    # a squash or rebase merge leaves them on no branch of the base, and a repo that deletes the
    # head branch on merge leaves them on no remote branch either. GitHub keeps the tip under
    # refs/pull/<n>/head. Commits past that tip are not covered (the tip would not equal HEAD).
    landed = bool(pr and pr["state"] == "MERGED" and pr["tip"] == head_full)
    if d["unpushed"] and not landed:
        return "UNPUSHED"
    if pr:
        if pr["state"] == "OPEN":
            return "OPEN-PR"
        if pr["state"] == "MERGED":
            return "DONE" if (landed or d["merged"]) else "REVIEW"
        return "REVIEW"  # closed without merging
    if d["merged"]:
        # A branch with no commits of its own looks "merged" too: do not call a worktree
        # created in the last two days finished.
        fresh_days = float(os.environ.get("WT_FRESH_DAYS", "2"))
        fresh = d["created"] is not None and time.time() - d["created"] < fresh_days * 86400
        return "NEW" if fresh else "DONE"
    return "ACTIVE"


# --------------------------------------------------------------------------- discovery
def discover_primaries(rr: list[str], rts: dict) -> list[Path]:
    seen: dict[str, Path] = {}

    def add(p: Path | None):
        if p is not None:
            seen.setdefault(real(p), p)

    for root in rr:
        try:
            kids = sorted(Path(root).iterdir())
        except OSError:
            continue
        for k in kids:
            if (k / ".git").is_dir():
                add(k)
    # repos that only show up through a worktree in one of the roots
    for r in (rts["durable"], rts["cursor"], rts["orca"]):
        for g in find_checkouts(Path(r), 3):
            if g.joinpath(".git").is_file():
                add(primary_of(g))
    return sorted(seen.values(), key=lambda p: p.name)


def find_checkouts(root: Path, depth: int) -> list[Path]:
    found: list[Path] = []

    def walk(d: Path, level: int):
        try:
            kids = sorted(k for k in d.iterdir() if k.is_dir() and not k.is_symlink())
        except OSError:
            return
        for k in kids:
            if (k / ".git").exists():
                found.append(k)
            elif level < depth:
                walk(k, level + 1)

    if root.is_dir():
        walk(root, 1)
    return found


def find_strays(containers: list[str], registered: set[str]) -> list[dict]:
    strays: list[dict] = []

    def has_checkout(d: Path, level: int) -> bool:
        if level > 3:
            return False
        try:
            for k in d.iterdir():
                if k.is_dir() and not k.is_symlink():
                    if (k / ".git").exists() or has_checkout(k, level + 1):
                        return True
        except OSError:
            pass
        return False

    def effectively_empty(d: Path) -> bool:
        for _, _, fnames in os.walk(d):
            if any(f != ".DS_Store" for f in fnames):
                return False
        return True

    def walk(d: Path, level: int):
        try:
            kids = sorted(k for k in d.iterdir()
                          if k.is_dir() and not k.is_symlink() and not k.name.startswith("."))
        except OSError:
            return
        for k in kids:
            rp = real(k)
            if (k / ".git").exists():
                if rp in registered:
                    continue
                if k.name.endswith(".vault"):
                    sib = real(str(k)[:-len(".vault")])
                    if sib in registered:
                        continue
                    strays.append({"path": str(k), "kind": "orphan-vault"})
                else:
                    strays.append({"path": str(k), "kind": "unregistered-checkout"})
            elif has_checkout(k, level + 1):
                walk(k, level + 1)
            else:
                kind = "empty" if effectively_empty(k) else "non-checkout-dir"
                strays.append({"path": str(k), "kind": kind})

    for c in containers:
        if Path(c).is_dir():
            walk(Path(c), 1)
    return strays


# --------------------------------------------------------------------------- inventory
def cmd_inventory(args) -> int:
    rts, rr = roots(), repos_roots(args.repos_root)
    protect = {s for s in os.environ.get("WT_PROTECT", "dev,dev2,dev3").split(",") if s}
    files = open_files()
    primaries = discover_primaries(rr, rts)
    # --only narrows the report, never the registry: every repo's worktrees count as known.
    listed = {str(p): list_worktrees(p) for p in primaries}
    registered = {real(w["path"]) for wts in listed.values() for w in wts}
    report, all_wts = [], []
    for prim in primaries:
        if args.only and prim.name not in args.only:
            continue
        wts = listed[str(prim)]
        if not wts:
            continue
        refs = integration_refs(prim)
        prs = load_prs(prim) if args.prs else None
        rows = [inspect(prim, wt, i == 0, refs, prs, files, rts, rr, protect, args.sizes)
                for i, wt in enumerate(wts)]
        all_wts.extend(r for r in rows if not r["primary"])
        report.append({"repo": prim.name, "path": str(prim), "refs": refs,
                       "prs": "loaded" if prs is not None else ("unavailable" if args.prs else "off"),
                       "worktrees": rows})
    containers = [rts["durable"], rts["cursor"], rts["orca"]]
    for r in rr:
        try:
            for k in sorted(Path(r).iterdir()):
                if not k.is_dir() or (k / ".git").exists():
                    continue  # a checkout (primary or linked worktree), not a container
                rk = real(k)
                if re.search(r"(-worktrees|-wt)$", k.name) or any(
                        under(real(w["path"]), rk) for w in all_wts):
                    containers.append(rk)
        except OSError:
            pass
    strays = find_strays(sorted(set(containers)), registered)
    # Cursor's janitor counts folders, not git registrations: aliases and unregistered
    # checkouts count, empty or broken folders do not. Past the cap it removes excess + 4.
    entries = cursor_entries(rts["cursor"])
    settings = cursor_settings()
    cap = int(settings.get("cursor.worktreeMaxCount", 25))
    would_remove = len(entries) - cap + 4 if len(entries) > cap else 0
    by_real = {real(w["path"]): w for w in all_wts}

    def describe(e: dict) -> dict:
        rp = real(e["path"])
        row = by_real.get(rp)
        if e["alias_of"]:
            verdict = "ALIAS of " + Path(e["alias_of"]).name
        elif row:
            verdict = row["verdict"]
        else:
            verdict = "other repo (--only)" if rp in registered else "UNREGISTERED"
        return {"path": e["path"], "branch": row["branch"] if row else "-", "verdict": verdict}

    oldest = sorted(entries, key=lambda e: e["mtime"])
    janitor = {"cursor_root_worktrees": len(entries), "cap": cap,
               "global_max_gb": settings.get("cursor.worktreesGlobalMaxSizeGb"),
               "would_remove": would_remove,
               "aliases": [{"path": e["path"], "target": e["alias_of"]}
                           for e in entries if e["alias_of"]],
               "oldest": [describe(e) for e in oldest[:max(5, would_remove)]]}
    if args.json:
        print(json.dumps({"roots": rts, "repos": report, "strays": strays, "janitor": janitor},
                         indent=2))
        return 0
    print_inventory(rts, report, strays, janitor, all_wts)
    return 0


def pr_text(d: dict) -> str:
    pr = d["pr"]
    if not pr:
        return "-"
    return f"#{pr['number']} {pr['state'].lower()}{' draft' if pr['draft'] else ''}"


def print_inventory(rts, report, strays, janitor, all_wts):
    print(f"Durable root : {tilde(rts['durable'])}")
    print(f"Cursor root  : {tilde(rts['cursor'])}   (disposable: janitor)")
    print(f"Orca root    : {tilde(rts['orca'])}")
    for rep in report:
        linked = [w for w in rep["worktrees"] if not w["primary"]]
        prim = rep["worktrees"][0]
        print(f"\n== {rep['repo']}  ({tilde(rep['path'])})  integration: "
              f"{', '.join(rep['refs']) or 'none'}  PRs: {rep['prs']}")
        head = ["WORKTREE", "BRANCH", "WHERE", "VERDICT", "DIRTY", "UNPUSHED", "PR", "AGE", "VAULT"]
        if any(w["size_mb"] is not None for w in rep["worktrees"]):
            head.append("MB")
        table = [head]
        for w in rep["worktrees"]:
            row = [tilde(w["path"]), w["branch"], w["where"], w["verdict"],
                   f"{w['tracked']}+{w['untracked']}" if not w["missing"] else "-",
                   str(w["unpushed"]) if w["unpushed"] is not None else "-",
                   pr_text(w), f"{w['age_days']}d" if w["age_days"] is not None else "-",
                   "yes" if w["vault"] else "-"]
            if len(head) == 10:
                row.append(f"{w['size_mb']:.0f}" if w["size_mb"] is not None else "-")
            table.append(row)
        widths = [max(len(r[i]) for r in table) for i in range(len(head))]
        for i, r in enumerate(table):
            print("  " + "  ".join(c.ljust(widths[j]) for j, c in enumerate(r)).rstrip())
            if i == 0:
                print("  " + "  ".join("-" * w for w in widths))
        if prim["behind"]:
            print(f"  primary is {prim['behind']} behind {prim['upstream']}")
        if not linked:
            print("  (no linked worktrees)")
    print("\n== Strays (in a worktree root, not registered to any repo)")
    loud = [s for s in strays if s["kind"] != "empty"]
    quiet = len(strays) - len(loud)
    if not loud:
        print("  none")
    for s in loud:
        print(f"  {s['kind']:<22} {tilde(s['path'])}")
    if quiet:
        print(f"  ({quiet} empty placeholder folder(s) not listed; harmless, see --json)")
    cnt: dict[str, int] = {}
    for w in all_wts:
        cnt[w["verdict"]] = cnt.get(w["verdict"], 0) + 1
    where: dict[str, int] = {}
    for w in all_wts:
        where[w["where"]] = where.get(w["where"], 0) + 1
    print("\n== Summary")
    print("  linked worktrees: " + (", ".join(f"{v} {k}" for k, v in sorted(cnt.items())) or "none"))
    print("  by root         : " + (", ".join(f"{v} {k}" for k, v in sorted(where.items())) or "none"))
    j = janitor
    risk = "  <-- AT RISK" if j["cursor_root_worktrees"] >= max(1, j["cap"] - 3) else ""
    print(f"  Cursor janitor  : {j['cursor_root_worktrees']} worktree(s) counted in the Cursor root, "
          f"cap {j['cap']}{risk}")
    if j["oldest"]:
        print("    next to go    : " + ", ".join(
            f"{Path(o['path']).name} ({o['verdict']})" for o in j["oldest"][:3]))
    if j["would_remove"]:
        print(f"    over the cap  : the next cleanup removes {j['would_remove']} at once "
              "(excess + 4), checks nothing for dirty or unpushed work and skips the trash")
    for a in j["aliases"]:
        print(f"    ALIAS         : {tilde(a['path'])} -> {tilde(a['target'])}  Cursor counts a "
              "link as a second worktree, and `git worktree remove` on it deletes the real one; "
              "remove the link itself (rm, not rm -r)")
    legacy = [w for w in all_wts if w["where"] in ("legacy", "other", "orca") and w["where"] != "durable"]
    if legacy:
        print(f"  outside durable : {len(legacy)} worktree(s) in legacy/other/Orca-default roots "
              "(finish and tear down; do not move a worktree that has a running stack)")


# --------------------------------------------------------------------------- remove
def vault_blockers(vpath: Path, files: list, accept_ignored: bool) -> list[str]:
    b: list[str] = []
    if vpath.is_symlink():
        return [f"vault sibling is a symlink to {tilde(real(vpath))}; check where it points, "
                "then `rm` the link itself (not `rm -r`)"]
    if not vpath.is_dir():
        return ["vault sibling does not exist"]
    if (vpath / ".git").is_file():
        return ["vault sibling is a linked worktree of the vault repo; remove it with "
                "`git -C <vault> worktree remove` instead"]
    if not (vpath / ".git").is_dir():
        return ["vault sibling is not a git checkout"]
    _, out = git(vpath, "status", "--porcelain")
    if out:
        b.append("vault sibling has uncommitted changes")
    rc, out = git(vpath, "log", "--branches", "--not", "--remotes", "--oneline")
    if out:
        b.append("vault sibling has commits that exist on no remote")
    if git(vpath, "stash", "list")[1]:
        b.append("vault sibling has stashes")
    ign = ignored_irregular(str(vpath))
    if ign and not accept_ignored:
        b.append("vault sibling has local-only ignored files (rescue them, then pass "
                 "--accept-ignored): " + ", ".join(ign[:6]))
    use = users_of(str(vpath), files)
    if use:
        b.append("vault sibling is in use: " + ", ".join(use))
    return b


def remove_orphan_vault(args, vpath: str) -> int:
    """A standalone `<name>.vault` clone whose worktree is gone."""
    files = open_files()
    blockers = vault_blockers(Path(vpath), files, args.accept_ignored)
    sibling = vpath[:-len(".vault")]
    if Path(sibling).exists():
        blockers.insert(0, f"its worktree {tilde(sibling)} still exists - remove that "
                           "worktree with --vault instead")
    print(f"vault clone: {tilde(vpath)}")
    if blockers:
        for b in blockers:
            print(f"  REFUSED: {b}")
        return 2
    if not args.apply:
        print(f"  DRY RUN - would remove {tilde(vpath)}\n  re-run with --apply to execute")
        return 0
    shutil.rmtree(vpath)
    print(f"  removed: {tilde(vpath)}")
    return 0


def cmd_remove(args) -> int:
    given = Path(args.path).expanduser()
    if given.is_symlink():
        # git would delete the worktree the link points to, which is rarely what "remove the
        # link" meant (Cursor's janitor counts links as extra worktrees). Make it explicit.
        print(f"REFUSED: {tilde(given)} is a symlink to {tilde(real(given))}; pass the real path "
              "to remove that worktree, or `rm` the link itself (not `rm -r`) to drop only the link")
        return 2
    wt_path = real(given)
    prim = primary_of(wt_path) if Path(wt_path).is_dir() else None
    if prim is None:
        print(f"REFUSED: {tilde(wt_path)} is not a git checkout (stale registration? "
              "use `git worktree prune`)")
        return 2
    if wt_path.endswith(".vault") and (Path(wt_path) / ".git").is_dir():
        return remove_orphan_vault(args, wt_path)
    wts = list_worktrees(prim)
    entry = next((w for w in wts if real(w["path"]) == wt_path), None)
    blockers: list[str] = []
    notes: list[str] = []
    rts, rr = roots(), repos_roots(None)
    protect = {s for s in os.environ.get("WT_PROTECT", "dev,dev2,dev3").split(",") if s}
    files = open_files()
    if entry is None:
        print(f"REFUSED: {tilde(wt_path)} is not a registered worktree of {prim.name}")
        return 2
    is_primary = wts[0] is entry
    prs = load_prs(prim)
    refs = integration_refs(prim)
    d = inspect(prim, entry, is_primary, refs, prs, files, rts, rr, protect, False)
    v = d["verdict"]
    if is_primary:
        blockers.append("this is the primary checkout")
    elif v == "STANDING":
        blockers.append(f"'{d['name']}' is a standing lane (WT_PROTECT) - never removed")
    elif v == "LOCKED":
        blockers.append("worktree is locked")
    elif v == "IN-USE":
        blockers.append("in use by: " + ", ".join(d["in_use"]))
    elif v == "DIRTY":
        blockers.append(f"uncommitted work: {d['tracked']} tracked change(s), "
                        f"{d['untracked']} untracked file(s)")
    elif v == "UNPUSHED":
        blockers.append(f"{d['unpushed']} commit(s) exist on no remote - push them first")
    elif v == "OPEN-PR" and not args.allow_open_pr:
        blockers.append(f"PR #{d['pr']['number']} is still open (--allow-open-pr to remove "
                        "only the worktree)")
    elif v in ("ACTIVE", "REVIEW", "NEW") and not args.allow_unmerged:
        if v == "REVIEW":
            why = "PR closed without merging, or merged with a different tip"
        elif v == "NEW":
            why = "the worktree is new and has no commits of its own yet"
        else:
            why = "pushed but not merged into " + (", ".join(refs) or "any integration branch")
        blockers.append(f"work is not finished: {why} (--allow-unmerged to remove only the worktree)")
    if d["unpushed"] is None and not is_primary:
        # verdict() reads "unknown" as "none", and nothing downstream re-checks pushed commits.
        blockers.append("cannot tell whether every commit exists on a remote (git rev-list "
                        "failed): fix the repository state and retry")
    if v == "DONE" and d["unpushed"] and d["pr"]:
        n = d["pr"]["number"]
        notes.append(f"{d['unpushed']} commit(s) are on no remote branch, but PR #{n} merged this "
                     f"exact tip (GitHub keeps it under refs/pull/{n}/head)")
    if prs is None:
        notes.append("PR state unknown (gh unavailable): merge status uses git ancestry only, "
                     "which squash merges defeat")
    if not blockers:
        ign = ignored_irregular(wt_path)
        if ign and not args.accept_ignored:
            blockers.append("ignored files that are not known-regenerable (check they are "
                            "recreated by provisioning, then --accept-ignored): " + ", ".join(ign[:8]))
        markers = [m for m in STACK_MARKERS if (Path(wt_path) / m).exists()]
        if markers and not args.stack_torn_down:
            blockers.append(f"has a stack identity ({', '.join(markers)}): tear the stack down with "
                            "the repo's own wrapper first (e.g. `worktree.sh rm <branch>`), then pass "
                            "--stack-torn-down")
        if (Path(wt_path) / ".cursor/worktree/teardown.sh").exists():
            notes.append("the repo ships .cursor/worktree/teardown.sh - prefer its wrapper "
                         "(it also stops stacks and removes the vault sibling)")
    vpath = Path(wt_path + ".vault")
    if args.vault and not blockers:
        if vpath.exists():
            blockers += vault_blockers(vpath, files, args.accept_ignored)
        else:
            notes.append("no .vault sibling present")
    elif vpath.exists() and not args.vault:
        notes.append(f"vault sibling remains: {tilde(vpath)} (add --vault to remove it too)")
    done = v == "DONE"
    plan = [f"git -C {tilde(prim)} worktree remove {tilde(wt_path)}"]
    if args.delete_branch:
        if not entry["branch"]:
            notes.append("detached HEAD: no branch to delete")
        elif not done:
            notes.append(f"branch '{entry['branch']}' kept: the work is not merged yet")
        else:
            proof = (f"PR #{d['pr']['number']} merged this exact tip" if d["unpushed"] and d["pr"]
                     else "tip is on a remote and merged")
            plan.append(f"git -C {tilde(prim)} branch -D {entry['branch']}   "
                        f"({proof}; safe for squash merges)")
    if args.vault and vpath.exists() and not blockers:
        plan.append(f"remove {tilde(vpath)}")
    print(f"worktree : {tilde(wt_path)}  [{d['branch']}  {d['head']}]  verdict={v}")
    for n in notes:
        print(f"  note   : {n}")
    if blockers:
        for b in blockers:
            print(f"  REFUSED: {b}")
        return 2
    if not args.apply:
        print("  DRY RUN - would:")
        for p in plan:
            print(f"    {p}")
        print("  re-run with --apply to execute")
        return 0
    rc, out = git(prim, "worktree", "remove", wt_path)
    if rc != 0:
        print(f"  FAILED : git worktree remove: {out or 'see git output'}")
        return 1
    print(f"  removed: {tilde(wt_path)}")
    if args.delete_branch and entry["branch"] and done:
        rc, out = git(prim, "branch", "-D", entry["branch"])
        print(f"  branch : {out or 'deleted ' + entry['branch']}")
    if args.vault and vpath.exists():
        shutil.rmtree(vpath)
        print(f"  removed: {tilde(vpath)}")
    return 0


# --------------------------------------------------------------------------- main
def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(prog="wt_audit.py", description=__doc__.split("\n\n")[0])
    sub = ap.add_subparsers(dest="cmd", required=True)
    inv = sub.add_parser("inventory", help="read-only cross-repo worktree inventory")
    inv.add_argument("--repos-root", action="append", help="dir holding primary checkouts (repeatable)")
    inv.add_argument("--only", action="append", help="limit to this repo name (repeatable)")
    inv.add_argument("--prs", action="store_true", help="look up PR state with gh")
    inv.add_argument("--sizes", action="store_true", help="measure each worktree (slow)")
    inv.add_argument("--json", action="store_true")
    rm = sub.add_parser("remove", help="guarded removal (dry run unless --apply)")
    rm.add_argument("path")
    rm.add_argument("--delete-branch", action="store_true")
    rm.add_argument("--vault", action="store_true", help="also remove the <path>.vault sibling")
    rm.add_argument("--accept-ignored", action="store_true")
    rm.add_argument("--stack-torn-down", action="store_true")
    rm.add_argument("--allow-open-pr", action="store_true")
    rm.add_argument("--allow-unmerged", action="store_true")
    rm.add_argument("--apply", action="store_true")
    args = ap.parse_args(argv)
    return cmd_inventory(args) if args.cmd == "inventory" else cmd_remove(args)


if __name__ == "__main__":
    sys.exit(main())
