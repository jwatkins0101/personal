#!/bin/bash
# PreToolUse(Bash) hook for the Gmail triage context (ai-chief-of-staff AC-04).
# The triage agent reads untrusted mail, so it must never be able to send mail.
# Drafts, labels and archiving stay allowed. Exit 2 = block (stderr goes back to the model).
cmd="$(jq -r '.tool_input.command // empty')" || { echo "BLOCKED: hook could not parse tool input (fail closed)." >&2; exit 2; }
if printf '%s' "$cmd" | grep -Eiq \
  -e 'gws[[:space:]]+gmail[[:space:]]+users[[:space:]]+(messages|drafts)[[:space:]]+send' \
  -e 'users\.(messages|drafts)\.send' \
  -e 'gmail\.googleapis\.com[^[:space:]]*/(messages|drafts)/send' \
  -e 'send-mail\.sh' \
  -e 'osascript.*(Mail|Messages).*send'; then
  echo "BLOCKED by inbox-no-send: the triage context may draft, label and archive, but never send. Leave a draft for the principal to approve." >&2
  exit 2
fi
exit 0
