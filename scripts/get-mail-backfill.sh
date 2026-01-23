#!/bin/bash
# Get recent emails from Apple Mail for backfill (read and unread)
# Usage: get-mail-backfill.sh [max_count] [mailbox]
# mailbox can be: inbox, sent, all (default: inbox)
MAX_COUNT=${1:-100}
MAILBOX=${2:-inbox}

# Check if Mail is running, if not return empty
if ! pgrep -x "Mail" > /dev/null 2>&1; then
    echo ""
    exit 0
fi

osascript <<EOF
on replaceText(theText, searchString, replacementString)
    set AppleScript's text item delimiters to searchString
    set theItems to text items of theText
    set AppleScript's text item delimiters to replacementString
    set theText to theItems as text
    set AppleScript's text item delimiters to ""
    return theText
end replaceText

with timeout of 300 seconds
    tell application "Mail"
        set output to ""
        set msgCount to 0

        try
            -- Get messages from inbox only (most efficient)
            set inboxRef to inbox
            set totalMsgs to count of messages of inboxRef

            -- Calculate how many to fetch (most recent first)
            set fetchCount to $MAX_COUNT
            if fetchCount > totalMsgs then set fetchCount to totalMsgs
            if fetchCount < 1 then set fetchCount to 1

            -- Fetch messages by index (faster than getting all then slicing)
            repeat with i from 1 to fetchCount
                try
                    set msg to message i of inboxRef

                    set msgId to id of msg as string
                    set msgSubject to subject of msg
                    set msgSender to sender of msg
                    set msgDate to date received of msg as string

                    -- Get account name
                    set acctName to ""
                    try
                        set msgMailbox to mailbox of msg
                        set msgAccount to account of msgMailbox
                        set acctName to name of msgAccount
                    end try

                    -- Use excerpt (much faster than content)
                    set msgSnippet to ""
                    try
                        set msgSnippet to excerpt of msg
                        if msgSnippet is missing value then set msgSnippet to ""
                    end try

                    -- Clean snippet
                    set msgSnippet to my replaceText(msgSnippet, return, " ")
                    set msgSnippet to my replaceText(msgSnippet, linefeed, " ")
                    set msgSnippet to my replaceText(msgSnippet, tab, " ")
                    set msgSnippet to my replaceText(msgSnippet, "<|>", " ")
                    set msgSnippet to my replaceText(msgSnippet, "<||>", " ")

                    set output to output & msgId & "<|>" & msgSubject & "<|>" & msgSender & "<|>" & msgDate & "<|>" & msgSnippet & "<|>" & acctName & "<|>inbox<||>"
                    set msgCount to msgCount + 1
                end try
            end repeat
        end try

        return output
    end tell
end timeout
EOF
