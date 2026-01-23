#!/bin/bash
# Update an existing note or create if not found
# Usage: update-note.sh "Title" "Body content" [folder]
# Finds note by title in folder, updates body, or creates if not found
# Returns: "updated:{note_id}" or "created:{note_id}" or "error:{message}"

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

            -- Try to find existing note with this title
            try
                set existingNotes to (every note of targetFolder whose name is noteTitle)
                if (count of existingNotes) > 0 then
                    -- Update existing note
                    set targetNote to item 1 of existingNotes
                    set body of targetNote to noteBody
                    set noteId to id of targetNote
                    return "updated:" & noteId
                end if
            end try

            -- Note not found, create new
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
