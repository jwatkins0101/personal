#!/bin/bash
# Standard launchd wrapper for every Chief of Staff lane (ai-chief-of-staff AC-07, AC-11).
#   lane-run.sh <lane> [--attempts N] [--artifact /abs/path]... -- <command> [args...]
#   ({date} in an --artifact path becomes today's YYYY-MM-DD)
# - bash (which holds Full Disk Access) so lanes under ~/Documents can run
# - absolute PATH, raised file-descriptor limit
# - retries with backoff (30s, 120s) on nonzero exit
# - exports COS_RUN_SUMMARY: a lane may write its JSON summary there
# - always appends a run record via record-run.mjs, even on failure
set -uo pipefail
export PATH="$HOME/.local/bin:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin"
ulimit -n 65536 2>/dev/null || ulimit -n 10240 2>/dev/null || true

COS_BIN="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
lane="${1:?lane required}"; shift
attempts=3; artifacts=()
while [ $# -gt 0 ] && [ "$1" != "--" ]; do
  case "$1" in
    --attempts) attempts="$2"; shift 2 ;;
    --artifact) artifacts+=(--artifact "${2//\{date\}/$(date +%F)}"); shift 2 ;;
    *) echo "lane-run: unknown option $1" >&2; exit 2 ;;
  esac
done
[ "${1:-}" = "--" ] && shift
[ $# -gt 0 ] || { echo "lane-run: no command given" >&2; exit 2; }

run_id="${lane}-$(date +%Y%m%dT%H%M%S)-$$"
started="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
export COS_RUN_SUMMARY="${TMPDIR:-/tmp}/cos-${run_id}.summary.json"
: > "$COS_RUN_SUMMARY"
read -r -a backoff <<< "${COS_BACKOFF:-0 30 120 300}"

echo "=== lane $lane run $run_id $(date) ==="
n=0; code=1
while [ $n -lt "$attempts" ]; do
  n=$((n + 1))
  [ $n -gt 1 ] && { echo "--- retry $n/$attempts after ${backoff[$((n-1))]}s (last exit $code) ---"; sleep "${backoff[$((n-1))]}"; : > "$COS_RUN_SUMMARY"; }
  "$@"; code=$?
  [ $code -eq 0 ] && break
done

node "$COS_BIN/record-run.mjs" --lane "$lane" --run-id "$run_id" --started "$started" \
  --exit "$code" --attempts "$n" --summary "$COS_RUN_SUMMARY" "${artifacts[@]+"${artifacts[@]}"}"
rec=$?
rm -f "$COS_RUN_SUMMARY"
echo "=== lane $lane done $(date) exit=$code record=$rec ==="
exit $code
