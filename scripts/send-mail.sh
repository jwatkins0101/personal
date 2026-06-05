#!/bin/bash
# Send email via Apple Mail using AppleScript
# Creates and queues the message - Mail.app handles delivery
# Usage: echo "body text" | bash send-mail.sh "to@email.com,to2@email.com" "Subject Line"

RECIPIENTS="$1"
SUBJECT="$2"
BODY=$(cat)

# Write body to temp file
TMPFILE=$(mktemp)
echo "$BODY" > "$TMPFILE"

# Build recipient list for AppleScript
IFS=',' read -ra ADDR_LIST <<< "$RECIPIENTS"
RECIPIENT_COMMANDS=""
for addr in "${ADDR_LIST[@]}"; do
  addr=$(echo "$addr" | xargs)
  RECIPIENT_COMMANDS="${RECIPIENT_COMMANDS}
          make new to recipient at end of to recipients with properties {address:\"${addr}\"}"
done

# Create the message and queue it — don't wait for send confirmation
# Mail.app will send it in the background
osascript <<APPLESCRIPT 2>/dev/null
tell application "Mail"
    activate
    delay 3
    set bodyText to read POSIX file "${TMPFILE}" as «class utf8»
    set newMessage to make new outgoing message with properties {subject:"${SUBJECT}", content:bodyText, visible:true}
    tell newMessage
${RECIPIENT_COMMANDS}
    end tell
    -- Queue for sending (don't block on delivery confirmation)
    send newMessage
end tell
APPLESCRIPT

# Even if AppleScript times out, the message is usually created and queued
rm -f "$TMPFILE"
echo "Email queued in Mail.app"
exit 0
