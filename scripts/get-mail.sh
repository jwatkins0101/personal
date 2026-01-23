#!/bin/bash
# Get unread emails from Apple Mail
# Usage: get-mail.sh [max_count]
MAX_COUNT=${1:-20}

# Check if Mail is running, if not return empty
if ! pgrep -x "Mail" > /dev/null 2>&1; then
    echo ""
    exit 0
fi

osascript <<EOF
with timeout of 60 seconds
    tell application "Mail"
        set output to ""
        set msgCount to 0

        try
            -- Get all unread messages directly (faster than iterating accounts)
            set unreadMessages to (every message of inbox whose read status is false)

            -- Limit the messages we process
            if (count of unreadMessages) > $MAX_COUNT then
                set unreadMessages to items 1 thru $MAX_COUNT of unreadMessages
            end if

            repeat with msg in unreadMessages
                try
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

                    -- Use excerpt instead of content (much faster)
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

                    set output to output & msgId & "<|>" & msgSubject & "<|>" & msgSender & "<|>" & msgDate & "<|>" & msgSnippet & "<|>" & acctName & "<||>"
                    set msgCount to msgCount + 1
                end try
            end repeat
        end try

        return output
    end tell
end timeout

on replaceText(theText, searchString, replacementString)
    set AppleScript's text item delimiters to searchString
    set theItems to text items of theText
    set AppleScript's text item delimiters to replacementString
    set theText to theItems as text
    set AppleScript's text item delimiters to ""
    return theText
end replaceText
EOF
