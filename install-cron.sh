#!/bin/bash

# Gmail Assistant Cron Installer
# This script sets up a cron job to run the email processor every 5 minutes

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
LOG_DIR="$SCRIPT_DIR/logs"
CRON_ENTRY="*/5 * * * * cd $SCRIPT_DIR && npm run process >> $LOG_DIR/cron.log 2>&1"

echo "Gmail Assistant Cron Installer"
echo "=============================="
echo ""
echo "Script directory: $SCRIPT_DIR"
echo ""

# Create logs directory
mkdir -p "$LOG_DIR"
echo "Created logs directory: $LOG_DIR"

# Check if cron job already exists
if crontab -l 2>/dev/null | grep -q "gmail-assistant\|$SCRIPT_DIR.*npm run process"; then
    echo ""
    echo "A cron job for gmail-assistant already exists."
    echo "Current crontab:"
    crontab -l | grep -E "gmail-assistant|$SCRIPT_DIR"
    echo ""
    read -p "Do you want to replace it? (y/n) " -n 1 -r
    echo ""
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        echo "Cancelled."
        exit 0
    fi
    # Remove existing entry
    crontab -l | grep -v -E "gmail-assistant|$SCRIPT_DIR.*npm run process" | crontab -
fi

# Add new cron entry
(crontab -l 2>/dev/null || true; echo "$CRON_ENTRY") | crontab -

echo ""
echo "Cron job installed successfully!"
echo ""
echo "The following entry was added to your crontab:"
echo "  $CRON_ENTRY"
echo ""
echo "The script will run every 5 minutes."
echo "Logs will be written to: $LOG_DIR/cron.log"
echo ""
echo "To view logs: tail -f $LOG_DIR/cron.log"
echo "To remove the cron job: crontab -e (and delete the line)"
echo ""
echo "Make sure you have:"
echo "  1. Run 'npm install' to install dependencies"
echo "  2. Run 'npm run auth' to authenticate with Gmail"
echo "  3. Created a .env file with your credentials"
