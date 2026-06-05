#!/bin/bash
# Deploy the task-capture launchd job: runs `npm run tasks` + `npm run sms-triage` twice daily
# (8am & 6pm), pulling email + SMS action items into Google Tasks.
#
# The runner lives outside ~/Documents (in Application Support) so launchd can execute it, but
# it cd's into the project and reads chat.db — both TCC-protected — so the job needs Full Disk
# Access granted to /bin/bash (see docs/USAGE.md). The hourly email triage does NOT need this.
set -euo pipefail

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SUPPORT_DIR="$HOME/Library/Application Support/assistance/task-capture"
RUNNER="$SUPPORT_DIR/run-task-capture.sh"
PLIST="$HOME/Library/LaunchAgents/com.assistance.task-capture.plist"
LABEL="com.assistance.task-capture"

mkdir -p "$SUPPORT_DIR"

cat > "$RUNNER" <<RUNNER_EOF
#!/bin/bash
# Self-contained task-capture runner (deployed by scripts/deploy-task-capture-launchd.sh).
# -uo (not -e): a failure in one capture step must not abort the other.
set -uo pipefail
export PATH="\$HOME/.local/bin:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:\$PATH"

PROJECT="$REPO_DIR"
LOG_DIR="\$HOME/Library/Logs/assistance"
LOG="\$LOG_DIR/task-capture.log"
mkdir -p "\$LOG_DIR"

echo "" >> "\$LOG"
echo "=== task-capture: \$(date) ===" >> "\$LOG"

if ! cd "\$PROJECT" 2>>"\$LOG"; then
  echo "ERROR: cannot cd into \$PROJECT — grant Full Disk Access to /bin/bash (see docs/USAGE.md)." >> "\$LOG"
  exit 1
fi

echo "--- email -> tasks ---" >> "\$LOG"
npm run tasks >> "\$LOG" 2>&1 || echo "(tasks step failed)" >> "\$LOG"

echo "--- sms -> tasks (last 2 days) ---" >> "\$LOG"
# chat.db + Contacts are TCC-protected, and the npm->node->sqlite3 chain can't open them even
# with FDA. But /bin/bash (FDA-granted) CAN, via a direct sqlite3 child. So snapshot both DBs to
# temp with VACUUM INTO (clean single-file copy), then point the triage at the copies via env.
TMPD="\$(mktemp -d /tmp/assistance-sms.XXXXXX)"
MSGDB="\$TMPD/chat.db"
if /usr/bin/sqlite3 -readonly "\$HOME/Library/Messages/chat.db" "VACUUM INTO '\$MSGDB'" 2>>"\$LOG"; then
  CONTACTS=""
  for ab in "\$HOME/Library/Application Support/AddressBook/Sources/"*/AddressBook-v22.abcddb; do
    [ -f "\$ab" ] || continue
    dst="\$TMPD/\$(basename "\$(dirname "\$ab")").abcddb"
    /usr/bin/sqlite3 -readonly "\$ab" "VACUUM INTO '\$dst'" 2>>"\$LOG" && CONTACTS="\${CONTACTS:+\$CONTACTS:}\$dst"
  done
  MESSAGES_DB="\$MSGDB" CONTACTS_DBS="\$CONTACTS" npm run sms-triage -- 2 >> "\$LOG" 2>&1 || echo "(sms-triage step failed)" >> "\$LOG"
else
  echo "(could not snapshot chat.db — is /bin/bash in Full Disk Access? see docs/USAGE.md)" >> "\$LOG"
fi
rm -rf "\$TMPD"

echo "=== done: \$(date) ===" >> "\$LOG"
RUNNER_EOF
chmod +x "$RUNNER"

# Write the LaunchAgent plist (8am & 6pm). WorkingDirectory is a readable non-TCC dir so launchd
# can chdir before the script re-cd's into the project.
cat > "$PLIST" <<PLIST_EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>$LABEL</string>
  <key>ProgramArguments</key>
  <array>
    <string>/bin/bash</string>
    <string>$RUNNER</string>
  </array>
  <key>WorkingDirectory</key><string>$SUPPORT_DIR</string>
  <key>StandardOutPath</key><string>$HOME/Library/Logs/assistance/task-capture-launchd.log</string>
  <key>StandardErrorPath</key><string>$HOME/Library/Logs/assistance/task-capture-launchd.log</string>
  <key>StartCalendarInterval</key>
  <array>
    <dict><key>Hour</key><integer>8</integer><key>Minute</key><integer>0</integer></dict>
    <dict><key>Hour</key><integer>18</integer><key>Minute</key><integer>0</integer></dict>
  </array>
</dict>
</plist>
PLIST_EOF

launchctl bootout "gui/$(id -u)/$LABEL" 2>/dev/null || true
launchctl bootstrap "gui/$(id -u)" "$PLIST"

echo "Deployed runner: $RUNNER"
echo "Loaded launchd job: $LABEL (8:00 and 18:00 daily)"
launchctl print "gui/$(id -u)/$LABEL" 2>/dev/null | grep -E "state =|program =" | head -3 || true
