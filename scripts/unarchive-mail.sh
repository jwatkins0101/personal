#!/bin/bash
# Move an email back to inbox from archive in Apple Mail
# Usage: unarchive-mail.sh <message_id> <account_name>
MSG_ID=$1
ACCOUNT_NAME=$2

if [ -z "$MSG_ID" ] || [ -z "$ACCOUNT_NAME" ]; then
    echo "Usage: unarchive-mail.sh <message_id> <account_name>"
    exit 1
fi

osascript <<EOF
tell application "Mail"
    try
        set targetAccount to account "$ACCOUNT_NAME"
        set targetInbox to inbox of targetAccount

        -- Try Archive mailbox first
        try
            set archiveBox to mailbox "Archive" of targetAccount
            set targetMessages to (messages of archiveBox whose id is $MSG_ID)
            if (count of targetMessages) > 0 then
                repeat with msg in targetMessages
                    move msg to targetInbox
                end repeat
                return "OK"
            end if
        end try

        -- Try Gmail All Mail
        try
            set allMailBox to mailbox "[Gmail]/All Mail" of targetAccount
            set targetMessages to (messages of allMailBox whose id is $MSG_ID)
            if (count of targetMessages) > 0 then
                repeat with msg in targetMessages
                    move msg to targetInbox
                end repeat
                return "OK"
            end if
        end try

        return "ERROR: Message not found in archive"
    on error errMsg
        return "ERROR: " & errMsg
    end try
end tell
EOF
