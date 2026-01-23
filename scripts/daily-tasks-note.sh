#!/bin/bash
# Daily Tasks Note Generator
# Pulls from Calendar and Outlook to create/update a Tasks for Today note

osascript <<'APPLESCRIPT'
-- Get today's date info
set today to current date
set dateString to (weekday of today as string) & ", " & (month of today as string) & " " & (day of today as string) & ", " & (year of today as string)
set hours of today to 0
set minutes of today to 0
set seconds of today to 0
set tomorrow to today + (1 * days)

-- Get calendar events
set calendarSection to ""
tell application "Calendar"
    repeat with cal in calendars
        try
            set evts to (every event of cal whose start date ≥ today and start date < tomorrow)
            repeat with evt in evts
                set evtName to summary of evt
                set evtStart to start date of evt
                set timeStr to time string of evtStart
                set calendarSection to calendarSection & "☐ " & timeStr & " - " & evtName & "
"
            end repeat
        end try
    end repeat
end tell

if calendarSection is "" then
    set calendarSection to "No events scheduled
"
end if

-- Get actionable emails from Outlook
set emailSection to ""
set studentEmails to ""
set adminEmails to ""

tell application "Microsoft Outlook"
    try
        set myInbox to mail folder "Inbox" of default account
        set unreadMsgs to (every message of myInbox whose is read is false)
        set maxCheck to 30
        if (count of unreadMsgs) < maxCheck then set maxCheck to count of unreadMsgs

        repeat with i from 1 to maxCheck
            set msg to item i of unreadMsgs
            set subj to subject of msg
            try
                set senderAddr to address of sender of msg
            on error
                set senderAddr to "unknown"
            end try

            -- Categorize emails
            if senderAddr contains "louisville.edu" then
                if subj contains "CIS" or senderAddr contains "blackboard" then
                    if studentEmails does not contain subj then
                        set studentEmails to studentEmails & "☐ " & subj & "
"
                    end if
                else if senderAddr contains "register" or senderAddr contains "ocm" or subj contains "deadline" or subj contains "attendance" then
                    set adminEmails to adminEmails & "☐ " & subj & "
"
                end if
            end if
        end repeat
    end try
end tell

if studentEmails is "" then set studentEmails to "No student emails requiring action
"
if adminEmails is "" then set adminEmails to "No administrative emails
"

-- Build the note content
set noteTitle to "Tasks for Today - " & dateString
set noteBody to "📋 TASKS FOR TODAY
" & dateString & "
Updated: " & (current date as string) & "

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

📅 CALENDAR
" & calendarSection & "
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

📧 EMAIL ACTIONS NEEDED

Students:
" & studentEmails & "
Administrative:
" & adminEmails & "
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

📌 NOTES
• Add your notes here

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
"

-- Check if note already exists for today, update or create
tell application "Notes"
    tell account "iCloud"
        set existingNotes to (every note of folder "Notes" whose name contains "Tasks for Today - " & dateString)
        if (count of existingNotes) > 0 then
            -- Update existing note
            set body of item 1 of existingNotes to noteBody
            return "Updated: " & noteTitle
        else
            -- Create new note
            make new note at folder "Notes" with properties {name:noteTitle, body:noteBody}
            return "Created: " & noteTitle
        end if
    end tell
end tell
APPLESCRIPT
