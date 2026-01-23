#!/bin/bash
# Archive an email in Apple Mail (move to Archive mailbox)
# Usage: archive-mail.sh <message_id>
MSG_ID=$1

if [ -z "$MSG_ID" ]; then
    echo "Usage: archive-mail.sh <message_id>"
    exit 1
fi

osascript <<EOF
tell application "Mail"
    set targetMessages to (messages of inbox whose id is $MSG_ID)
    repeat with msg in targetMessages
        set targetAccount to account of mailbox of msg

        -- Try to find Archive mailbox
        try
            set archiveBox to mailbox "Archive" of targetAccount
            move msg to archiveBox
        on error
            -- If no Archive, try All Mail (Gmail) or just mark as read
            try
                set archiveBox to mailbox "[Gmail]/All Mail" of targetAccount
                move msg to archiveBox
            on error
                -- Just mark as read if no archive found
                set read status of msg to true
            end try
        end try
    end repeat
    return "OK"
end tell
EOF
