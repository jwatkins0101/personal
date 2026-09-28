# bouvier-bridge
_Card for CoS sub-agent briefs. Built 2026-09-26 from the Sources below; hand-maintained, build-index.mjs never overwrites it._

## What it is
Website for the American Bouvier Rescue League (ABRL), a nonprofit dog rescue; a React SPA built with Vite, TypeScript, Tailwind CSS and shadcn/ui (CLAUDE.md). A redesign/rebuild of abrl.org for a 501(c)(3) volunteer-run Bouvier des Flandres rescue founded in 1981, with simple content management for non-technical volunteers (memory project_abrl_overview.md).

## Paths
- Project: /Users/jermainewatkins/Documents/Documents - Jermaine’s MacBook Pro/Sites/bouvier-bridge
- CLAUDE.md: <project>/CLAUDE.md
- README: <project>/README.md (Lovable template, "TODO: Document your project here")
- Infra runbook: <project>/infra/README.md (AWS CDK app); DNS lives in <project>/infra/lib/abrl-site-stack.ts
- Memory: /Users/jermainewatkins/.claude/projects/-Users-jermainewatkins-Documents-Sites-bouvier-bridge/memory/ (index MEMORY.md, 6 files)
- Related docs outside repo: /Users/jermainewatkins/Documents/Sites/assistance/docs/abrl-icp-research.md, /Users/jermainewatkins/Documents/Sites/assistance/docs/session-summary-2026-03-21.md (memory reference_*.md; not opened)

## Stack & how to run/test
- Vite + React + TypeScript + Tailwind + shadcn/ui; React Router v6; Vitest + jsdom + RTL; Playwright configured (CLAUDE.md)
- `npm run dev` (port 8080), `npm run build`, `npm run lint`, `npm run test`, `npm run test:watch` (CLAUDE.md, package.json)
- Pre-push gate: `npm run lint && npm run test && npm run build` (CLAUDE.md)
- Infra: `cd infra && npm install && export AWS_PROFILE=abrl && npx cdk diff AbrlSiteStack` (infra/README.md)

## Accounts, services & IDs
- AWS account 517973842544 (dedicated ABRL account), region us-east-1 (infra/README.md; memory project_abrl_aws_infra.md)
- Local deploy profile `abrl`, IAM user `cdci` (assumes CDK bootstrap roles only) (infra/README.md)
- Prod: www.abrl.org, stack `AbrlSiteStack`, bucket `abrl-org-site`, role `abrl-github-deploy-prod`, released by `v*` tag (infra/README.md)
- Dev: dev.abrl.org, stack `AbrlDevStack`, bucket `abrl-org-site-dev`, role `abrl-github-deploy-dev`, deployed on merge to main (infra/README.md)
- CloudFront addresses in use before custom domain: prod d2xtech45kdne8.cloudfront.net, dev d3j9o82cp0sc6y.cloudfront.net (infra/README.md)
- Route 53 zone for abrl.org; registrar GoDaddy; live email on MXroute (memory project_abrl_aws_infra.md, infra/README.md)
- GitHub repo jwatkins0101/bouvier-bridge; secrets `AWS_DEPLOY_ROLE_ARN_DEV` / `AWS_DEPLOY_ROLE_ARN_PROD` (.github/workflows/deploy-*.yml)
- Planned: Stripe nonprofit (replacing PayPal), Resend for foster alerts, Supabase later, SES for form email, reCAPTCHA via SSM `/abrl/recaptcha-secret` (memory project_abrl_overview.md, project_pending_actions.md)
- Lovable workspace invite from the client (triage memory abrl-colleen-bell-client.md)

## People
- Colleen Bell — ABRL client contact; email addresses in triage memory abrl-colleen-bell-client.md
- Colleen — preview link sent 2026-08-01; owes GoDaddy NS change and per-form recipients (memory project_pending_actions.md)

## Status
- Last commit: 2026-03-21 0fb9ca9 "Optimize images to WebP"
- Working tree has uncommitted edits plus untracked `.github/` and `infra/` (git status, 2026-09-26) — the deploy workflows and CDK app are not committed
- Open cos_work items: none

## Gotchas / decisions
- Never add abrl.org DNS records via console/CLI; they are dropped on next `cdk deploy`. Edit infra/lib/abrl-site-stack.ts; check mail impact first (memory project_abrl_aws_infra.md)
- Blocker: abrl.org nameservers must be switched at GoDaddy before CDK phase 2; running it early hangs ~90 min then rolls back (infra/README.md; memory project_pending_actions.md)
- Prod IAM trust accepts only `refs/tags/v*`; release = push a v* tag, rollback = re-tag a good sha (infra/README.md)
- Production forms fail closed (503) until reCAPTCHA secret/site key are set; all forms default to info@abrl.org (memory project_pending_actions.md)
- Budget $2,500-3,500 nonprofit rates; WCAG 2.1 AA; no filters/search on dog listings; "Happy Tails" not "Blog" (memory project_abrl_overview.md)
- Client mail and Lovable invites from ABRL are ACTION, never routed out (triage memory abrl-colleen-bell-client.md)

## Gaps
- Is the site live on www.abrl.org yet? Pending list is dated 2026-08-01; nothing newer found
- Whether `.github/` and `infra/` are meant to be committed (currently untracked)
- SOW/proposal status and Stripe setup not verified
- Last commit is March; active flag comes only from memory mtime (2026-08-01)

## Sources
- <project>/CLAUDE.md, README.md, package.json, infra/README.md, .github/workflows/deploy-dev.yml, deploy-prod.yml; git log/status
- memory/MEMORY.md, user_role.md, project_abrl_overview.md, project_pending_actions.md, project_abrl_aws_infra.md, reference_session_summary.md, reference_icp_research.md
- /Users/jermainewatkins/.claude/projects/-Users-jermainewatkins-Library-Application-Support-assistance-triage/memory/abrl-colleen-bell-client.md (+ grep hits in promo-sender-ledger.md, gws-auth-revoked-gmail-mcp-fallback.md)
