# assistance
_Card for CoS sub-agent briefs. Built 2026-09-26 from the Sources below; hand-maintained, build-index.mjs never overwrites it._

## What it is
macOS-only productivity assistant: email via the Gmail API (`gws` CLI auth); Calendar, Messages and Notes via AppleScript; Claude CLI for classification (CLAUDE.md). Also home of the Chief of Staff (CoS): charter, lanes, ledger, `/cos` skill and this project index (cos/CLAUDE.md, last commit).

## Paths
- Project: /Users/jermainewatkins/Code/assistance (also reached via symlink /Users/jermainewatkins/Documents/Documents - Jermaine’s MacBook Pro/Sites/assistance)
- CLAUDE.md: /Users/jermainewatkins/Code/assistance/CLAUDE.md; CoS charter: /Users/jermainewatkins/Code/assistance/cos/CLAUDE.md
- README: none. Operator manual: /Users/jermainewatkins/Code/assistance/docs/USAGE.md
- CoS PRD/plan: /Users/jermainewatkins/Code/assistance/docs/tasks/active/ai-chief-of-staff/ (PRD.md, DECISIONS.md, STORIES.json)
- CoS config: cos/lanes.json, cos/accounts.json, cos/gates.json, cos/triage-rules.json, cos/skills/cos/SKILL.md, cos/projects/ (this index)
- Memory: /Users/jermainewatkins/.claude/projects/-Users-jermainewatkins-Documents-Sites-assistance/memory/MEMORY.md (16 files; the -Users-jermainewatkins-Code-assistance and long-path Sites-assistance memory dirs are empty)
- Runtime data: ~/Library/Application Support/assistance/ (secondbrain.sqlite; installed cos/bin/lane-run.sh; triage/gmail-triage.md) — logs ~/Library/Logs/assistance/
- Do not open: /Users/jermainewatkins/Code/assistance/credentials/

## Stack & how to run/test
- TypeScript run via `tsx`; `npm run build` = `tsc --noEmit`; `npm run gates` = scripts/run-gates.ts (package.json)
- `npm run pipeline` (ingest → sort → route → briefing), `npm run tasks`, `npm run sms-triage`, `npm run triage` (package.json, CLAUDE.md)
- CoS: `npm --prefix ~/Code/assistance run -s cos -- health` (lane status), `npm run cos -- accounts` (src/cos/cli.ts; gmail-triage-oauth-app.md)

## Accounts, services & IDs
- DB: ~/Library/Application Support/assistance/secondbrain.sqlite, tables incl. cos_work (CLAUDE.md)
- gws profiles: personal jermainewatkins@gmail.com (default), owlthat jwatkins@owlthat.com, veryhealth jermaine@very.health, techunify j@techunify.com; UofL jewatk02@louisville.edu is Exchange, forwarded to Gmail (cos/accounts.json)
- Google OAuth app "Gmail Triage", GCP project gmail-triage-494101, In production/unverified since 2026-09-25 (…MacBook-Pro-Sites/memory/gmail-triage-oauth-app.md)
- launchd lanes: com.assistance.gmail-triage, com.assistance.task-capture, com.assistance.cos-morning/-eod/-weekly, com.assistance.triage-owlthat/-techunify, plus com.jermaine.deal-watch and com.jermaine.yt-daily-brief (cos/lanes.json)
- Gmail label IDs Label_93–97 (Finance, Newsletters, Notifications, Receipts, Shipping) (memory/project_email_gws_migration.md)
- Tasks = Google Tasks REST API with the Gmail token (memory/project_tasks_google.md)

## People
- No project people for the code itself. The memory dir also holds non-assistance context (GE course, SCTS, ABRL, OwlThat/Adaptive Strategy USA) — see those projects' cards.

## Status
- Last commit: 2026-09-25 5cab898 "feat(cos): /cos in Claude Code, an interactive chief of staff that runs sub-agents (D30, AC-37)"
- CoS health 2026-09-26: inbox, tasks-email, tasks-sms, cos-morning/eod/weekly, triage-owlthat, triage-techunify OK; deals STALE; yt FAIL (see deal-watch, youtube-knowledge cards)
- Open cos_work: #9 running "Build INDEX.md + per-project cards"; #10 queued "Wire index into /cos skill + refresh script"; #11 queued "Jermaine reviews active list + fills gaps" (#8 inventory scan done)

## Gotchas / decisions
- Email is Gmail API only; never reintroduce scripts/get-mail.sh / Apple Mail AppleScript (times out -1712) (CLAUDE.md; memory/project_email_gws_migration.md)
- Gmail quota 15,000 units/min/user: use search + batchModify, not per-message get (CLAUDE.md)
- Tasks live in Google Tasks; Apple Reminders rejected for AppleScript slowness (memory/project_tasks_google.md)
- New scripts in Node (.mjs / tsx), not Python (memory/feedback_node_over_python.md)
- CoS autonomy: never send/pay/sign up/delete; no calendar writes in v1; lane results are JSON run records with source_refs (cos/CLAUDE.md)
- New gws account needs roles/serviceusage.serviceUsageConsumer on gmail-triage-494101 before API calls work; login via scripts/gws-login.sh <profile> (gmail-triage-oauth-app.md)
- launchd runs the installed copy ~/Library/Application Support/assistance/cos/bin/lane-run.sh, not the repo's cos/bin (LaunchAgents plists)

## Gaps
- Whether the repo cos/bin and the installed Application Support copy are kept in sync is not documented.
- git remote is jwatkins0101/personal (inventory) — confirm that is the intended repo name.
- Memory dir mixes unrelated project notes (GE course, SCTS, ABRL); Jermaine may want them moved.

## Sources
- ~/Code/assistance/CLAUDE.md, package.json, cos/CLAUDE.md, cos/lanes.json, cos/accounts.json, docs/USAGE.md (head), src/cos/gather.ts (grep)
- ~/Library/LaunchAgents/com.jermaine.deal-watch.plist, com.jermaine.yt-daily-brief.plist
- ~/.claude/projects/-Users-jermainewatkins-Documents-Sites-assistance/memory/ (all 16 files)
- ~/.claude/projects/-Users-jermainewatkins-Documents-Documents---Jermaine-s-MacBook-Pro-Sites/memory/gmail-triage-oauth-app.md
- ~/.claude/projects/-Users-jermainewatkins-Documents-Sites/memory/project_gmail_triage.md
- cos_work table (read-only), `cos -- health` output, git log -1
