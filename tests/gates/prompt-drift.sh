#!/bin/bash
# gate:prompt-drift (AC-03). The repo prompt is canonical; the deployed copy must match byte-for-byte.
cd "$(dirname "$0")/../.." || exit 1
DEPLOYED="${DEPLOYED:-$HOME/Library/Application Support/assistance/triage/gmail-triage.md}"
[ -f "$DEPLOYED" ] || { echo "FAIL deployed prompt missing: $DEPLOYED"; exit 1; }
a="$(shasum -a 256 prompts/gmail-triage.md | cut -d' ' -f1)"; b="$(shasum -a 256 "$DEPLOYED" | cut -d' ' -f1)"
if [ "$a" = "$b" ]; then echo "PASS deployed prompt matches repo ($a)"; exit 0; fi
echo "FAIL drift: repo=$a deployed=$b. Run scripts/deploy-triage-launchd.sh (or reconcile edits back into the repo first)."; exit 1
