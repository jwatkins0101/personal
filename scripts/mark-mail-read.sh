#!/bin/bash
# Mark an email as read in Apple Mail
# Usage: mark-mail-read.sh <message_id>
MSG_ID=$1

if [ -z "$MSG_ID" ]; then
    echo "Usage: mark-mail-read.sh <message_id>"
    exit 1
fi

osascript <<EOF
tell application "Mail"
    set targetMessages to (messages of inbox whose id is $MSG_ID)
    repeat with msg in targetMessages
        set read status of msg to true
    end repeat
    return "OK"
end tell
EOF
