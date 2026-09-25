#!/bin/bash
# Deploy the Gmail triage launchd job OUT of ~/Documents (which macOS TCC blocks for launchd,
# causing "Operation not permitted" / exit 126). Copies the prompt + a self-contained runner to
# ~/Library/Application Support/assistance/triage (not TCC-protected) and repoints the existing
# LaunchAgent at it, preserving its hourly 7am-9pm schedule.
#
# Re-run this any time prompts/gmail-triage.md changes, to redeploy the latest prompt.
set -euo pipefail

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
case "$REPO_DIR" in */.claude/worktrees/*)
  echo "REFUSED: deploy from the main checkout, not a worktree ($REPO_DIR)." >&2; exit 1 ;;
esac
TRIAGE_DIR="$HOME/Library/Application Support/assistance/triage"
PLIST="$HOME/Library/LaunchAgents/com.assistance.gmail-triage.plist"
RUNNER="$TRIAGE_DIR/run-gmail-triage.sh"
LABEL="com.assistance.gmail-triage"

mkdir -p "$TRIAGE_DIR"

# 1. Deploy the prompt (copy of repo canonical) and the runner script.
cp "$REPO_DIR/prompts/gmail-triage.md" "$TRIAGE_DIR/gmail-triage.md"

# 1b. Deploy the inbox-no-send guard (ai-chief-of-staff AC-04) and the settings file that wires it.
mkdir -p "$TRIAGE_DIR/hooks"
cp "$REPO_DIR/cos/hooks/inbox-no-send.sh" "$TRIAGE_DIR/hooks/inbox-no-send.sh"
chmod +x "$TRIAGE_DIR/hooks/inbox-no-send.sh"
jq -n --arg hook "$TRIAGE_DIR/hooks/inbox-no-send.sh" \
  '{hooks:{PreToolUse:[{matcher:"Bash",hooks:[{type:"command",command:("\"" + $hook + "\"")}]}]}}' \
  > "$TRIAGE_DIR/triage-settings.json"

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

# Render the time window as an epoch (Gmail's newer_than "m" unit means months, not minutes).
SINCE_EPOCH=$(( $(date +%s) - 5400 ))
RENDERED="$TRIAGE_DIR/.gmail-triage.rendered.md"
sed "s/{{SINCE_EPOCH}}/$SINCE_EPOCH/g" "$PROMPT_FILE" > "$RENDERED"
if grep -q '{{SINCE_EPOCH}}' "$RENDERED"; then
  echo "ABORT: SINCE_EPOCH placeholder not rendered" >> "$LOG_FILE"; exit 1
fi
echo "window: after:$SINCE_EPOCH ($(date -r "$SINCE_EPOCH"))" >> "$LOG_FILE"

claude \
  --print \
  --permission-mode bypassPermissions \
  --allowedTools "Bash" \
  --settings "$TRIAGE_DIR/triage-settings.json" \
  < "$RENDERED" \
  >> "$LOG_FILE" 2>&1

echo "=== Done: $(date) ===" >> "$LOG_FILE"
RUNNER_EOF
chmod +x "$RUNNER"

# 2. Point the LaunchAgent at the standard lane wrapper (run record + retries) and reload it.
bash "$REPO_DIR/scripts/deploy-lanes.sh" inbox
echo "Deployed runner: $RUNNER"
