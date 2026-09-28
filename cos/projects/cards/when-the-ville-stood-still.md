# when-the-ville-stood-still
_Card for CoS sub-agent briefs. Built 2026-09-26 from the Sources below; hand-maintained, build-index.mjs never overwrites it._

## What it is
Documentary-style social media series about defining moments in Louisville basketball history, produced as AI short films for social platforms (CLAUDE.md). Season One = 6 standalone episodes, each with a four-act structure (CLAUDE.md).

## Paths
- Project: /Users/jermainewatkins/Documents/Documents - Jermaine’s MacBook Pro/Sites/when-the-ville-stood-still
- CLAUDE.md: <project>/CLAUDE.md
- README: none
- Canonical bible: <project>/docs/SEASON-ONE-BIBLE.md; facts: <project>/wiki/Home.md (CLAUDE.md)
- Episodes: <project>/episodes/ep01-from-out-the-pit … ep06-one-call
- Pipeline/style: <project>/production/ai-pipeline.md, production/style/legal-guardrails.md, production/style/visual-style-guide.md
- Teaser (Remotion): <project>/social/teaser/ (README.md, vo-script.md)
- Memory: no project memory dir; /Users/jermainewatkins/.claude/projects/-Users-jermainewatkins-Documents-Sites/memory/project_ville_stood_still.md

## Stack & how to run/test
- Teaser: `npm run dev` (Remotion Studio), `npm run render`, `npm run render:vertical` in social/teaser (package.json, social/teaser/README.md)
- Generation tools: Google Veo 3.1 (hero shots), ElevenLabs (all VO + SFX) (production/ai-pipeline.md)

## Accounts, services & IDs
- ElevenLabs and Google Veo 3.1 named as tools; accounts not stated (production/ai-pipeline.md)
- Git repo has no remote (inventory.json; `git remote -v` empty)

## People
- Mike Rutherford — recurring voice in all six episodes (CLAUDE.md)
- Denny Crum, Darrell Griffith — Episode 2 subjects (CLAUDE.md)
- Terry Meiners (840 WHAS) — bible typo "Terry Minors, WHAS 84" corrected (CLAUDE.md)
- Monique Reid — was a forward, not a guard (CLAUDE.md)
- Patrick Sparks, Ellis Myles — Episode 6 game facts (project_ville_stood_still.md)

## Status
- Last commit: 2026-07-30 4e56335 "Fix vertical layout: 16:9 video band with blurred fill, type below" (teaser v2 with Veo 3.1 backdrops + ElevenLabs narration, 8f0ce8c)
- Working tree: only .DS_Store changes
- Open cos_work items: none

## Gotchas / decisions
- docs/SEASON-ONE-BIBLE.md is canonical; flag conflicts, never silently change (CLAUDE.md)
- Facts must trace to wiki/; resolve [UNVERIFIED]/[CONFLICT]/[CITE CHECK] before scripting (CLAUDE.md)
- Legal guardrails binding: no broadcast footage/recreations, no call audio or announcer voice-cloning, no logos/marks, no unreleased likenesses (CLAUDE.md; production/style/legal-guardrails.md)
- Episode 6 "One Call" = Kentucky 60–58, Dec 18, 2004, Freedom Hall (CLAUDE.md, project_ville_stood_still.md)
- Tone never argues outcomes; Season One ends without resolution (CLAUDE.md)
- Teaser renders in out/ are gitignored (social/teaser/README.md)

## Gaps
- No remote/backup for the git repo
- Release plan, platforms/accounts, and whether episodes beyond the teaser are in production are not stated
- Whether this is a personal project or for a client/partner is not stated

## Sources
- <project>/CLAUDE.md, social/teaser/README.md, social/teaser/package.json, production/ai-pipeline.md (grep); directory listings; git log/status/remote
- /Users/jermainewatkins/.claude/projects/-Users-jermainewatkins-Documents-Sites/memory/project_ville_stood_still.md, MEMORY.md
