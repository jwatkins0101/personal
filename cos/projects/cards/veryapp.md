# veryapp
_Card for CoS sub-agent briefs. Built 2026-09-26 from the Sources below; hand-maintained, build-index.mjs never overwrites it._

## What it is
The VERY Health platform: a full-stack healthcare management app (patient roster, clinical alerts, Chime telehealth video, messaging, reports) on AWS serverless with React/TypeScript (README.md). VERY Health is an eating disorder treatment provider (veryweb README.md); the app is single-tenant, one org `very-health` (memory/single-tenant-model.md).

## Paths
- Project: `/Users/jermainewatkins/Documents/Documents - Jermaine’s MacBook Pro/Sites/veryapp`
- CLAUDE.md: `<project>/CLAUDE.md`; README: `<project>/README.md`, also `README.docs.md`, `PLAN.md`, `TESTING-CHECKLIST.md`, `docs/`
- Memory: `/Users/jermainewatkins/.claude/projects/-Users-jermainewatkins-Documents-Sites-veryapp/memory/` (index `MEMORY.md`, 10 files)
- Orphan memory (old folder name `very`): `/Users/jermainewatkins/.claude/projects/-Users-jermainewatkins-Documents-Sites-very/memory/MEMORY.md` (contains dev test credentials; reference only)
- Sibling: marketing site is `veryweb` (memory/veryhealth-marketing-site-deploy.md)

## Stack & how to run/test
- AWS CDK monorepo: `infra/`, `cdk/`, `services/*`, `shared/`, `frontend/`; AppSync GraphQL, Lambda, EventBridge, DynamoDB single table, Amplify auth, Chime SDK (CLAUDE.md, README.md)
- `npm run build`, `npm run test`, `npm run cdk -- synth|deploy` (CLAUDE.md, package.json)
- CI deploys the `cdk/` app (`cdk/bin/cdk.ts`), NOT `infra/`; stack changes go in `cdk/lib/stacks/*` (CLAUDE.md)

## Accounts, services & IDs
- GitHub: `veryhealth/very-path-forward` (git remote; memory/veryhealth-marketing-site-deploy.md)
- AWS account 157158624382 us-east-1 via `AWS_PROFILE=veryhealth` (IAM user cdci, no Secrets Manager read); default local profile is a different account 441955302496 (memory/veryhealth-aws-access.md)
- Stacks: VeryHealth-dev-BackendInfra / BackendSystem / BackendApi (orphan memory very/MEMORY.md)
- Prod Cognito pool `us-east-1_Iw0kAE36R` (memory/prod-cognito-quirks.md)
- Sentry project `veryhealthapp`, org `techunify-k7`; DSN via SSM `/very-health/{stage}/sentry-dsn` (value in memory/sentry-config-gap.md, not copied)
- Google Calendar: service account + domain-wide delegation, secret `/very-health/{stage}/google-calendar-credentials`; intake calendar keeley@very.health (memory/gsuite-calendar-approach.md, erin-knopf-product-asks.md)
- Valant EMR (contract ends 2026-10-01); clearinghouse Waystar (memory/valant-contract-deadline.md)

## People
- Erin Knopf, MD (drknopf@very.health), co-founder and Chief Medical Officer, primary clinical stakeholder (memory/erin-knopf-product-asks.md)
- Keeley Morris (keeley@very.health), intake calendar owner (memory/gsuite-calendar-approach.md; triage very-health-l10-reminders.md)

## Status
- Last commit: 2026-08-05 68f17e9 "fix(frontend): resolve Sentry issues 27-29 — clickable weekly day cards, feedback dialog API, network listener guard" (v1.18.1 per memory)
- Open cos_work items: none

## Gotchas / decisions
- Valant EMR contract ends 2026-10-01 (5 days from build date): cutover of notes/billing/eRx is the critical path (memory/valant-contract-deadline.md)
- Erin's open asks: AI note assist (build vs Soulside) and a concrete launch ETA (memory/erin-knopf-product-asks.md)
- Calendar model: free/busy + portal->Google mirroring + display-only Google->portal; keep "VERY Health" summary prefix (dedup key); use `clinicTimeToUtc` (memory/gsuite-calendar-approach.md)
- Prod Cognito has double-prefixed custom attrs; roles come from DynamoDB `me` query, not token claims (memory/prod-cognito-quirks.md)
- Single-tenant: `ORG_ID='very-health'`, never read org from client; use `getCaller`/`assertCanAccessPatient` guards (memory/single-tenant-model.md)
- Batch related fixes, run build/test/synth before pushing (CLAUDE.md)

## Gaps
- Valant decision: extension signed or cutover plan? (memory says verbal, unverified)
- Whether Sentry DSN SSM param was ever set in 157158624382 (memory/sentry-config-gap.md undated)
- Launch ETA and AI note assist decision still open per memory (last update 2026-08-06)
- Commercial relationship (Jermaine's role; triage lane "techunify" may relate, unverified)

## Sources
- `<project>/CLAUDE.md`, `<project>/README.md` (head), `<project>/package.json`; `git log`
- memory: MEMORY.md, erin-knopf-product-asks.md, gsuite-calendar-approach.md, prod-cognito-quirks.md, qa-findings-2026-07-24.md (head), sentry-config-gap.md, single-tenant-model.md, valant-contract-deadline.md, veryhealth-aws-access.md, veryhealth-marketing-site-deploy.md
- orphan: `~/.claude/projects/-Users-jermainewatkins-Documents-Sites-very/memory/MEMORY.md`
- triage memory: very-health-l10-reminders.md
