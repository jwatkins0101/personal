#!/bin/bash
# Runs a command with read-only snapshots of chat.db and the AddressBook databases (same method as
# task-capture): node can't open those TCC-protected files, but /usr/bin/sqlite3 (Full Disk Access) can.
#   with-sms-snapshot.sh <command> [args...]    -> exports MESSAGES_DB and CONTACTS_DBS for the command
set -uo pipefail
TMPD="$(mktemp -d /tmp/cos-sms.XXXXXX)"
trap 'rm -rf "$TMPD"' EXIT
if /usr/bin/sqlite3 -readonly "$HOME/Library/Messages/chat.db" "VACUUM INTO '$TMPD/chat.db'" 2>/dev/null; then
  export MESSAGES_DB="$TMPD/chat.db"
  CONTACTS=""
  for ab in "$HOME/Library/Application Support/AddressBook/Sources/"*/AddressBook-v22.abcddb; do
    [ -f "$ab" ] || continue
    dst="$TMPD/$(basename "$(dirname "$ab")").abcddb"
    /usr/bin/sqlite3 -readonly "$ab" "VACUUM INTO '$dst'" 2>/dev/null && CONTACTS="${CONTACTS:+$CONTACTS:}$dst"
  done
  export CONTACTS_DBS="$CONTACTS"
else
  echo "with-sms-snapshot: could not snapshot chat.db; SMS will show as a gap" >&2
fi
"$@"
