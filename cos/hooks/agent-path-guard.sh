#!/bin/bash
# PreToolUse(Read|Grep|Glob) guard for "hand to agent" jobs. The agent may only look inside known
# project and assistance folders. A search rooted at $HOME, /, or ~/Library walks other apps' private
# data and makes macOS ask Jermaine to let "node" access data from other apps. Allowlist; fails closed.
input="$(cat)"
tool="$(printf '%s' "$input" | jq -r '.tool_name // empty')" || { echo "BLOCKED: path guard could not parse tool input (fail closed)." >&2; exit 2; }
cwd="$(printf '%s' "$input" | jq -r '.cwd // empty')"
p="$(printf '%s' "$input" | jq -r '.tool_input.file_path // .tool_input.path // empty')"
block() { echo "BLOCKED by agent-path-guard: $1. Search only inside a project folder (see the PROJECTS section of your task: read the project card for its path). Never search your home folder or ~/Library." >&2; exit 2; }

H="${GUARD_HOME:-$HOME}"
[ -z "$p" ] && p="$cwd"
[ -z "$p" ] && block "no path given"
case "$p" in "~") p="$H" ;; "~/"*) p="$H/${p#\~/}" ;; /*) ;; *) [ -n "$cwd" ] || block "relative path without a working folder"; p="$cwd/$p" ;; esac
p="${p%/}"; [ -z "$p" ] && p="/"
case "/$p/" in */../*|*/./*) block "path with . or .. segments ($p)" ;; esac

case "$p/" in
  "$H/Code/assistance/credentials/"*) block "credentials folder" ;;
  "$H/Documents/Sites/"*|"$H/Documents/Documents - Jermaine’s MacBook Pro/Sites/"*) ;;
  "$H/Code/"*|"$H/Library/Application Support/assistance/"*|"$H/.claude/projects/"*) ;;
  /tmp/*|/private/tmp/*) ;;
  *) if [ -n "$TMPDIR" ] && [ "${p#"${TMPDIR%/}"}" != "$p" ]; then :; else block "$tool outside the allowed folders ($p)"; fi ;;
esac
# The project roots themselves are fine to read, but a recursive search from them is too broad
# (and from the assistance repo root it would read credentials/).
if [ "$tool" = "Glob" ] || [ "$tool" = "Grep" ]; then
  case "$p" in "$H/Documents/Sites"|"$H/Documents/Documents - Jermaine’s MacBook Pro/Sites"|"$H/Code"|"$H/Code/assistance") block "$tool across every project; pick the one project folder" ;; esac
fi
exit 0
