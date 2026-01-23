#!/bin/bash
# Mark an email as unread in Apple Mail
# Usage: mark-mail-unread.sh <message_id>
MSG_ID=$1

if [ -z "$MSG_ID" ]; then
    echo "Usage: mark-mail-unread.sh <message_id>"
    exit 1
fi

osascript <<EOF
tell application "Mail"
    try
        -- Search across all mailboxes
        repeat with acct in accounts
            try
                -- Check inbox
                set targetMessages to (messages of inbox of acct whose id is $MSG_ID)
                if (count of targetMessages) > 0 then
                    repeat with msg in targetMessages
                        set read status of msg to false
                    end repeat
                    return "OK"
                end if

                -- Check archive
                try
                    set archiveBox to mailbox "Archive" of acct
                    set targetMessages to (messages of archiveBox whose id is $MSG_ID)
                    if (count of targetMessages) > 0 then
                        repeat with msg in targetMessages
                            set read status of msg to false
                        end repeat
                        return "OK"
                    end if
                end try
            end try
        end repeat

        return "ERROR: Message not found"
    on error errMsg
        return "ERROR: " & errMsg
    end try
end tell
EOF
