#!/bin/bash
# Daily flight price check - called by crontab
# Logs output to ~/Library/Logs/assistance/flights.log

set -euo pipefail

export PATH="/opt/homebrew/bin:$PATH"

PROJECT_DIR="/Users/jermainewatkins/Documents/Sites/assistance"
LOG_DIR="$HOME/Library/Logs/assistance"
LOG_FILE="$LOG_DIR/flights.log"

mkdir -p "$LOG_DIR"

cd "$PROJECT_DIR"

# Source .env if it exists
if [ -f .env ]; then
  set -a
  source .env
  set +a
fi

echo "" >> "$LOG_FILE"
echo "=== Flight check: $(date) ===" >> "$LOG_FILE"

# Run the flight tracker
node_modules/.bin/tsx src/commands/flight-tracker.ts check >> "$LOG_FILE" 2>&1

echo "=== Done: $(date) ===" >> "$LOG_FILE"
