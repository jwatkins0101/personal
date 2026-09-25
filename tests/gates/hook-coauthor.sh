#!/bin/bash
# gate:hook-coauthor (AC-01). HOOK may be overridden for negative validation.
cd "$(dirname "$0")/../.." || exit 1; . tests/gates/lib.sh
HOOK="${HOOK:-.claude/hooks/block-coauthor.sh}"
tmp="$(mktemp)"; printf 'feat: x\n\nCo-Authored-By: Bot <b@x>\n' > "$tmp"
expect_exit 2 "inline trailer blocked"        "$HOOK" $'git commit -m "feat: x\n\nCo-Authored-By: Claude <noreply@anthropic.com>"'
expect_exit 2 "lowercase trailer blocked"     "$HOOK" 'git commit -m "x" -m "co-authored-by: someone"'
expect_exit 2 "-F message file blocked"       "$HOOK" "git commit -F $tmp"
expect_exit 2 "git -C path commit blocked"    "$HOOK" 'git -C /tmp/repo commit -m "x Co-Authored-By: a"'
expect_exit 0 "clean commit allowed"          "$HOOK" 'git commit -m "feat: clean message"'
expect_exit 0 "non-commit command allowed"    "$HOOK" 'echo Co-Authored-By is discussed in docs'
expect_raw_exit 2 "unparseable input blocked" "$HOOK" 'not json'
grep -q 'block-coauthor.sh' .claude/settings.json && echo "PASS hook registered in .claude/settings.json" || { echo "FAIL hook not registered"; fail=1; }
rm -f "$tmp"; exit $fail
