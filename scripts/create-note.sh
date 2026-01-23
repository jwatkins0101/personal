#!/bin/bash
# Create a new note in Apple Notes
# Usage: create-note.sh "Title" "Body content" [folder]
# If folder is not specified, uses "Notes" folder
# Returns: "created:{note_id}" on success or "error:{message}" on failure

TITLE="$1"
BODY="$2"
FOLDER="${3:-Notes}"

if [ -z "$TITLE" ]; then
    echo "error:Title is required"
    exit 1
fi

# Escape special characters for AppleScript
# Replace backslashes first, then quotes
ESCAPED_BODY=$(echo "$BODY" | sed 's/\\/\\\\/g' | sed 's/"/\\"/g')
ESCAPED_TITLE=$(echo "$TITLE" | sed 's/\\/\\\\/g' | sed 's/"/\\"/g')

osascript <<APPLESCRIPT
on run
    set noteTitle to "$ESCAPED_TITLE"
    set noteBody to "$ESCAPED_BODY"
    set folderName to "$FOLDER"

    tell application "Notes"
        tell account "iCloud"
            -- Try to find the folder, create if needed
            try
                set targetFolder to folder folderName
            on error
                try
                    make new folder with properties {name:folderName}
                    set targetFolder to folder folderName
                on error errMsg
                    return "error:Could not create folder - " & errMsg
                end try
            end try

            -- Create the note
            try
                set newNote to make new note at targetFolder with properties {name:noteTitle, body:noteBody}
                set noteId to id of newNote
                return "created:" & noteId
            on error errMsg
                return "error:" & errMsg
            end try
        end tell
    end tell
end run
APPLESCRIPT
