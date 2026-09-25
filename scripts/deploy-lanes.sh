#!/bin/bash
# Deploys the Chief of Staff lane runtime and points every scheduled lane at the standard wrapper
# (ai-chief-of-staff AC-07, AC-11). Idempotent. Backs up each plist before changing it.
#   scripts/deploy-lanes.sh            deploy runtime + all lanes
#   scripts/deploy-lanes.sh runtime    deploy cos/bin + cos/lib only
#   scripts/deploy-lanes.sh <lane>     deploy runtime + one lane (inbox|deals|yt|tasks)
set -euo pipefail
REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
case "$REPO_DIR" in */.claude/worktrees/*)
  echo "REFUSED: deploy from the main checkout, not a worktree ($REPO_DIR); live jobs would point at a temporary path." >&2; exit 1 ;;
esac
ONLY="${1:-all}"
AS="$HOME/Library/Application Support/assistance"
COS="$AS/cos"
LA="$HOME/Library/LaunchAgents"
LOGS="$HOME/Library/Logs/assistance"
WRAP="$COS/bin/lane-run.sh"
BACKUP="$AS/plist-backups/$(date +%Y%m%d-%H%M%S)"

mkdir -p "$COS/bin" "$COS/lib" "$LOGS" "$AS/ledger"
cp "$REPO_DIR/cos/bin/lane-run.sh" "$REPO_DIR/cos/bin/record-run.mjs" "$COS/bin/"
cp "$REPO_DIR/cos/lib/ledger.mjs" "$COS/lib/"
chmod +x "$COS/bin/lane-run.sh" "$COS/bin/record-run.mjs"
echo "runtime deployed to $COS"
[ "$ONLY" = "runtime" ] && exit 0

# set_lane <lane> <label> <log name> <workdir> [--time HH:MM] -- <program args...>
set_lane() {
  local lane="$1" label="$2" log="$3" wd="$4"; shift 4
  [ "$ONLY" = "all" ] || [ "$ONLY" = "$lane" ] || return 0
  local plist="$LA/$label.plist"
  [ -f "$plist" ] || { echo "WARN: $plist missing; skipped" >&2; return; }
  mkdir -p "$BACKUP"; cp "$plist" "$BACKUP/"
  python3 "$REPO_DIR/scripts/set-launchd-lane.py" "$plist" "$LOGS/$log" "$wd" "$@"
  plutil -lint "$plist" >/dev/null
  launchctl bootout "gui/$(id -u)/$label" 2>/dev/null || true
  launchctl bootstrap "gui/$(id -u)" "$plist"
  echo "lane wired: $label"
}

CODE="$HOME/Code"
set_lane inbox com.assistance.gmail-triage gmail-triage-launchd.log "$AS/triage" -- \
  /bin/bash "$WRAP" inbox --attempts 2 -- /bin/bash "$AS/triage/run-gmail-triage.sh"
set_lane deals com.jermaine.deal-watch deals-launchd.log "$AS" -- \
  /bin/bash "$WRAP" deals --attempts 1 --artifact "$CODE/deal-watch/briefs/brief-{date}.html" -- /bin/zsh "$CODE/deal-watch/run.sh"
set_lane yt com.jermaine.yt-daily-brief yt-launchd.log "$AS" -- \
  /bin/bash "$WRAP" yt --attempts 2 --artifact "$CODE/youtube-knowledge/briefs/{date}.md" -- \
  /bin/zsh -lc 'cd "$HOME/Code" && "$HOME/.local/bin/claude" -p "Follow the instructions in youtube-knowledge/daily-brief.md exactly." --dangerously-skip-permissions'

# task-capture wraps each of its two steps itself (see deploy-task-capture-launchd.sh).
if [ "$ONLY" = "all" ] || [ "$ONLY" = "tasks" ]; then bash "$REPO_DIR/scripts/deploy-task-capture-launchd.sh"; fi
echo "plist backups: $BACKUP"
