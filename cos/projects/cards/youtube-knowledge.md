# youtube-knowledge
_Card for CoS sub-agent briefs. Built 2026-09-26 from the Sources below; hand-maintained, build-index.mjs never overwrites it._

## What it is
Personal knowledge base for watched videos: transcripts, notes and insights, one folder per video; `INSIGHTS.md` holds cross-video themes and `WORLDVIEW.md` the holistic synthesis (README.md). A daily 7:03 launchd run writes `briefs/YYYY-MM-DD.md` — this is the CoS `yt` lane (README.md; cos/lanes.json).

## Paths
- Project: /Users/jermainewatkins/Code/youtube-knowledge (symlinked from /Users/jermainewatkins/Documents/Documents - Jermaine’s MacBook Pro/Sites/youtube-knowledge)
- CLAUDE.md: none. README: <project>/README.md (also the video index)
- Run spec: <project>/daily-brief.md; channels: <project>/channels.md; synthesis: INSIGHTS.md, WORLDVIEW.md; deferred plan: KNOWLEDGE-MIGRATION-PLAN.md
- Output: <project>/briefs/YYYY-MM-DD.md; videos/YYYY-MM-DD-slug/{transcript.md,transcript-raw.txt,notes.md}
- Memory: no project memory dir; workspace memory /Users/jermainewatkins/.claude/projects/-Users-jermainewatkins-Documents-Sites/memory/project_youtube_knowledge.md
- Skill: /daily-brief (runs the pipeline end to end)

## Stack & how to run/test
- Manual: `claude -p "Follow youtube-knowledge/daily-brief.md"` from ~/Code (daily-brief.md)
- Discovery with yt-dlp channel listing; YouTube RSS returns 404 (daily-brief.md; channels.md)

## Accounts, services & IDs
- launchd com.jermaine.yt-daily-brief, 07:03 daily, wrapped by ~/Library/Application Support/assistance/cos/bin/lane-run.sh yt, artifact briefs/{date}.md, log ~/Library/Logs/assistance/yt-launchd.log (~/Library/LaunchAgents/com.jermaine.yt-daily-brief.plist)
- CoS gather reads briefs from ~/Code/youtube-knowledge/briefs/<date>.md (~/Code/assistance/src/cos/gather.ts:96)
- 10 tracked channels incl. IndyDevDan, Nate B Jones, Theo, Greg Isenberg, Y Combinator, All-In, Rob Walling, KSTC, a16z, Riley Brown (channels.md)

## People
- Channel creators only (channels.md); no collaborators named.

## Status
- Not a git repo.
- CoS health 2026-09-26: yt FAIL — missing_artifact briefs/2026-09-26.md. Log shows the run hit "Background tasks still running after 600s; terminating" with four processors still running (yt-launchd.log, run yt-20260926T071551-71598). Latest brief on disk: 2026-09-25.md.
- Open cos_work items: none

## Gotchas / decisions
- No relevance filter: insights judged on their own merit, not framed by Jermaine's projects (daily-brief.md; memory feedback_insights_no_relevance_filter.md)
- If no new videos, still write a one-line brief so the since-last-brief date stays current (daily-brief.md)
- Never fabricate a transcript; skip when captions are unavailable (daily-brief.md)
- Brief under ~400 words (daily-brief.md)
- WORLDVIEW.md is the shared world-model — read it for AI/markets/policy discussions (project_youtube_knowledge.md)
- Claude print mode kills background sub-agents after 600 s (CLAUDE_CODE_PRINT_BG_WAIT_CEILING_MS) — the 2026-09-26 failure cause (yt-launchd.log)

## Gaps
- Fix for the 600 s background ceiling not decided (raise ceiling vs. process serially).
- README says logs are at briefs/.launchd*.log; the plist now logs to ~/Library/Logs/assistance/yt-launchd.log.
- Workspace memory says the run works from ~/Documents/Sites and tracks IndyDevDan only; the plist now runs from ~/Code and channels.md lists 10 — memory is stale.

## Sources
- <project>/README.md, daily-brief.md, channels.md, KNOWLEDGE-MIGRATION-PLAN.md (head), briefs/ listing
- ~/Library/LaunchAgents/com.jermaine.yt-daily-brief.plist; ~/Library/Logs/assistance/yt-launchd.log (tail)
- ~/Code/assistance/cos/lanes.json; ~/Code/assistance/src/cos/gather.ts (grep)
- ~/.claude/projects/-Users-jermainewatkins-Documents-Sites/memory/project_youtube_knowledge.md, MEMORY.md
- `cos -- health` output
