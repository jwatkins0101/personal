#!/bin/bash
# Flag an email with a color in Apple Mail
# Usage: flag-mail.sh <message_id> <color_index>
# Colors: 0=none, 1=orange, 2=red, 3=yellow, 4=blue, 5=purple, 6=green, 7=gray
MSG_ID=$1
COLOR_INDEX=${2:-1}

if [ -z "$MSG_ID" ]; then
    echo "Usage: flag-mail.sh <message_id> [color_index]"
    exit 1
fi

osascript <<EOF
tell application "Mail"
    set targetMessages to (messages of inbox whose id is $MSG_ID)
    repeat with msg in targetMessages
        set flag index of msg to $COLOR_INDEX
    end repeat
    return "OK"
end tell
EOF
