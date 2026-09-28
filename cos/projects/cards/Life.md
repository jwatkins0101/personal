# Life
_Card for CoS sub-agent briefs. Built 2026-09-26 from the Sources below; hand-maintained, build-index.mjs never overwrites it._

## What it is
Non-code personal automation workspace: calendars, email triage, school, sports, trips, credit, family logistics (CLAUDE.md). Not a git repo; holds the nested fantasy football repo `fanstyfootball`.

## Paths
- Project: /Users/jermainewatkins/Documents/Documents - Jermaine’s MacBook Pro/Sites/Life
- CLAUDE.md: <project>/CLAUDE.md; README: none
- Subfolders: family/ (football hub family/football/), school/{jada,jackson}/, creditreport/, trips/ (vegas-itinerary/), house/, personal/, teaching/, clients/, _generators/
- Nested repo: <project>/fanstyfootball (own CLAUDE.md; no remote configured)
- Memory: /Users/jermainewatkins/.claude/projects/-Users-jermainewatkins-Documents-Sites-Life/memory/MEMORY.md (3 files)
- Related workspace memory: /Users/jermainewatkins/.claude/projects/-Users-jermainewatkins-Documents-Sites/memory/ (project_sacred_heart_kids, project_jackson_football, project_credit_cleanup, project_vegas_trip, project_fantasy_football_yahoo, project_water_leak_repair, project_meta_unauthorized_charges, pref_apple_calendar)

## Stack & how to run/test
not stated in repo docs (AppleScript to Calendar.app for calendar writes — CLAUDE.md)

## Accounts, services & IDs
- Calendar: Apple Calendar / iCloud, existing `Family` calendar (three share the name; pick by event count) (CLAUDE.md)
- Gmail triage via launchd + gws CLI; school Gmail labels School / School/Jada / School/Jackson = Label_98/99/100 (CLAUDE.md; project_sacred_heart_kids.md)
- TeamSnap (Lyndon Lightning iCal feed), shslou.org, Toddle (Jackson), PowerSchool (Jada) (CLAUDE.md; project_sacred_heart_kids.md; project_jackson_football.md)
- Yahoo Fantasy: Paytons Place, league 82530, team 3 (CLAUDE.md; project_fantasy_football_yahoo.md)
- Playbypoint facility 865 (CLAUDE.md)
- Credit monitoring and account details: see project_credit_cleanup.md (not copied)

## People
- Deanna, Jada, Jackson (CLAUDE.md); "Jack" = Jackson (assistance memory/user_family.md)
- Scott Fishback — head coach, Lyndon Lightning (Life memory/son-lyndon-lightning-football.md)
- Kate Temple — PowerSchool login help, SHA (project_sacred_heart_kids.md)

## Status
- Not a git repo (fanstyfootball last commit 2026-08-23 83904fc "Add 2026 draft prep plan and raw research")
- Open cos_work items: none
- Time-bound items in sources: football season through Oct 2026 (project_jackson_football.md); credit 3-bureau refresh ~late Sep 2026 (project_credit_cleanup.md); water-leak repair decision pending (project_water_leak_repair.md)

## Gotchas / decisions
- List + dedupe the date range before any calendar write; match date + normalized title; never create a calendar or use Google Calendar (CLAUDE.md; pref_apple_calendar.md)
- Delete calendar events one per osascript call; bulk `whose` queries take ~35 s each (pref_apple_calendar.md)
- Confirm before sending messages, bulk calendar deletes, forms/payments (CLAUDE.md)
- School mail: Jada is rarely named in subjects — route on SHA/Academy signals; Toddle mail is always Jackson (project_sacred_heart_kids.md)
- Football source of truth is the TeamSnap iCal feed; regenerate from family/football/data/events.json (project_jackson_football.md)
- Drafts to send: plain text in one fenced block (CLAUDE.md)
- Medical/health details exist in Life memory (vegas-trip-dialysis.md) — treat as sensitive, cite, don't copy

## Gaps
- No description of clients/, teaching/, house/, personal/ folders — what belongs there is not documented.
- Whether fanstyfootball should be tracked as its own project is undecided.

## Sources
- <project>/CLAUDE.md, fanstyfootball/CLAUDE.md (head), git log -1 of fanstyfootball
- Life memory: MEMORY.md, son-lyndon-lightning-football.md, vegas-trip-dialysis.md
- Workspace memory: MEMORY.md, project_sacred_heart_kids.md, project_jackson_football.md, project_credit_cleanup.md, project_fantasy_football_yahoo.md, project_water_leak_repair.md, pref_apple_calendar.md
- ~/.claude/projects/-Users-jermainewatkins-Documents-Sites-assistance/memory/user_family.md
