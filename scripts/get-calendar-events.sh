#!/bin/bash
# Get calendar events for today (offset=0) or tomorrow (offset=1)
OFFSET=${1:-0}

osascript <<EOF
tell application "Calendar"
  set today to current date
  set targetDate to today + ($OFFSET * days)
  set time of targetDate to 0
  set endOfDay to targetDate + 1 * days

  set output to ""

  repeat with cal in calendars
    try
      set calEvents to (every event of cal whose start date >= targetDate and start date < endOfDay)
      repeat with evt in calEvents
        set evtTitle to summary of evt
        set evtStart to start date of evt as string
        set evtEnd to end date of evt as string
        set evtAllDay to allday event of evt
        set evtLoc to ""
        try
          set evtLoc to location of evt
          if evtLoc is missing value then
            set evtLoc to ""
          end if
        end try
        set calName to name of cal
        set output to output & evtTitle & "<|>" & evtStart & "<|>" & evtEnd & "<|>" & evtAllDay & "<|>" & evtLoc & "<|>" & calName & "<||>"
      end repeat
    end try
  end repeat

  return output
end tell
EOF
