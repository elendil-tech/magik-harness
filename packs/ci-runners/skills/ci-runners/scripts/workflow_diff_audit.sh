#!/usr/bin/env bash
# Behaviour audit for a workflow conversion (read-only).
#
# A router/consolidation PR is meant to change WHERE jobs run, not WHAT they check. This lists
# what the diff removes apart from runner / timeout / concurrency scaffolding, so every removal
# can be confirmed as intended (aggregator and summary jobs, micro-jobs folded into another job).
# It also catches data inside a loop, such as an entry dropped from a list of test scripts: that
# is exactly the kind of slip a visual review of a large diff misses.
#
# usage: workflow_diff_audit.sh [<base-ref> [<head-ref>]]
#   default: origin/HEAD..HEAD (a PR branch against the default branch)
#   after a squash merge: workflow_diff_audit.sh <sha>^ <sha>
set -euo pipefail

base="${1:-origin/HEAD}"
head="${2:-HEAD}"

# Keys that are scaffolding on their own: moving them is not a behaviour change.
scaffold='^-\s*(runs-on|needs|timeout-minutes|if|name|uses|with|fetch-depth|cache|cache-dependency-path|node-version|python-version|go-version|types|branches|paths|paths-ignore|concurrency|group|cancel-in-progress|permissions|contents|steps:|jobs:|on:|env:|pull_request|push|workflow_dispatch|workflow_call|schedule|cron|persist-credentials|-\s+uses|-\s+name|#|\s*$)'

files="$(git diff --name-only "$base" "$head" -- .github/workflows .github/actions)"
if [ -z "$files" ]; then
  echo "No workflow changes between $base and $head."
  exit 0
fi

echo "== Lines removed that are not scaffolding (each must be intended)"
git diff "$base" "$head" -- .github/workflows .github/actions \
  | grep -E '^-[^-]' | grep -v -E "$scaffold" || echo "(none)"

echo
for f in $files; do
  echo "== $f: job ids and step names removed (<) or added (>)"
  names() { git show "$1:$f" 2>/dev/null | grep -E '^(  [A-Za-z0-9_-]+:\s*$|\s*- name:)' | sed -E 's/^[ -]*//' | sort -u; }
  diff <(names "$base") <(names "$head") || true
  echo
done
