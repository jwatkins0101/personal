# veryweb
_Card for CoS sub-agent briefs. Built 2026-09-26 from the Sources below; hand-maintained, build-index.mjs never overwrites it._

## What it is
Marketing website for VERY Health (https://very.health), an eating disorder treatment provider; React/TypeScript/Tailwind, deployed to AWS S3 + CloudFront (README.md). Staff request changes via a "Website Edits" Google Sheet (memory/website-edits-sheet.md).

## Paths
- Project: `/Users/jermainewatkins/Documents/Documents - Jermaine’s MacBook Pro/Sites/veryweb`
- CLAUDE.md: none; README: `<project>/README.md`; also `SITE-REPLICATION-PLAN.md`, `docs/`, `scripts/deploy.sh`
- Memory: `/Users/jermainewatkins/.claude/projects/-Users-jermainewatkins-Documents-Sites-veryweb/memory/` (MEMORY.md, 2 files) and `/Users/jermainewatkins/.claude/projects/-Users-jermainewatkins-Documents-Documents---Jermaine-s-MacBook-Pro-Sites-veryweb/memory/` (MEMORY.md, 3 files)
- Orphan memory (old folder name `very-health-hub`): `/Users/jermainewatkins/.claude/projects/-Users-jermainewatkins-Documents-Sites-very-health-hub/memory/` (MEMORY.md, project_launch_feedback.md, reference_deployment.md)
- Sibling: app platform is `veryapp` (memory/veryhealth-marketing-site-deploy.md in veryapp memory)

## Stack & how to run/test
- React 18 + Vite 5 + Tailwind + shadcn/ui, React Router v6, Vitest; Node 20+ (README.md)
- `npm run dev` (:8080), `npm run build`, `npm run test`, `npm run lint`, `npm run sitemap:check`, `npm run deploy` (dev), `npm run deploy:prod` (package.json)
- Push to `main` -> dev.very.health; push `v*` tag -> very.health prod via `.github/workflows/deploy.yml` (README.md, memory/website-edits-sheet.md)

## Accounts, services & IDs
- GitHub: `veryhealth/very-health-hub` (git remote; README clone line says `veryhealth/very.health.git`, mismatch)
- AWS account 157158624382 us-east-1; S3 `very-health-marketing-dev` / `-prod`; CloudFront dev E2LTCTX2MEZH5U, prod EMCU7AR1Q66Q0; IAM deploy user `very-health-marketing-deploy` (orphan very-health-hub/memory/reference_deployment.md, README.md)
- Infra is managed via CDK in the main app repo, not here (README.md)
- Website Edits sheet owned by The Johnson Law Group shared drive; URL in memory/website-edits-sheet.md
- Drive account u/1 = jermaine@very.health for new-hire bio/headshot folders (memory/website-edits-drive-assets.md)
- Lovable auto-commits to main as `gpt-engineer-app[bot]` (veryapp memory/veryhealth-marketing-site-deploy.md)

## People
- Staff named in team-page work: Christina Negrete (not "Christine"), Emily Mickley, Makenzie Johnson, Sarah Lea (memory/website-edits-sheet.md; git log)
- Keeley Morris (keeley@very.health), asked for recovery-coach page blurbs (triage very-health-l10-reminders.md); calendar link owner (orphan project_launch_feedback.md)

## Status
- Last commit: 2026-09-24 bf787a4 "Add Christina Negrete, Emily Mickley, and Makenzie Johnson to the team"
- Last prod tag noted in memory: v1.5.13 (2026-08-28) (memory/website-edits-sheet.md)
- Open cos_work items: none

## Gotchas / decisions
- Website Edits sheet: keep dev links only (column G); team drops "dev." for prod (memory/website-edits-no-prod-links.md)
- Sheet renders on canvas; CSV export trick no longer works; read via screenshot+zoom; chip links must be pasted by the user (memory/website-edits-sheet.md)
- Drive folders: try u/1 home + search before concluding no access (memory/website-edits-drive-assets.md)
- Lovable adds deps without updating package-lock.json, breaking `npm ci` dev deploys; fix with `npm install` + commit lockfile (veryapp memory/veryhealth-marketing-site-deploy.md)
- A tag ships everything on main since last tag; smoke-test prod after tagging (same source)
- "Get Care" form was not HIPAA compliant and did not flow into the platform (orphan project_launch_feedback.md, 2026-03-19)

## Gaps
- Whether HIPAA form/platform-intake feedback (March 2026) was resolved
- Whether commits since v1.5.13 are on prod (no tag check done)
- Current open rows on the Website Edits sheet (not read)

## Sources
- `<project>/README.md`, `<project>/package.json`; `git log`
- memory (short path): MEMORY.md, website-edits-sheet.md; memory (long path): MEMORY.md, website-edits-drive-assets.md, website-edits-no-prod-links.md
- orphan very-health-hub memory: MEMORY.md, project_launch_feedback.md, reference_deployment.md
- veryapp memory: veryhealth-marketing-site-deploy.md; triage memory: very-health-l10-reminders.md
