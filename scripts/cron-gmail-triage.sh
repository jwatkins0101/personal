#!/bin/bash
# Gmail triage - called by launchd hourly (7am-9pm ET)
# Uses claude CLI for classification + gws CLI for Gmail actions
# Logs output to ~/Library/Logs/assistance/gmail-triage.log

set -euo pipefail

export PATH="/Users/jermainewatkins/.local/bin:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:$PATH"

PROJECT_DIR="/Users/jermainewatkins/Documents/Sites/assistance"
LOG_DIR="$HOME/Library/Logs/assistance"
LOG_FILE="$LOG_DIR/gmail-triage.log"
PROMPT_FILE="$PROJECT_DIR/prompts/gmail-triage.md"

mkdir -p "$LOG_DIR"
cd "$PROJECT_DIR"

echo "" >> "$LOG_FILE"
echo "=== Gmail triage: $(date) ===" >> "$LOG_FILE"

claude \
  --print \
  --permission-mode bypassPermissions \
  --allowedTools "Bash" \
  < "$PROMPT_FILE" \
  >> "$LOG_FILE" 2>&1

echo "=== Done: $(date) ===" >> "$LOG_FILE"
