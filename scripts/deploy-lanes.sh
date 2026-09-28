#!/bin/bash
# Deploys the Chief of Staff lane runtime and points every scheduled lane at the standard wrapper
# (ai-chief-of-staff AC-07, AC-11). Idempotent. Backs up each plist before changing it.
#   scripts/deploy-lanes.sh            deploy runtime + all lanes
#   scripts/deploy-lanes.sh runtime    deploy cos/bin + cos/lib only
#   scripts/deploy-lanes.sh <lane>     deploy runtime + one lane (inbox|deals|yt|tasks|cos-morning|cos-eod|cos-weekly|cos-board|triage-owlthat|triage-techunify)
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
cp "$REPO_DIR/cos/bin/lane-run.sh" "$REPO_DIR/cos/bin/record-run.mjs" "$REPO_DIR/cos/bin/with-sms-snapshot.sh" "$COS/bin/"
cp "$REPO_DIR/cos/lib/ledger.mjs" "$COS/lib/"
chmod +x "$COS/bin/lane-run.sh" "$COS/bin/record-run.mjs" "$COS/bin/with-sms-snapshot.sh"
echo "runtime deployed to $COS"
[ "$ONLY" = "runtime" ] && exit 0

# set_lane <lane> <label> <log name> <workdir> [--time HH:MM] -- <program args...>
set_lane() {
  local lane="$1" label="$2" log="$3" wd="$4"; shift 4
  [ "$ONLY" = "all" ] || [ "$ONLY" = "$lane" ] || return 0
  local plist="$LA/$label.plist"
  if [ -f "$plist" ]; then mkdir -p "$BACKUP"; cp "$plist" "$BACKUP/"
  elif [ "${CREATE:-0}" != "1" ]; then echo "WARN: $plist missing; skipped" >&2; return; fi
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
# yt fans out background video processors; print mode kills them after 10 min by default (failed 2026-09-26),
# so wait up to 45 min. ulimit: claude hit the 256 open-file cap on Sep 17-24.
# caffeinate: the 07:03 launch fires on a DarkWake and the Mac dropped back to Maintenance Sleep 7s later,
# so both attempts died with "API Error: Your computer went to sleep mid-response" (failed 2026-09-27).
set_lane yt com.jermaine.yt-daily-brief yt-launchd.log "$AS" -- \
  /bin/bash "$WRAP" yt --attempts 2 --artifact "$CODE/youtube-knowledge/briefs/{date}.md" -- \
  /usr/bin/caffeinate -ims /bin/zsh -lc 'ulimit -n 65536 2>/dev/null; export CLAUDE_CODE_PRINT_BG_WAIT_CEILING_MS=2700000; cd "$HOME/Code" && "$HOME/.local/bin/claude" -p "Follow the instructions in youtube-knowledge/daily-brief.md exactly." --dangerously-skip-permissions'

# Chief of Staff morning brief: 07:30 Mon-Fri (AC-17). Weekday 1-5 = Mon-Fri in launchd.
CREATE=1 set_lane cos-morning com.assistance.cos-morning cos-morning-launchd.log "$AS" --time 07:30 --weekdays 1-5 -- \
  /bin/bash "$WRAP" cos-morning --attempts 2 --artifact "$AS/briefs/{date}.html" -- \
  /bin/bash -c 'cd "$HOME/Code/assistance" && npm run -s cos -- morning'

# End-of-day wrap: 17:30 Mon-Fri (AC-21), with SMS snapshots for commitments.
CREATE=1 set_lane cos-eod com.assistance.cos-eod cos-eod-launchd.log "$AS" --time 17:30 --weekdays 1-5 -- \
  /bin/bash "$WRAP" cos-eod --attempts 2 --artifact "$AS/eod/{date}.json" -- \
  /bin/bash "$COS/bin/with-sms-snapshot.sh" /bin/bash -c 'cd "$HOME/Code/assistance" && COS_EOD_PING=1 npm run -s cos -- eod'

# Weekly review: Friday 15:00 (AC-22).
CREATE=1 set_lane cos-weekly com.assistance.cos-weekly cos-weekly-launchd.log "$AS" --time 15:00 --weekdays 5-5 -- \
  /bin/bash "$WRAP" cos-weekly --attempts 2 -- /bin/bash -c 'cd "$HOME/Code/assistance" && npm run -s cos -- weekly'

# Live task board on http://127.0.0.1:8787 (D16): always on, restarted by launchd if it exits.
CREATE=1 set_lane cos-board com.assistance.cos-board cos-board.log "$AS" --keepalive -- \
  /bin/bash -c 'export PATH="$HOME/.local/bin:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin"; cd "$HOME/Code/assistance" && exec node_modules/.bin/tsx src/cos/cli.ts board'

# Rules triage for owlthat and techunify: hourly at :05, 7am-9pm (D24).
for acct in owlthat techunify; do
  CREATE=1 set_lane triage-$acct com.assistance.triage-$acct triage-$acct-launchd.log "$AS" --hours 7-21 -- \
    /bin/bash "$WRAP" triage-$acct --attempts 2 -- /bin/bash -c "cd \"\$HOME/Code/assistance\" && npm run -s cos -- triage $acct"
done

# task-capture wraps each of its two steps itself (see deploy-task-capture-launchd.sh).
if [ "$ONLY" = "all" ] || [ "$ONLY" = "tasks" ]; then bash "$REPO_DIR/scripts/deploy-task-capture-launchd.sh"; fi
echo "plist backups: $BACKUP"
