#!/bin/bash
# Get emails from a specific sender across all accounts (INBOX + Sent)
# Usage: get-mail-by-sender.sh <sender_email> [max_count]
SENDER_EMAIL=${1:?"Usage: get-mail-by-sender.sh <sender_email> [max_count]"}
MAX_COUNT=${2:-100}

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
        set maxCount to $MAX_COUNT
        set targetSender to "$SENDER_EMAIL"

        -- Search across all accounts
        set acctList to every account
        repeat with acct in acctList
            if msgCount >= maxCount then exit repeat

            set acctName to name of acct

            -- Search INBOX
            try
                set inboxes to mailboxes of acct whose name is "INBOX"
                if (count of inboxes) > 0 then
                    set acctInbox to item 1 of inboxes
                    set matchedMsgs to (every message of acctInbox whose sender contains targetSender)
                    repeat with msg in matchedMsgs
                        if msgCount >= maxCount then exit repeat
                        try
                            set msgId to id of msg as string
                            set msgSubject to subject of msg
                            set msgSender to sender of msg
                            set msgDate to date received of msg as string

                            set msgSnippet to ""
                            try
                                set msgSnippet to excerpt of msg
                                if msgSnippet is missing value then set msgSnippet to ""
                            end try

                            set msgSnippet to my replaceText(msgSnippet, return, " ")
                            set msgSnippet to my replaceText(msgSnippet, linefeed, " ")
                            set msgSnippet to my replaceText(msgSnippet, tab, " ")
                            set msgSnippet to my replaceText(msgSnippet, "<|>", " ")
                            set msgSnippet to my replaceText(msgSnippet, "<||>", " ")

                            set output to output & msgId & "<|>" & msgSubject & "<|>" & msgSender & "<|>" & msgDate & "<|>" & msgSnippet & "<|>" & acctName & "<|>inbox<||>"
                            set msgCount to msgCount + 1
                        end try
                    end repeat
                end if
            end try

            -- Search Sent mailbox
            try
                set sentBoxes to mailboxes of acct whose name is "Sent" or name is "Sent Messages" or name is "Sent Mail"
                if (count of sentBoxes) > 0 then
                    set sentBox to item 1 of sentBoxes
                    -- For sent, we look at recipients (to) containing the sender email
                    -- But AppleScript 'whose' on recipients is limited, so we iterate recent messages
                    set sentMsgs to messages 1 thru (min(200, count of messages of sentBox)) of sentBox
                    repeat with msg in sentMsgs
                        if msgCount >= maxCount then exit repeat
                        try
                            -- Check if any recipient matches
                            set recipientList to every to recipient of msg
                            set foundMatch to false
                            repeat with recip in recipientList
                                if address of recip contains targetSender then
                                    set foundMatch to true
                                    exit repeat
                                end if
                            end repeat

                            if foundMatch then
                                set msgId to id of msg as string
                                set msgSubject to subject of msg
                                set msgSender to sender of msg
                                set msgDate to date received of msg as string

                                set msgSnippet to ""
                                try
                                    set msgSnippet to excerpt of msg
                                    if msgSnippet is missing value then set msgSnippet to ""
                                end try

                                set msgSnippet to my replaceText(msgSnippet, return, " ")
                                set msgSnippet to my replaceText(msgSnippet, linefeed, " ")
                                set msgSnippet to my replaceText(msgSnippet, tab, " ")
                                set msgSnippet to my replaceText(msgSnippet, "<|>", " ")
                                set msgSnippet to my replaceText(msgSnippet, "<||>", " ")

                                set output to output & msgId & "<|>" & msgSubject & "<|>" & msgSender & "<|>" & msgDate & "<|>" & msgSnippet & "<|>" & acctName & "<|>sent<||>"
                                set msgCount to msgCount + 1
                            end if
                        end try
                    end repeat
                end if
            end try
        end repeat

        return output
    end tell
end timeout

on min(a, b)
    if a < b then return a
    return b
end min
EOF
