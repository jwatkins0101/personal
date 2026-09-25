#!/bin/bash
# PreToolUse(Bash) guard for "hand to agent" jobs (ai-chief-of-staff AC-28).
# The agent reads untrusted email, so it gets READ-ONLY Gmail and text utilities only:
# no sending, no drafts (code creates those), no labels/archive, no network tools, no file writes
# outside $TMPDIR, no interpreters. Allowlist, not denylist. Exit 2 = block. Fails closed.
cmd="$(jq -r '.tool_input.command // empty')" || { echo "BLOCKED: guard could not parse tool input (fail closed)." >&2; exit 2; }
[ -n "$cmd" ] || { echo "BLOCKED: empty command." >&2; exit 2; }
block() { echo "BLOCKED by agent-guard: $1. This agent may only read Gmail (gws gmail users messages|threads get|list, labels list) and use text tools; your result goes back to Jermaine for review." >&2; exit 2; }

# No command substitution, backgrounding, or here-strings that could smuggle other programs.
printf '%s' "$cmd" | grep -Eq '\$\(|`|<\(|>\(|&[^&]|&$' && block "command substitution or background jobs"
# Output redirection only into the temp dir.
while read -r target; do
  [ -z "$target" ] && continue
  case "$target" in /tmp/*|/private/tmp/*|"$TMPDIR"*|/dev/null) ;; *) block "writing to $target" ;; esac
done < <(printf '%s' "$cmd" | grep -Eo '>>?[[:space:]]*[^[:space:]|;&]+' | sed -E 's/^>>?[[:space:]]*//')

# Every segment of a pipeline or command list must start with an allowed program.
ALLOWED='^(gws|jq|base64|printf|echo|date|tr|head|tail|sed|grep|cut|sort|uniq|wc|cat|fold|iconv|true)$'
IFS=$'\n'
for seg in $(printf '%s' "$cmd" | sed -E 's/(\|\||&&|;|\|)/\n/g'); do
  seg="$(printf '%s' "$seg" | sed -E 's/^[[:space:]]+//')"
  [ -z "$seg" ] && continue
  prog="$(printf '%s' "$seg" | awk '{print $1}')"
  prog="${prog##*/}"
  printf '%s' "$prog" | grep -Eq "$ALLOWED" || block "program '$prog' is not allowed"
  if [ "$prog" = "gws" ]; then
    printf '%s' "$seg" | grep -Eq '^([^[:space:]]*/)?gws[[:space:]]+gmail[[:space:]]+users[[:space:]]+((messages|threads)[[:space:]]+(get|list)|labels[[:space:]]+list)([[:space:]]|$)' \
      || block "gws is read-only here (messages/threads get|list, labels list)"
  fi
done
exit 0
