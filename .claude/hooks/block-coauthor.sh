#!/bin/bash
# PreToolUse(Bash) hook (ai-chief-of-staff AC-01): no Co-Authored-By trailers in this repo's history.
# Checks inline messages and -F/--file message files. Exit 2 = block.
cmd="$(jq -r '.tool_input.command // empty')" || { echo "BLOCKED: hook could not parse tool input (fail closed)." >&2; exit 2; }
printf '%s' "$cmd" | grep -Eq 'git([[:space:]]+-C[[:space:]]+[^[:space:]]+)?[[:space:]]+(commit|merge|tag)' || exit 0
body="$cmd"
file="$(printf '%s' "$cmd" | sed -nE 's/.*(-F|--file)[= ]+"?([^" ]+)"?.*/\2/p')"
[ -n "$file" ] && [ -f "$file" ] && body="$body
$(cat "$file")"
if printf '%s' "$body" | grep -iq 'co-authored-by'; then
  echo "BLOCKED by block-coauthor: this repo never carries Co-Authored-By trailers. Remove the trailer and commit again." >&2
  exit 2
fi
exit 0
