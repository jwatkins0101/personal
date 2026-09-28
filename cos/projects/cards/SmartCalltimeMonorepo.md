# SmartCalltimeMonorepo
_Card for CoS sub-agent briefs. Built 2026-09-26 from the Sources below; hand-maintained, build-index.mjs never overwrites it._

## What it is
SCTS (Smart Call Time Solutions): an AI-powered political fundraising call coaching platform built on the Blue Dot Methodology (BDM) (CLAUDE.md, README.md). Folder also holds client business docs (business plan, TCPA memo, MSA/SOW with OwlThat Inc).

## Paths
- Project: `/Users/jermainewatkins/Documents/Documents - Jermaine’s MacBook Pro/Sites/SmartCalltimeMonorepo` (also reachable via `~/Documents/Sites/SmartCalltimeMonorepo`)
- CLAUDE.md: `<project>/CLAUDE.md` (product rules) + `<project>/.claude/CLAUDE.md` (agent pipelines)
- README: `<project>/README.md`; product wiki: `<project>/wiki/` (key: `wiki/product/domain-model.md`)
- Memory: `/Users/jermainewatkins/.claude/projects/-Users-jermainewatkins-Documents-Sites-SmartCalltimeMonorepo/memory/` (index `MEMORY.md`, 7 files)
- Worktrees (same remote): `Sites/SmartCalltimeMonorepo-S09` (branch feature/19-onboarding-tutorial-S09, last commit 2026-04-16), `Sites/SmartCalltimeMonorepo-sentry` (chore/sentry-cleanup-2026-05-08, 2026-05-09), 60 agent worktrees under `<project>/.claude/worktrees/`, one under `Sites/.process-fixes-2026-09-23/SmartCalltimeMonorepo` (`git worktree list`)
- Backup: `Sites/SmartCalltimeMonorepo-backup-2026-07-02.zip` (72 MB)
- Harness: `<project>/.claude/harness` -> softwareharness release 6d9f21ea (pinned)

## Stack & how to run/test
- npm workspaces + Turborepo; React 18/Vite/shadcn frontend; AWS Lambda (Node 20/TS) behind REST API Gateway; Aurora Serverless v2 Postgres with RLS; Cognito; OpenAI GPT-4o primary, Anthropic fallback; Twilio Voice; AWS CDK (CLAUDE.md)
- `npm run dev` (frontend :8080), `npm run wiki` (:4000), `npm run test`, `npm run typecheck`, `npm run turbo:test|turbo:lint|turbo:typecheck`, `npm run cdk:synth`, `npm run cdk:deploy:dev`, `npm run db:migrate` (package.json, README.md)
- Deploy: push to main -> dev; `v*-rc.*` tag -> staging; `v*` tag -> production; Rollback workflow in GitHub Actions (CLAUDE.md)

## Accounts, services & IDs
- AWS account 676963688411, us-east-1, always `AWS_PROFILE=scts` (CLAUDE.md)
- GitHub: `Smart-Calltime-Solutions-LLC/SmartCalltimeMonorepo` (git remote)
- OpenAI key in Secrets Manager at `scts/<stage>/openai-api-key` (path only) (CLAUDE.md)
- Twilio account "SmartCallTimeSolutions"; subaccounts scts-dev/staging-principal-*; account SID in the triage memory file (twilio-smartcalltime-billing.md, twilio-dormant-subaccount-notice.md)
- Email domain smartcalltimesolutions.com; Read AI meeting reports "SCTS check in" (smartcalltime-work-contact.md, readai-meeting-reports.md)

## People
- Asa King (asa@smartcalltimesolutions.com) and Taylor Coots (taylor@smartcalltimesolutions.com), work colleagues who email about production infrastructure (triage memory smartcalltime-work-contact.md)
- Taylor Coots and Kay Holt at bluedotconsulting.us (triage memory bluedotconsulting-contact.md)

## Status
- Last commit: 2026-09-23 7c2f27c2 "docs: remove obsolete instruction to stash pre-existing work". Note: the last 3 commits (2026-09-23) are harness process-enforcement chores; last product commit 2026-06-15 c8ab700e "docs(checklist): add 2026-06-15 EOD status block (verdict off NO-GO ...)"
- Open cos_work items: none

## Gotchas / decisions
- TCPA: click-to-dial only, no auto-dial, no AI audio to recipients, 8AM-9PM donor local time, immutable compliance_audit_log (CLAUDE.md)
- Canonical entity names: principal (not campaign), interaction (not call), disposition (not status) (CLAUDE.md, wiki/product/domain-model.md)
- Check AWS credentials/SSO before any CDK/CLI op; prompt if expired (CLAUDE.md)
- Parallel story-runners need `isolation: "worktree"` and must never write to absolute main-repo paths (memory/feedback_parallel_runner_isolation.md)
- Orchestrator subagents cannot dispatch subagents; run dispatch loop top-level (memory/feedback_orchestrator_subagent_limit.md)
- No workarounds; verify at runtime, not test counts; delete dead code end-to-end (memory/feedback_no_workarounds.md, feedback_clean_up_dead_code.md)
- Twilio suspension without a funding confirmation = live outage, ACTION + star (triage memory twilio-smartcalltime-billing.md)

## Gaps
- Current engagement status unknown: no product commits since 2026-06-15; the 2026-06-15 checklist mentions a NO-GO verdict. Is SCTS live, paused, or ended?
- Jermaine's role (contractor via OwlThat Inc per MSA/SOW PDFs in folder, not read) unverified
- Whether 60 `.claude/worktrees` and S09/sentry worktrees can be pruned
- memory/project_ralph_package.md describes an older symlink install of softwareharness; now pinned-release install (see softwareharness card)

## Sources
- `<project>/CLAUDE.md`, `<project>/.claude/CLAUDE.md` (head), `<project>/README.md`, `<project>/package.json`; `git log`, `git worktree list`
- memory: MEMORY.md, feedback_clean_up_dead_code.md, feedback_no_workarounds.md, feedback_orchestrator_subagent_limit.md, feedback_parallel_runner_isolation.md, feedback_stop_asking.md, project_ralph_package.md
- `~/.claude/projects/-Users-jermainewatkins-Library-Application-Support-assistance-triage/memory/`: smartcalltime-work-contact.md, bluedotconsulting-contact.md, twilio-smartcalltime-billing.md, twilio-dormant-subaccount-notice.md, readai-meeting-reports.md (grep)
