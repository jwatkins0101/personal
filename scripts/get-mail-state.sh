#!/bin/bash
# Get the current state of an email in Apple Mail (for undo snapshots)
# Usage: get-mail-state.sh <message_id>
# Returns: mailbox<|>account<|>flagIndex<|>isUnread
MSG_ID=$1

if [ -z "$MSG_ID" ]; then
    echo "Usage: get-mail-state.sh <message_id>"
    exit 1
fi

# Check if Mail is running
if ! pgrep -x "Mail" > /dev/null 2>&1; then
    echo "ERROR: Mail not running"
    exit 1
fi

osascript <<EOF
tell application "Mail"
    try
        -- Search across all mailboxes in all accounts
        repeat with acct in accounts
            try
                -- Check inbox
                set targetMessages to (messages of inbox of acct whose id is $MSG_ID)
                if (count of targetMessages) > 0 then
                    set msg to item 1 of targetMessages
                    set msgMailbox to name of mailbox of msg
                    set msgAccount to name of acct
                    set msgFlagIndex to flag index of msg
                    set msgIsUnread to not (read status of msg)
                    return msgMailbox & "<|>" & msgAccount & "<|>" & msgFlagIndex & "<|>" & msgIsUnread
                end if

                -- Check archive
                try
                    set archiveBox to mailbox "Archive" of acct
                    set targetMessages to (messages of archiveBox whose id is $MSG_ID)
                    if (count of targetMessages) > 0 then
                        set msg to item 1 of targetMessages
                        set msgMailbox to name of mailbox of msg
                        set msgAccount to name of acct
                        set msgFlagIndex to flag index of msg
                        set msgIsUnread to not (read status of msg)
                        return msgMailbox & "<|>" & msgAccount & "<|>" & msgFlagIndex & "<|>" & msgIsUnread
                    end if
                end try

                -- Check Gmail All Mail
                try
                    set allMailBox to mailbox "[Gmail]/All Mail" of acct
                    set targetMessages to (messages of allMailBox whose id is $MSG_ID)
                    if (count of targetMessages) > 0 then
                        set msg to item 1 of targetMessages
                        set msgMailbox to name of mailbox of msg
                        set msgAccount to name of acct
                        set msgFlagIndex to flag index of msg
                        set msgIsUnread to not (read status of msg)
                        return msgMailbox & "<|>" & msgAccount & "<|>" & msgFlagIndex & "<|>" & msgIsUnread
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
