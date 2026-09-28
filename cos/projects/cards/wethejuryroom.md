# wethejuryroom
_Card for CoS sub-agent briefs. Built 2026-09-26 from the Sources below; hand-maintained, build-index.mjs never overwrites it._

## What it is
We The Jury Room: a mobile-first juror simulation game where players review fictional court cases, evaluate evidence, deliberate via Clubhouse-style async voice notes, and render verdicts (memory/project_overview.md). Bootstrapped, dual B2C (ads, premium) / B2B (anonymized jury data for law firms) revenue model (memory/user_profile.md).

## Paths
- Project: `/Users/jermainewatkins/Documents/Documents - Jermaine’s MacBook Pro/Sites/wethejuryroom`
- CLAUDE.md: `<project>/CLAUDE.md` (+ `AGENTS.md`, auto-loaded `.claude/rules/`)
- README: `<project>/README.md` (Lovable placeholder, no content)
- Memory: `/Users/jermainewatkins/.claude/projects/-Users-jermainewatkins-Documents-Sites-wethejuryroom/memory/` (index `MEMORY.md`, 3 files present)
- Docs: `docs/business/` (lean-canvas, revenue-model, icp, gtm), `docs/system/`, `docs/SOPs/`
- Worktree: one under `Sites/.process-fixes-2026-09-23/wethejuryroom` (git worktree list)

## Stack & how to run/test
- Turborepo: `apps/web` (React 18/Vite/Tailwind/shadcn, Zustand), `apps/marketing` (Astro), `apps/wiki` (Astro Starlight), `packages/shared`, `infra/` (CDK v2), `ops/analytics` (GA4 CLI); Cognito, AppSync GraphQL + subscriptions, DynamoDB single table; GA4 + PostHog (CLAUDE.md)
- `turbo dev --filter=@wethejury/web`, `turbo build`, `turbo test`, `turbo lint`; `cd infra && npm run synth|deploy` (CLAUDE.md, package.json)
- `npm run ga:audit|ga:score|ga:report|ga:wiki -- --env=prod` (CLAUDE.md)
- Run `aws sts get-caller-identity` before any CDK/AWS op (CLAUDE.md)

## Accounts, services & IDs
- Domain: wethejuryroom.com (CLAUDE.md, memory/project_overview.md)
- GitHub: `jwatkins0101/wethejuryroom` (git remote)
- AWS: separate account from core-app (OwlThat); stacks WeTheJuryTables, WeTheJuryAuth, WeTheJuryApi; prefix `wethejury`; stage `dev` (memory/project_overview.md)
- CI: GitHub Actions with GA4 WIF auth (CLAUDE.md)

## People
- none named in sources (memory describes Jermaine as solo founder)

## Status
- Last commit: 2026-09-23 5192fee "Merge pull request #29 from jwatkins0101/fix/process-enforcement-2026-09-23" (process/CI sweep); last product commit 2026-03-27 6a353de "feat: instrument full analytics pipeline (13 new events + error boundary)"
- Open cos_work items: none

## Gotchas / decisions
- Fully fictional cases (legal safety); async voice deliberation, not live chat (memory/project_overview.md)
- Reuse core-app (OwlThat) patterns: VTL-first resolvers, single-table DynamoDB, Cognito JWT, SSM params (memory/project_overview.md)
- AppSync-only API, AWS SDK v3 only, inline GraphQL strings, CI must stay green (CLAUDE.md rules table)
- Default to full Ralph pipeline for non-trivial work: plan -> stories -> GitHub Projects sync -> autonomous run (memory/feedback_workflow.md)
- Migration scripts in `ops/` only against the stage named in `AWS_PROFILE` (.claude/rules/deployment-verification.md)

## Gaps
- AWS account ID and profile name not stated in sources
- Is the product live at wethejuryroom.com or dormant? No product commits since March 2026
- MEMORY.md lists `plan_custom_cognito_domain.md` but the file is missing from the memory folder
- README is a Lovable placeholder

## Sources
- `<project>/CLAUDE.md`, `<project>/README.md`, `<project>/package.json`, `<project>/.claude/rules/deployment-verification.md` (grep); `git log`, `git worktree list`
- memory: MEMORY.md, project_overview.md, user_profile.md, feedback_workflow.md
