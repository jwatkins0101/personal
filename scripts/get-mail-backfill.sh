#!/bin/bash
# Get recent emails from Apple Mail for backfill (read and unread)
# Usage: get-mail-backfill.sh [max_count] [mailbox]
# mailbox can be: inbox, sent, all (default: all)
MAX_COUNT=${1:-500}
MAILBOX=${2:-all}

# Check if Mail is running, if not return empty
if ! pgrep -x "Mail" > /dev/null 2>&1; then
    echo ""
    exit 0
fi

osascript <<EOF
with timeout of 300 seconds
    tell application "Mail"
        set output to ""
        set msgCount to 0
        set processedIds to {}

        on isInList(theItem, theList)
            repeat with listItem in theList
                if listItem as string is equal to theItem as string then
                    return true
                end if
            end repeat
            return false
        end isInList

        try
            set allMessages to {}

            -- Collect messages based on mailbox parameter
            if "$MAILBOX" is "inbox" or "$MAILBOX" is "all" then
                set inboxMessages to (every message of inbox)
                if (count of inboxMessages) > $MAX_COUNT then
                    set inboxMessages to items 1 thru $MAX_COUNT of inboxMessages
                end if
                set allMessages to allMessages & inboxMessages
            end if

            if "$MAILBOX" is "sent" or "$MAILBOX" is "all" then
                repeat with acct in every account
                    try
                        set sentBox to sent mailbox of acct
                        set sentMessages to (every message of sentBox)
                        if (count of sentMessages) > ($MAX_COUNT / 2) then
                            set sentMessages to items 1 thru ($MAX_COUNT / 2) of sentMessages
                        end if
                        set allMessages to allMessages & sentMessages
                    end try
                end repeat
            end if

            -- Process messages
            repeat with msg in allMessages
                if msgCount >= $MAX_COUNT then exit repeat

                try
                    set msgId to id of msg as string

                    -- Skip if already processed
                    set alreadyProcessed to false
                    repeat with pid in processedIds
                        if pid as string is equal to msgId then
                            set alreadyProcessed to true
                            exit repeat
                        end if
                    end repeat
                    if alreadyProcessed then
                        -- skip this message
                    else
                        set end of processedIds to msgId

                        set msgSubject to subject of msg
                        set msgSender to sender of msg
                        set msgDate to date received of msg as string
                        set msgRead to read status of msg

                        -- Get account name
                        set acctName to ""
                        try
                            set msgMailbox to mailbox of msg
                            set msgAccount to account of msgMailbox
                            set acctName to name of msgAccount
                        end try

                        -- Get mailbox type
                        set mboxType to "inbox"
                        try
                            set mboxName to name of mailbox of msg
                            if mboxName contains "Sent" then
                                set mboxType to "sent"
                            end if
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

                        set output to output & msgId & "<|>" & msgSubject & "<|>" & msgSender & "<|>" & msgDate & "<|>" & msgSnippet & "<|>" & acctName & "<|>" & mboxType & "<||>"
                        set msgCount to msgCount + 1
                    end if
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
