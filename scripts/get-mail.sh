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
with timeout of 120 seconds
    tell application "Mail"
        set output to ""
        set msgCount to 0
        set maxCount to $MAX_COUNT

        -- Iterate through all accounts to get unread from each inbox
        set acctList to every account
        repeat with i from 1 to count of acctList
            if msgCount >= maxCount then exit repeat
            set acct to item i of acctList

            try
                set acctName to name of acct
                -- Find INBOX mailbox (inbox of acct doesn't work reliably)
                set inboxes to mailboxes of acct whose name is "INBOX"
                if (count of inboxes) = 0 then
                    -- Skip accounts without INBOX
                else
                    set acctInbox to item 1 of inboxes
                    set unreadMessages to (every message of acctInbox whose read status is false)

                repeat with msg in unreadMessages
                    if msgCount >= maxCount then exit repeat

                    try
                        set msgId to id of msg as string
                        set msgSubject to subject of msg
                        set msgSender to sender of msg
                        set msgDate to date received of msg as string

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
                end if
            end try
        end repeat

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
