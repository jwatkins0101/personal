#!/bin/bash
# Update a marked section in an Apple Notes note
# Usage: update-note-section.sh "Note Title" "SECTION_NAME" "New content" [folder]
# Finds <!-- SECTION_NAME_START --> and <!-- SECTION_NAME_END --> markers
# Replaces content between them while preserving everything else (including checklists)
# Returns: "updated:{note_id}" or "error:{message}"

NOTE_TITLE="$1"
SECTION_NAME="$2"
NEW_CONTENT="$3"
FOLDER="${4:-Notes}"

if [ -z "$NOTE_TITLE" ] || [ -z "$SECTION_NAME" ] || [ -z "$NEW_CONTENT" ]; then
    echo "error:Note title, section name, and content are required"
    exit 1
fi

START_MARKER="<!-- ${SECTION_NAME}_START -->"
END_MARKER="<!-- ${SECTION_NAME}_END -->"

osascript <<APPLESCRIPT
on run
    set noteTitle to "$NOTE_TITLE"
    set startMarker to "$START_MARKER"
    set endMarker to "$END_MARKER"
    set newContent to "$NEW_CONTENT"
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

            -- Get current body and update the section
            try
                set currentBody to body of targetNote

                -- Find start marker position
                set startOffset to offset of startMarker in currentBody
                if startOffset = 0 then
                    return "error:Start marker not found - " & startMarker
                end if

                -- Find end marker position
                set endOffset to offset of endMarker in currentBody
                if endOffset = 0 then
                    return "error:End marker not found - " & endMarker
                end if

                -- Build new body: before start marker + start marker + new content + end marker + after end marker
                set beforeSection to text 1 thru (startOffset + (length of startMarker) - 1) of currentBody
                set afterSection to text endOffset thru -1 of currentBody

                set newBody to beforeSection & newContent & afterSection

                set body of targetNote to newBody
                set noteId to id of targetNote
                return "updated:" & noteId
            on error errMsg
                return "error:Could not update section - " & errMsg
            end try
        end tell
    end tell
end run
APPLESCRIPT
