#!/bin/bash
# gate:gmail-query-lint (AC-02). Gmail's newer_than/older_than "m" unit means MONTHS.
# LINT_EXTRA may add paths (negative validation uses a fixture with a violation).
cd "$(dirname "$0")/../.." || exit 1; fail=0
DEPLOYED="$HOME/Library/Application Support/assistance/triage/gmail-triage.md"
paths=(prompts src scripts cos)
[ -f "$DEPLOYED" ] && paths+=("$DEPLOYED")
[ -n "${LINT_EXTRA:-}" ] && paths+=("$LINT_EXTRA")
hits="$(grep -rEn '(newer|older)_than:[0-9]+m\b' "${paths[@]}" 2>/dev/null)"
if [ -n "$hits" ]; then echo "FAIL minute-looking Gmail windows (m = months):"; echo "$hits"; fail=1; else echo "PASS no newer_than/older_than with m unit"; fi
grep -q 'after:{{SINCE_EPOCH}}' prompts/gmail-triage.md && echo "PASS triage prompt uses after:{{SINCE_EPOCH}}" || { echo "FAIL triage prompt lacks epoch window"; fail=1; }
grep -q 'SINCE_EPOCH=\$(( \$(date +%s) - 5400 ))' scripts/deploy-triage-launchd.sh && echo "PASS runner computes a 90-minute epoch" || { echo "FAIL runner does not compute SINCE_EPOCH"; fail=1; }
grep -q "grep -q '{{SINCE_EPOCH}}'" scripts/deploy-triage-launchd.sh && echo "PASS runner aborts on unrendered placeholder" || { echo "FAIL no unrendered-placeholder guard"; fail=1; }
exit $fail
