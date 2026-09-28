# reelectmccraney
_Card for CoS sub-agent briefs. Built 2026-09-26 from the Sources below; hand-maintained, build-index.mjs never overwrites it._

## What it is
Re-Elect McCraney campaign website: static site hosted on AWS S3 + CloudFront with automated deployments via GitHub Actions (README.md). Page title: "Re-elect Dr. Paula McCraney | Louisville Metro Council District 7" (src/index.html).

## Paths
- Project: /Users/jermainewatkins/Documents/Documents - Jermaine’s MacBook Pro/Sites/reelectmccraney
- CLAUDE.md: none
- README: <project>/README.md
- Site source: <project>/src/ (index, about, contact, district7, donate, issues, news, privacy, record, volunteer .html); placeholder at <project>/coming-soon/
- Infra: <project>/infra/ (AWS CDK; lib/static-site-stack.ts)
- Memory: none mapped in inventory

## Stack & how to run/test
- Static HTML/CSS/JS; CDK in infra/ (README.md)
- Dev deploy: push to `main`; prod deploy: push a `v*` tag (README.md, .github/workflows/deploy-*.yml)
- Manual: `cd infra && npx cdk deploy ReelectMcCraney-Dev` / `ReelectMcCraney-Prod` / `--all` (README.md)
- No test command stated

## Accounts, services & IDs
- AWS account 153876893111, region us-east-1 (README.md)
- IAM role `GitHubActions-ReelectMcCraney` (OIDC, repo jwatkins0101/reelectmccraney) (README.md)
- Stacks `ReelectMcCraney-Dev`, `ReelectMcCraney-Prod`; bucket/distribution resolved from stack outputs (deploy-dev.yml, deploy-prod.yml)
- Domains: dev.reelectmccraney.com (dev), reelectmccraney.com (prod) (README.md)
- GitHub secrets `AWS_ROLE_ARN`, `AWS_ACCOUNT_ID`; GitHub environments `dev` / `prod` (README.md, workflows)

## People
- Dr. Paula McCraney — candidate named in site title (src/index.html)

## Status
- Last commit: 2026-06-28 5adeff8 "CI: bump aws-actions/configure-aws-credentials v5->v6 (Node 24 runtime)"; working tree clean
- 2026-06-24 097a662 "Go live: deploy full site (src/) to production instead of coming-soon" (git log)
- Open cos_work items: none

## Gotchas / decisions
- Prod releases only via `v*` tags; `main` goes to dev (README.md)
- The README's IAM setup attaches broad managed policies (S3/CloudFront/CloudFormation/IAM FullAccess) to the deploy role (README.md)
- Custom domain requires Route 53 hosted zone ID + ACM cert passed as CDK context (README.md)
- Build step is just `cp -r src/* dist/`; no bundler (deploy-dev.yml)

## Gaps
- No CLAUDE.md or memory: client relationship, election date, who approves content, and whether the site is still maintained after the campaign are unknown
- Whether AWS account 153876893111 is Jermaine's or the campaign's is not stated
- Custom-domain/DNS status not verified

## Sources
- <project>/README.md, src/index.html (title only), .github/workflows/deploy-dev.yml, deploy-prod.yml, infra/lib listing; git log/status
