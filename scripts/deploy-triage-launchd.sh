#!/bin/bash
# Deploy the Gmail triage launchd job OUT of ~/Documents (which macOS TCC blocks for launchd,
# causing "Operation not permitted" / exit 126). Copies the prompt + a self-contained runner to
# ~/Library/Application Support/assistance/triage (not TCC-protected) and repoints the existing
# LaunchAgent at it, preserving its hourly 7am-9pm schedule.
#
# Re-run this any time prompts/gmail-triage.md changes, to redeploy the latest prompt.
set -euo pipefail

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TRIAGE_DIR="$HOME/Library/Application Support/assistance/triage"
PLIST="$HOME/Library/LaunchAgents/com.assistance.gmail-triage.plist"
RUNNER="$TRIAGE_DIR/run-gmail-triage.sh"
LABEL="com.assistance.gmail-triage"

mkdir -p "$TRIAGE_DIR"

# 1. Deploy the prompt (copy of repo canonical) and the runner script.
cp "$REPO_DIR/prompts/gmail-triage.md" "$TRIAGE_DIR/gmail-triage.md"

cat > "$RUNNER" <<'RUNNER_EOF'
#!/bin/bash
# Self-contained Gmail triage runner (lives outside ~/Documents so launchd/TCC can run it).
# Deployed by scripts/deploy-triage-launchd.sh — edit the repo copy, not this one.
set -euo pipefail
export PATH="$HOME/.local/bin:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:$PATH"

TRIAGE_DIR="$HOME/Library/Application Support/assistance/triage"
LOG_DIR="$HOME/Library/Logs/assistance"
LOG_FILE="$LOG_DIR/gmail-triage.log"
PROMPT_FILE="$TRIAGE_DIR/gmail-triage.md"

mkdir -p "$LOG_DIR"
cd "$TRIAGE_DIR"

echo "" >> "$LOG_FILE"
echo "=== Gmail triage: $(date) ===" >> "$LOG_FILE"

claude \
  --print \
  --permission-mode bypassPermissions \
  --allowedTools "Bash" \
  < "$PROMPT_FILE" \
  >> "$LOG_FILE" 2>&1

echo "=== Done: $(date) ===" >> "$LOG_FILE"
RUNNER_EOF
chmod +x "$RUNNER"

# 2. Repoint the existing LaunchAgent at the relocated runner (preserve schedule), and pin a
#    readable WorkingDirectory so launchd doesn't emit getcwd "Operation not permitted" warnings.
if [ -f "$PLIST" ]; then
  /usr/libexec/PlistBuddy -c "Set :ProgramArguments:1 $RUNNER" "$PLIST"
  /usr/libexec/PlistBuddy -c "Set :WorkingDirectory $TRIAGE_DIR" "$PLIST" 2>/dev/null \
    || /usr/libexec/PlistBuddy -c "Add :WorkingDirectory string $TRIAGE_DIR" "$PLIST"
else
  echo "WARNING: $PLIST not found — schedule plist missing; nothing repointed." >&2
fi

# 3. Reload the job.
launchctl bootout "gui/$(id -u)/$LABEL" 2>/dev/null || true
launchctl bootstrap "gui/$(id -u)" "$PLIST"

echo "Deployed runner: $RUNNER"
echo "Reloaded launchd job: $LABEL"
launchctl print "gui/$(id -u)/$LABEL" 2>/dev/null | grep -E "state =|program =" | head -3 || true
