#!/bin/bash
# Duplicate a template note in Apple Notes
# Usage: duplicate-note.sh "Template Title" "New Title" [folder]
# Creates a copy of the template with a new title (preserves formatting including checklists)
# Returns: "created:{note_id}" or "exists:{note_id}" or "error:{message}"

TEMPLATE_TITLE="$1"
NEW_TITLE="$2"
FOLDER="${3:-Notes}"

if [ -z "$TEMPLATE_TITLE" ] || [ -z "$NEW_TITLE" ]; then
    echo "error:Template title and new title are required"
    exit 1
fi

osascript <<APPLESCRIPT
on run
    set templateTitle to "$TEMPLATE_TITLE"
    set newTitle to "$NEW_TITLE"
    set folderName to "$FOLDER"

    tell application "Notes"
        tell account "iCloud"
            -- Find the folder
            try
                set targetFolder to folder folderName
            on error
                return "error:Folder not found - " & folderName
            end try

            -- Check if note with new title already exists
            try
                set existingNotes to (every note of targetFolder whose name is newTitle)
                if (count of existingNotes) > 0 then
                    set existingNote to item 1 of existingNotes
                    set noteId to id of existingNote
                    return "exists:" & noteId
                end if
            end try

            -- Find the template note
            try
                set templateNotes to (every note of targetFolder whose name is templateTitle)
                if (count of templateNotes) = 0 then
                    return "error:Template not found - " & templateTitle
                end if
                set templateNote to item 1 of templateNotes
            on error errMsg
                return "error:Could not find template - " & errMsg
            end try

            -- Duplicate the template
            try
                set duplicatedNote to duplicate templateNote to targetFolder
                set name of duplicatedNote to newTitle
                set noteId to id of duplicatedNote
                return "created:" & noteId
            on error errMsg
                return "error:Could not duplicate - " & errMsg
            end try
        end tell
    end tell
end run
APPLESCRIPT
