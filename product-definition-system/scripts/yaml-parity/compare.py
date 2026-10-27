#!/usr/bin/env python3
"""Does every YAML file this package ships mean the same to PyYAML as to our own parser?

PDS-YAML is a strict subset chosen so that it reads the same in every YAML parser. This is the
evidence: parse every record's front matter, every structured block, every meta-model file and
every template example both ways and compare. Needs `pip install pyyaml`; nothing else does.

    python3 scripts/yaml-parity/compare.py
"""
import datetime
import json
import os
import subprocess
import sys

try:
    import yaml
except ImportError:
    sys.exit("This check needs PyYAML: pip install pyyaml")

here = os.path.dirname(os.path.abspath(__file__))
dump = subprocess.run(["node", os.path.join(here, "dump.mjs")], check=True, capture_output=True, text=True).stdout
sources = json.loads(dump)


def plain(v):
    """PyYAML builds dates and non-string keys; ours keeps dates as text and keys as strings."""
    if isinstance(v, (datetime.date, datetime.datetime)):
        return v.isoformat()
    if isinstance(v, dict):
        return {str(k): plain(x) for k, x in v.items()}
    if isinstance(v, list):
        return [plain(x) for x in v]
    return v


def first_difference(ours, theirs, path=""):
    if type(ours) != type(theirs):
        return f"{path or '/'}: ours {ours!r:.80}, PyYAML {theirs!r:.80}"
    if isinstance(ours, dict):
        for k in sorted(set(ours) | set(theirs)):
            if k not in ours:
                return f"{path}/{k}: missing from ours; PyYAML {theirs[k]!r:.80}"
            if k not in theirs:
                return f"{path}/{k}: missing from PyYAML; ours {ours[k]!r:.80}"
            d = first_difference(ours[k], theirs[k], f"{path}/{k}")
            if d:
                return d
    elif isinstance(ours, list):
        if len(ours) != len(theirs):
            return f"{path}: {len(ours)} items in ours, {len(theirs)} in PyYAML"
        for i, (x, y) in enumerate(zip(ours, theirs)):
            d = first_difference(x, y, f"{path}[{i}]")
            if d:
                return d
    elif ours != theirs:
        return f"{path}: ours {ours!r:.80}, PyYAML {theirs!r:.80}"
    return None


same, problems = 0, []
for s in sources:
    if s["error"]:
        problems.append(f"{s['key']}: our parser refused it: {s['error']}")
        continue
    try:
        theirs = plain(yaml.safe_load(s["source"]))
    except yaml.YAMLError as e:
        problems.append(f"{s['key']}: PyYAML refused it: {str(e).splitlines()[0]}")
        continue
    d = first_difference(s["parsed"], theirs)
    if d:
        problems.append(f"{s['key']}: {d}")
    else:
        same += 1

print(f"{same} of {len(sources)} YAML sources read the same in both parsers (PyYAML {yaml.__version__}).")
for p in problems:
    print("  differs:", p)
sys.exit(1 if problems else 0)
