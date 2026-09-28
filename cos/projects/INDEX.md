# Project index (Chief of Staff)

_Generated 2026-09-26 by `build-index.mjs` from `inventory.json` (scanned 2026-09-26) + `overrides.json`. Do not hand-edit: change overrides.json or the cards, then re-run `node build-index.mjs`. Refresh the scan with `node scan-projects.mjs`._

## How CoS uses this

When Jermaine gives a goal, match it to a project by folder name or by any alias in the table below (aliases live in `overrides.json` and are only terms sourced from that project's docs, memory, or CoS work items). Open the matched card in `cards/` and put three things into every sub-agent brief: the card path, the project's CLAUDE.md path, and its memory folder(s) with MEMORY.md, all listed in the card's Paths section, so the sub-agent reads them first instead of starting cold. If the matched project has a parent (shown as ↳ under it), open the parent's card too and include its paths: the child is client or sub-work of the parent. If a goal matches no row, check the Archived list before creating anything new, and ask Jermaine rather than guessing. Cards are hand-maintained; treat their Gaps section as unknowns to confirm, not facts. Active = a commit or memory edit in the last 90 days, a CoS work item naming the folder, or forced by `overrides.json` include; `exclude` forces archived.

## Active projects (17)

| Project | What | Aliases | Card | Last activity |
|---|---|---|---|---|
| AIAgents | Jermaine's multi-course teaching repository for the University of Louisville: one folder per course under `courses/<slug>/` plus shared generators, agents and… | Blackboard, CIS-290, MSBA 698, GE class, UofL training, Building AI Agents | [cards/AIAgents.md](cards/AIAgents.md) | commit 2026-09-22; memory 2026-09-23 |
| assistance | macOS-only productivity assistant: email via the Gmail API (`gws` CLI auth); Calendar, Messages and Notes via AppleScript; Claude CLI for classification. | chief of staff, CoS, Gmail triage, Second Brain | [cards/assistance.md](cards/assistance.md) | commit 2026-09-25; memory 2026-06-05; CoS alias-match 2026-09-26 (#8, #9, #10, #11) |
| bouvier-bridge | Website for the American Bouvier Rescue League (ABRL), a nonprofit dog rescue; a React SPA built with Vite, TypeScript, Tailwind CSS and shadcn/ui. | ABRL, American Bouvier Rescue League, Happy Tails | [cards/bouvier-bridge.md](cards/bouvier-bridge.md) | commit 2026-03-21; memory 2026-08-01 |
| deal-watch (forced active) | Twice-weekly coupon sweep across Kroger, Walgreens, Dollar General and Sam's Club: reads signed-in browser sessions, normalizes offers to one JSON shape, rende… | coupon sweep, deals | [cards/deal-watch.md](cards/deal-watch.md) | no dated signal |
| jermainewatkins.com | Static site: home page and the Gmail Triage privacy policy. | Gmail Triage privacy policy | [cards/jermainewatkins.com.md](cards/jermainewatkins.com.md) | commit 2026-09-25 |
| Life | Non-code personal automation workspace: calendars, email triage, school, sports, trips, credit, family logistics. | family calendar, fantasy football, Paytons Place, Lyndon Lightning | [cards/Life.md](cards/Life.md) | memory 2026-07-19 |
| owlthat-hq | OwlThat HQ holds all of OwlThat's repos. | OwlThat, Cortex, Cortex box, owlctl, Cortex Companion | [cards/owlthat-hq.md](cards/owlthat-hq.md) | memory 2026-09-24; CoS name-match #1; CoS alias-match 2026-09-26 (#1, #5, #7, #9) |
| ↳ guardianowldigital (OwlThat client) (forced active) | Workspace for Guardian Owl Digital (guardianowldigital.com), described as the "first customer engagement" for Jermaine's company-management SaaS; it is not the… | Guardian Owl Digital, Guardian, Guardian box, Jenna, Jenna Ahern, Octic, Auctic, Process Discovery Hub | [cards/guardianowldigital.md](cards/guardianowldigital.md) | commit 2026-05-13; memory 2026-05-12; CoS alias-match 2026-09-26 (#1, #2, #3, #4, #5, #6, #9) |
| reelectmccraney | Re-Elect McCraney campaign website: static site hosted on AWS S3 + CloudFront with automated deployments via GitHub Actions. | Re-Elect McCraney, McCraney | [cards/reelectmccraney.md](cards/reelectmccraney.md) | commit 2026-06-28 |
| SmartCalltimeMonorepo | SCTS (Smart Call Time Solutions): an AI-powered political fundraising call coaching platform built on the Blue Dot Methodology (BDM). | SCTS, Smart Call Time Solutions, Blue Dot Methodology, BDM | [cards/SmartCalltimeMonorepo.md](cards/SmartCalltimeMonorepo.md) | commit 2026-09-23; memory 2026-07-17 |
| softwareharness | Versioned, project-neutral Ralph delivery workflow and supporting agents; canonical procedure is `workflow/RALPH.md`. | Ralph, Ralph workflow | [cards/softwareharness.md](cards/softwareharness.md) | commit 2026-09-23 |
| stella-venues-reveal | Website for Stella's Venue, "Louisville's true waterfront event space at 1346 River Road — one room for up to 184 guests, one event per day" (index.html meta d… | Stella's Venue | [cards/stella-venues-reveal.md](cards/stella-venues-reveal.md) | commit 2026-08-05 |
| veryapp | The VERY Health platform: a full-stack healthcare management app (patient roster, clinical alerts, Chime telehealth video, messaging, reports) on AWS serverles… | Very Health Platform, Valant | [cards/veryapp.md](cards/veryapp.md) | commit 2026-08-05; memory 2026-08-06 |
| veryweb | Marketing website for VERY Health (https://very.health), an eating disorder treatment provider; React/TypeScript/Tailwind, deployed to AWS S3 + CloudFront. | VERY Health marketing site, very.health | [cards/veryweb.md](cards/veryweb.md) | commit 2026-09-24; memory 2026-09-25 |
| wethejuryroom | We The Jury Room: a mobile-first juror simulation game where players review fictional court cases, evaluate evidence, deliberate via Clubhouse-style async voic… | We The Jury Room | [cards/wethejuryroom.md](cards/wethejuryroom.md) | commit 2026-09-23; memory 2026-03-24 |
| when-the-ville-stood-still | Documentary-style social media series about defining moments in Louisville basketball history, produced as AI short films for social platforms. | When the Ville Stood Still, Louisville basketball | [cards/when-the-ville-stood-still.md](cards/when-the-ville-stood-still.md) | commit 2026-07-30 |
| youtube-knowledge (forced active) | Personal knowledge base for watched videos: transcripts, notes and insights, one folder per video; `INSIGHTS.md` holds cross-video themes and `WORLDVIEW.md` th… | daily brief, WORLDVIEW, yt | [cards/youtube-knowledge.md](cards/youtube-knowledge.md) | no dated signal |

_CoS items matched on aliases against cos_work goal/title/result (11 items, read-only)._

All active projects have a card.

### Override notes

- **guardianowldigital**: Current CoS work (cos_work #1-7, goals "Jenna 12:45 prep" and "Dropbox share links", Sep 25 2026) is about the Guardian box, Jenna, Octic/Auctic and Dropbox; the scanner missed it because it matches folder names whole-word only. Last commit 2026-05-13 and memory 2026-05-12 fall outside the 90-day window.
- **youtube-knowledge**: Backs the CoS lane "yt" (cos health, 2026-09-26: FAIL, missing briefs/2026-09-26.md). Not a git repo and has no mapped memory, so the scanner had no activity signal.
- **deal-watch**: Backs the CoS lane "deals" (cos health, 2026-09-26: STALE, last=never). Not a git repo and has no mapped memory, so the scanner had no activity signal.

## Archived (63)

_No card. One line each: description (first prose line of CLAUDE.md/README/package.json, may be template text) or flags. Last commit shown when known._

- **abrl.org** — This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs…
- **adaptive-agent-system** — This is an Adaptive AI Agent System built on a serverless, event-driven architecture using AWS. The system is…; last commit 2025-07-14
- **agentic-price-monitor** — Phase 1 implementation for an appliance-part competitor price monitoring maintenance workflow.; last commit 2026-06-25
- **ai-chief-of-staff-report** — no description found; not git
- **ai-teacher-channel** — Goal: Personal brand / authority (speaking, board seats, consulting inbound); not git
- **AIDiligenceforPrivateEquity** — CoreFour Advisors is an AI diligence consulting practice for Private Equity (PE) funds. The venture helps PE…; not git
- **atria** — Atria is a data acquisition and competitive intelligence tool for senior living communities. It aggregates fa…; last commit 2026-03-14
- **awstest** — hello; last commit 2024-11-15; flags: scratch
- **cassidy** — no description found; not git
- **core** — core; last commit 2025-03-17; flags: cos-name-ambiguous-with:owlthat-hq/core
- **core-app** — Features are built using the Ralph autonomous pipeline, which takes a feature from idea through deployment.; last commit 2026-03-18
- **corefour** — no description found; last commit 2026-01-17
- **diligence-os** — Diligence OS is a proposed licensed multi-tenant SaaS for lower-middle-market (LMM) PE deal teams. The v1 pro…; last commit 2026-06-15
- **empathy-form-flow** — Lovable template README, no real description; last commit 2026-03-05
- **EvalScope** — EvalScope; last commit 2025-08-19
- **facebookai** — This template demonstrates how to make a simple HTTP API with Node.js running on AWS Lambda and API Gateway u…; last commit 2025-02-15
- **ferpa-demo** — no description found; not git
- **forte3d** — no description found; not git
- **gb-platform** — core; last commit 2025-03-17
- **ge** — no description found; not git
- **gem** — This is a CLI tool project.; not git
- **goodbounce** — no description found; not git
- **healthy-habits-guide** — Lovable template README, no real description; last commit 2026-02-14
- **hogshead** — OwlThat; last commit 2024-05-22
- **intellecta-ops** — no description found; last commit 2025-11-19
- **iphone-ctl** — no description found; not git
- **kindred** — A relationship-first dating app for adults 25–45 seeking intentional, long-term
- **larry** — All images are AI-generated (Gemini), converted to JPG at 1920px wide, ~400-800KB each.; last commit 2026-03-27
- **law** — no description found; not git
- **leadership-connect-spark** — Lovable template README, no real description; last commit 2025-09-03
- **levyeps** — no description found; last commit 2024-09-24
- **mychart** — MyChart lab data project. Contains exported lab/test results from MyChart (Epic patient portal) for personal…
- **Neighborhood360** — Core entities include Companies, Leads, Messages, Quotes, Knowledge documents, Phone Lines, and Calendar inte…; last commit 2025-07-10
- **nicole-s-intake-connect** — Lovable template README, no real description; last commit 2026-01-28
- **oil** — Read `README.md` first, then `docs/findings-briefing.md`. Those two files contain the thesis, the validated d…; not git
- **paytons-place-week1-reel** — A 30-second vertical fantasy-football nature-documentary parody, built with Remotion 4.0.525 and TypeScript.
- **prompt-keeper** — Lovable template README, no real description; last commit 2026-03-04
- **referral-hub** — Lovable template README, no real description; last commit 2026-01-09
- **"review "** — Lovable template README, no real description; not git; flags: name-has-surrounding-whitespace
- **reviewer** — A brutally honest design critic that reviews startup websites with the exacting standards of Cursor's Head of…; not git
- **rscs-demo-files** — no description found; not git
- **schdule** — no description found; not git
- **Sensei** — CRITICAL: The GitHub CI/CD pipeline must ALWAYS stay green on main.; last commit 2026-02-16
- **skills** — no description found; not git
- **smart-calltime-solutions-v2** — A Vite + React + TypeScript web app for managing call-time operations, donor lists, dialer flows, and AI-assi…; last commit 2026-03-24
- **SmartCalltimeMonorepo-S09** — AI-powered political fundraising call coaching platform built on the Blue Dot Methodology (BDM).; last commit 2026-04-16; flags: worktree-of:SmartCalltimeMonorepo, duplicate-of:SmartCalltimeMonorepo
- **SmartCalltimeMonorepo-sentry** — AI-powered political fundraising call coaching platform built on the Blue Dot Methodology (BDM).; last commit 2026-05-09; flags: worktree-of:SmartCalltimeMonorepo, duplicate-of:SmartCalltimeMonorepo
- **smartwebsite** — no description found; last commit 2026-04-30
- **song** — Welcome to your Remotion project!; last commit 2026-01-28
- **speech-assistant-openai-realtime-api-node** — gb-voice; last commit 2025-01-15
- **stateclaim** — Maximize recovery on personal property claim by documenting all lost items with accurate descriptions, quanti…; not git
- **stellascorp** — no description found; not git
- **test** — no description found; not git; flags: scratch
- **testge** — no description found; not git; flags: scratch, empty
- **threadline-vision** — Lovable template README, no real description; last commit 2025-10-03
- **ulcore** — CRITICAL: The GitHub CI/CD pipeline must ALWAYS stay green on main.; last commit 2026-04-09
- **unless** — A TikTok watch-hours dashboard you can talk to.; not git
- **virtual-wellness-hub** — Lovable template README, no real description; last commit 2026-01-22
- **voice** — Below is a concise, step-by-step guide to set up and host a voice server on a Fedora/Red Hat-based system usi…; last commit 2025-10-29
- **wiki** — This repo is a research wiki that serves as the foundation for building Nexus: the operating system for the c…
- **worktrees** — no description found; not git; flags: worktree-container, empty
- **wright-paint-showcase** — no description found; last commit 2026-05-16
- **xxx** — AI-powered business operating system where a wiki is the company's brain and AI agents are the team.; not git; flags: scratch

## Loose files (16)

_Files sitting directly in the Sites folder, not in any project._

- .gitignore — 2 KB, modified 2025-03-06
- download.html — 0 KB, modified 2026-08-08
- package-lock.json — 155 KB, modified 2026-06-15
- package.json — 0 KB, modified 2026-06-10
- pi-migration-plan.html — 10 KB, modified 2026-08-15
- process-review-2026-09-23-evidence.json — 34 KB, modified 2026-09-23
- process-review-2026-09-23.md — 20 KB, modified 2026-09-23
- process-system-fixes-2026-09-23.md — 8 KB, modified 2026-09-23
- rscs-ai-supply-chain-blueprint.md — 45 KB, modified 2026-03-29
- rscs-demo-package.zip — 45 KB, modified 2026-03-29
- rscs-lunch-learn-research-prompt.md — 4 KB, modified 2026-03-29
- screencapture-blackboard-louisville-edu-ultra-courses-1802208-1-grades-discussion-36142001-1-grading-5942899-1-detail-2026-04-27-20_58_35.png — 1613 KB, modified 2026-04-28
- skills-lock.json — 1 KB, modified 2026-06-12
- SmartCalltimeMonorepo-backup-2026-07-02.zip — 70317 KB, modified 2026-07-03
- swarmforge-review-and-takeaways.md — 6 KB, modified 2026-07-24
- uncle-bob-kent-dodds-transcript.txt — 40 KB, modified 2026-07-24

## Orphan memory (3)

_Claude memory folders whose encoded path matches no existing folder (project was moved or renamed). Still readable; cards cite them where relevant._

- ~/.claude/projects/-Users-jermainewatkins-Documents-Sites-owlthat/memory — 17 files, last modified 2026-07-11
- ~/.claude/projects/-Users-jermainewatkins-Documents-Sites-very/memory — 1 files, last modified 2026-02-15
- ~/.claude/projects/-Users-jermainewatkins-Documents-Sites-very-health-hub/memory — 3 files, last modified 2026-03-19

### Non-project memory (8)

_Memory for folders that are not projects (workspace root, home, app data). Workspace-level ones often hold cross-project facts._

- ~/.claude/projects/-private-tmp/memory — 0 files
- ~/.claude/projects/-private-tmp-claude-501--Users-jermainewatkins-Documents-Documents---Jermaine-s-MacBook-Pro-Sites-1440b18c-7596-45f7-aab2-b9e3d2f5aa1f-scratchpad-hookprobe/memory — 0 files
- ~/.claude/projects/-Users-jermainewatkins/memory — 3 files, last modified 2026-09-11
- ~/.claude/projects/-Users-jermainewatkins-Code/memory — 0 files
- ~/.claude/projects/-Users-jermainewatkins-Documents-Documents---Jermaine-s-MacBook-Pro-Sites/memory — 5 files, last modified 2026-09-25
- ~/.claude/projects/-Users-jermainewatkins-Documents-Sites/memory — 33 files, last modified 2026-09-24
- ~/.claude/projects/-Users-jermainewatkins-Library-Application-Support-assistance-agent/memory — 0 files
- ~/.claude/projects/-Users-jermainewatkins-Library-Application-Support-assistance-triage/memory — 311 files, last modified 2026-09-26

## Duplicates / clutter (info only)

- Same git remote `github.com/stellasvenue/core`: core, gb-platform
- Same git remote `github.com/smart-calltime-solutions-llc/smartcalltimemonorepo`: SmartCalltimeMonorepo, SmartCalltimeMonorepo-S09, SmartCalltimeMonorepo-sentry
- SmartCalltimeMonorepo-S09: linked git worktree of SmartCalltimeMonorepo
- SmartCalltimeMonorepo-sentry: linked git worktree of SmartCalltimeMonorepo
- assistance: canonical at ~/Code/assistance; also reachable via ~/Documents/Documents - Jermaine’s MacBook Pro/Sites/assistance (symlink)
- deal-watch: canonical at ~/Code/deal-watch; also reachable via ~/Documents/Documents - Jermaine’s MacBook Pro/Sites/deal-watch (symlink)
- youtube-knowledge: canonical at ~/Code/youtube-knowledge; also reachable via ~/Documents/Documents - Jermaine’s MacBook Pro/Sites/youtube-knowledge (symlink)
- owlthat-hq: holds 18 linked worktree folders (core-dropbox-sharing, core-keylessA, core-loop4, core-mailgun-ralph, core-pages-health, core-s04a, cortex-gatefix-ads, cortex-gatefix-browserop, cortex-gatefix-import, cortex-gatefix-meta, cortex-gatefix-scantruth, cortex-mailgun-ralph, cortex-mpml-s06, cortex-mpml-s08, cortex-mpml-s09, cortex-pages-fix, cortex-pages-ralph, cortex-release3)
- "awstest": scratch
- "review ": name-has-surrounding-whitespace
- "test": scratch
- "testge": scratch, empty
- "worktrees": worktree-container, empty
- "xxx": scratch
- abrl.org: git repo with no commits (or unreadable log)
- kindred: git repo with no commits (or unreadable log)
- mychart: git repo with no commits (or unreadable log)
- paytons-place-week1-reel: git repo with no commits (or unreadable log)
- wiki: git repo with no commits (or unreadable log)
- skipped .agents: hidden/tooling directory
- skipped .claude: hidden/tooling directory
- skipped .process-fixes-2026-09-23: hidden/tooling directory

## Scanner caveats

- cos_work_mentions is a case-insensitive whole-word match of the folder name against cos_work.goal/title (11 items); generic names (e.g. core, voice, test) can over-match and projects referred to by other names are missed. Names under 3 chars are not matched. Matches on a name that is also a sub-repo of another project (e.g. core vs owlthat-hq/core) go to cos_work_ambiguous_ids and do not count toward cos_work_mentions or active.
- Folder mtimes were not used for activity: most Sites folders show Sep 23-24 2026 mtimes, consistent with a bulk move, so they are not a reliable signal.
- short_description is taken verbatim from the first prose line of CLAUDE.md, then README, then package.json description; it may describe tooling rather than the product.
- duplicate-of is only set for linked git worktrees or name-suffix variants sharing a git remote; same-remote-as lists every other folder with the same remote without choosing a canonical one.
- 28 project folders are not git repo roots; their activity depends only on memory/CoS signals.
