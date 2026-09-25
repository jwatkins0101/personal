#!/bin/bash
# gate:inbox-no-send (AC-04). HOOK may be overridden for negative validation.
cd "$(dirname "$0")/../.." || exit 1; . tests/gates/lib.sh
HOOK="${HOOK:-cos/hooks/inbox-no-send.sh}"
expect_exit 2 "drafts send blocked"         "$HOOK" 'gws gmail users drafts send --json {"id":"r1"}'
expect_exit 2 "messages send blocked"       "$HOOK" 'gws gmail users messages send --params {"userId":"me"}'
expect_exit 2 "extra spacing blocked"       "$HOOK" 'gws  gmail users   messages  send'
expect_exit 2 "REST send via curl blocked"  "$HOOK" 'curl -X POST https://gmail.googleapis.com/gmail/v1/users/me/messages/send'
expect_exit 2 "repo send-mail.sh blocked"   "$HOOK" 'bash scripts/send-mail.sh to@x.com subj body'
expect_exit 2 "chained send blocked"        "$HOOK" 'cd /tmp && gws gmail users drafts send --json {}'
expect_exit 0 "drafts create allowed"       "$HOOK" 'gws gmail users drafts create --json {"message":{"raw":"x"}}'
expect_exit 0 "label/archive allowed"       "$HOOK" 'gws gmail users messages modify --params {"id":"1"} --json {"removeLabelIds":["INBOX"]}'
expect_exit 0 "list allowed"                "$HOOK" 'gws gmail users messages list --params {"q":"in:inbox after:1"}'
expect_raw_exit 2 "unparseable input blocked" "$HOOK" '{bad'
grep -q -- '--settings "$TRIAGE_DIR/triage-settings.json"' scripts/deploy-triage-launchd.sh \
  && echo "PASS runner passes --settings with the hook" || { echo "FAIL runner does not wire the hook"; fail=1; }
grep -q 'cos/hooks/inbox-no-send.sh' scripts/deploy-triage-launchd.sh \
  && echo "PASS deploy copies the hook" || { echo "FAIL deploy does not copy the hook"; fail=1; }
exit $fail
