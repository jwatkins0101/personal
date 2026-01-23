#!/bin/bash
# Append text to an existing note in Apple Notes
# Usage: append-to-note.sh "Note Title" "Text to append" [folder]
# Adds text to the end of the note without destroying existing formatting
# Returns: "appended:{note_id}" or "error:{message}"

NOTE_TITLE="$1"
TEXT_TO_APPEND="$2"
FOLDER="${3:-Notes}"

if [ -z "$NOTE_TITLE" ] || [ -z "$TEXT_TO_APPEND" ]; then
    echo "error:Note title and text are required"
    exit 1
fi

osascript <<APPLESCRIPT
on run
    set noteTitle to "$NOTE_TITLE"
    set textToAppend to "$TEXT_TO_APPEND"
    set folderName to "$FOLDER"

    tell application "Notes"
        tell account "iCloud"
            -- Find the folder
            try
                set targetFolder to folder folderName
            on error
                return "error:Folder not found - " & folderName
            end try

            -- Find the note
            try
                set targetNotes to (every note of targetFolder whose name is noteTitle)
                if (count of targetNotes) = 0 then
                    return "error:Note not found - " & noteTitle
                end if
                set targetNote to item 1 of targetNotes
            on error errMsg
                return "error:Could not find note - " & errMsg
            end try

            -- Append to the note body
            try
                set currentBody to body of targetNote
                -- Add a line break and the new text
                set newBody to currentBody & "<br><br>" & textToAppend
                set body of targetNote to newBody
                set noteId to id of targetNote
                return "appended:" & noteId
            on error errMsg
                return "error:Could not append - " & errMsg
            end try
        end tell
    end tell
end run
APPLESCRIPT
