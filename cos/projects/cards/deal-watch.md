# deal-watch
_Card for CoS sub-agent briefs. Built 2026-09-26 from the Sources below; hand-maintained, build-index.mjs never overwrites it._

## What it is
Twice-weekly coupon sweep across Kroger, Walgreens, Dollar General and Sam's Club: reads signed-in browser sessions, normalizes offers to one JSON shape, renders one HTML brief (CLAUDE.md). It is the CoS `deals` lane (cos/lanes.json).

## Paths
- Project: /Users/jermainewatkins/Code/deal-watch (symlinked from /Users/jermainewatkins/Documents/Documents - Jermaine’s MacBook Pro/Sites/deal-watch)
- CLAUDE.md: <project>/CLAUDE.md; README: none
- Agent instructions: <project>/sweep.md; renderer: lib/render.py; config.json; watchlist.json; run.sh
- Output: data/deals-<date>.json, briefs/brief-<date>.html, briefs/index.html (newest)
- Memory: no project memory dir; workspace memory /Users/jermainewatkins/.claude/projects/-Users-jermainewatkins-Documents-Sites/memory/project_deal_watch.md

## Stack & how to run/test
- `./run.sh` full sweep + render; `python3 lib/render.py` re-render newest data; `open briefs/index.html` (CLAUDE.md)
- run.sh calls `claude -p` on sweep.md, then verifies briefs/brief-<today>.html exists and exits non-zero if not (run.sh)

## Accounts, services & IDs
- launchd com.jermaine.deal-watch, Wed + Sun 07:18, wrapped by ~/Library/Application Support/assistance/cos/bin/lane-run.sh deals, artifact briefs/brief-{date}.html, log ~/Library/Logs/assistance/deals-launchd.log (~/Library/LaunchAgents/com.jermaine.deal-watch.plist)
- CoS gather reads ~/Code/deal-watch/briefs/brief-<date>.html (~/Code/assistance/src/cos/gather.ts:98)
- Kroger store: Pickup at Tyler Center, Taylorsville Rd (project_deal_watch.md)
- Sam's Club is the household membership under Deanna, Jeffersontown club (CLAUDE.md; project_deal_watch.md)
- `auto_clip` false by default (config.json)

## People
- Deanna — Sam's Club membership holder (CLAUDE.md)

## Status
- Not a git repo.
- CoS health 2026-09-26: deals STALE, last=never, expected by 2026-09-23T11:18Z.
- The Wed 2026-09-23 scheduled run failed: "can't open input file: /Users/jermainewatkins/Documents/Sites/deal-watch/run.sh" (logs/launchd.err.log). A manual run on 2026-09-24 wrote briefs/brief-2026-09-24.html (logs/manual-2026-09-24.log). The plist now points at ~/Code/deal-watch/run.sh; next scheduled run Sun 2026-09-27 07:18 — not yet verified.
- Manual-run notes: sign in to Dollar General and Sam's Club in Chrome; both Dollar General coupon URLs in sweep.md 404 (logs/manual-2026-09-24.log)
- Open cos_work items: none

## Gotchas / decisions
- Extraction is agentic; all arithmetic and rendering stay in lib/render.py — don't move math into the prompt (CLAUDE.md)
- `value` = dollars saved; weekly-ad prices are kind "price_point", value 0 — conflating inflates totals (CLAUDE.md)
- Read-only: never checks out, buys, enters credentials or logs in; signed-out store → `auth_required` (CLAUDE.md)
- Chrome must be running and signed in; no public APIs + bot protection, so no cloud job (CLAUDE.md)
- Kroger prices render without a decimal point — parse the long description (CLAUDE.md)
- 07:18 is staggered off the 07:03 YouTube brief so they don't contend for Chrome (CLAUDE.md)
- Kroger order-level coupon is $10 off $75, not $30 (project_deal_watch.md)

## Gaps
- Dollar General coupon URL in sweep.md needs a new, working URL.
- Whether the lane-wrapped run records correctly will only be known after Sun 2026-09-27.
- CLAUDE.md says `tail -f logs/launchd.log`; the plist now logs to ~/Library/Logs/assistance/deals-launchd.log.

## Sources
- <project>/CLAUDE.md, run.sh, config.json, logs/launchd.err.log, logs/manual-2026-09-24.log (tail), briefs/ and data/ listings
- ~/Library/LaunchAgents/com.jermaine.deal-watch.plist
- ~/Code/assistance/cos/lanes.json; ~/Code/assistance/src/cos/gather.ts (grep)
- ~/.claude/projects/-Users-jermainewatkins-Documents-Sites/memory/project_deal_watch.md
- `cos -- health` output
