# AIAgents
_Card for CoS sub-agent briefs. Built 2026-09-26 from the Sources below; hand-maintained, build-index.mjs never overwrites it._

## What it is
Jermaine's multi-course teaching repository for the University of Louisville: one folder per course under `courses/<slug>/` plus shared generators, agents and Blackboard automation (CLAUDE.md). Also contains Sensei Console (`console/`), a local-first teaching-ops desktop app aimed at a UofL faculty pilot (memory/sensei-console-vp-demo.md).

## Paths
- Project: /Users/jermainewatkins/Documents/Documents - Jermaine’s MacBook Pro/Sites/AIAgents
- CLAUDE.md: <project>/CLAUDE.md (538 lines; per-course CLAUDE.md + course-config.json in each courses/<slug>/)
- README: none at root; generators/README.md referenced by CLAUDE.md
- Memory: /Users/jermainewatkins/.claude/projects/-Users-jermainewatkins-Documents-Sites-AIAgents/memory/MEMORY.md (30 files); long-path memory dir exists but is empty
- Courses on disk: cis-260-50/51-fall-2026, cis-290-spring-2026, msba-696/698-summer-2026, ge-uofl-course, demo-ba-210-fall-2026, sandbox-dev, others
- Sensei Console: <project>/console/ (branch sensei-console); copy in /Users/jermainewatkins/Documents/Documents - Jermaine’s MacBook Pro/Sites/owlthat-hq/sensei-console (memory/sensei-console-owlthat-repo.md)

## Stack & how to run/test
- Generators: `node ../../generators/{audio,slides,slide-exporter,video}-generator.js --week=N` from inside a course folder (CLAUDE.md)
- Console (console/package.json): `npm run dev` (server + vite), `npm run dev:all` (with Electron), `npm test` (server/lib/progress.test.ts), `npm run dist:mac`
- Blackboard automation needs Chrome logged in + Chrome MCP (CLAUDE.md)

## Accounts, services & IDs
- Git remote git@github.com:jwatkins0101/AIAgents.git (inventory.json; memory/aiagents-repo-relocated-icloud.md)
- Blackboard Ultra https://blackboard.louisville.edu; IDs live in each course-config.json, never hardcode (CLAUDE.md)
- Instructor id and CIS-260-50 course id: see ~/.claude/projects/-Users-jermainewatkins/memory/blackboard-messages-api.md
- Student/teaching email: UofL Exchange jermaine.watkins@louisville.edu (…/-Users-jermainewatkins/memory/school-email-location.md)
- ElevenLabs key in generators/.env (CLAUDE.md); console key in console/.env (memory/sensei-console-vp-demo.md) — not read
- GE Okta SSO username: see memory/ge-sso-username.md (password never stored)
- Sensei Console app repo: private OwlThat/sensei-console (memory/sensei-console-owlthat-repo.md)

## People
- Dan Murphy — business partner on the Sensei Console UofL pitch (memory/sensei-console-vp-demo.md)
- Kelvin Thompson — likely demo attendee, unconfirmed (memory/sensei-console-vp-demo.md)
- GE course people (Pepe Lopez, Manuela Perri, Alex Bryant, Kim Mallory, Jeff Guan): ~/.claude/projects/-Users-jermainewatkins-Documents-Sites/memory/project_ge_uofl_course.md

## Status
- Last commit: 2026-09-22 c8b00ee "Messages: Blackboard course messages and roster-matched UofL Outlook mail in one screen, with AI-drafted replies the teacher approves and sends"
- Sensei Console demo to UofL: Mon 2026-09-28 10:00–11:00 EDT, Teams (memory/sensei-console-vp-demo.md)
- Open cos_work items: none

## Gotchas / decisions
- FERPA: never name other students in feedback; never show real student data in demos — use courses/demo-ba-210-fall-2026 (CLAUDE.md; memory/sensei-console-vp-demo.md)
- Git history contains real student records: never transfer/mirror AIAgents to an org without a history rewrite (memory/sensei-console-owlthat-repo.md)
- Post weekly content as PDFs (x-bb-file) via cookie+node; embedded-HTML gives students "access denied" (CLAUDE.md; memory/bb-content-upload-cookie-node.md)
- Assignments need attempt-level PATCH (feedbackToUser + status COMPLETED) or feedback is invisible (CLAUDE.md)
- Student feedback 80–120 words, plain prose (memory/feedback-length.md)
- Repo moved with iCloud relocation; ~/Documents/Sites/AIAgents may look empty — check the long path first (memory/aiagents-repo-relocated-icloud.md)
- UofL students get Gemini, not Copilot (memory/uofl-student-accounts-no-copilot.md)

## Gaps
- CLAUDE.md "Active courses" table lists only CIS-290 Spring 2026 and MSBA 698 Summer 2026; Fall 2026 CIS-260 sections are on disk — which courses are current is not stated.
- Source of truth between console/ here and owlthat-hq/sensei-console is unresolved (memory/sensei-console-owlthat-repo.md).
- MEMORY.md links ethics-journal-grading.md, which does not exist.

## Sources
- <project>/CLAUDE.md, console/package.json, console/DISTRIBUTION.md (head); git log -1
- memory/MEMORY.md, sensei-console-vp-demo.md, sensei-console-owlthat-repo.md, aiagents-repo-relocated-icloud.md, uofl-student-accounts-no-copilot.md, class-progress-view-phase0.md, pi-privacy-firewall.md
- ~/.claude/projects/-Users-jermainewatkins/memory/ (blackboard-messages-api.md, school-email-location.md)
- ~/.claude/projects/-Users-jermainewatkins-Documents-Sites/memory/project_ge_uofl_course.md, project_team.md
