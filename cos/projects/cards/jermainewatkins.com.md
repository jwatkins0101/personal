# jermainewatkins.com
_Card for CoS sub-agent briefs. Built 2026-09-26 from the Sources below; hand-maintained, build-index.mjs never overwrites it._

## What it is
Static site: home page and the Gmail Triage privacy policy (README.md). It is the Branding home/privacy URL for the "Gmail Triage" Google OAuth app used by the assistance `gws` profiles (workspace memory gmail-triage-oauth-app.md).

## Paths
- Project: /Users/jermainewatkins/Code/jermainewatkins.com (files: index.html, privacy.html, style.css)
- CLAUDE.md: none
- README: /Users/jermainewatkins/Code/jermainewatkins.com/README.md
- Deploy workflow: /Users/jermainewatkins/Code/jermainewatkins.com/.github/workflows/deploy.yml
- Memory: no project memory dir; facts live in workspace memory /Users/jermainewatkins/.claude/projects/-Users-jermainewatkins-Documents-Documents---Jermaine-s-MacBook-Pro-Sites/memory/ (MEMORY.md, jermainewatkins-com-hosting.md, gmail-triage-oauth-app.md)

## Stack & how to run/test
- Plain HTML/CSS, no build (repo contents). Every push to `main` runs deploy.yml: S3 sync, CloudFront invalidation, then curls `/` and `/privacy.html` expecting 200 (deploy.yml)

## Accounts, services & IDs
- AWS account 441955302496, shared with wethejuryroom.com and wrightpaintsllc.com — do not touch those (jermainewatkins-com-hosting.md)
- S3 bucket `jermainewatkins.com-site` (private) behind CloudFront `E1O3YSLNF12KDO` (jermainewatkins-com-hosting.md)
- Route 53 zone `Z02331442SQI6QG2J9W41`; registrar Squarespace Domains, DNSSEC off (jermainewatkins-com-hosting.md)
- GitHub repo jwatkins0101/jermainewatkins.com; OIDC role `jermainewatkins-site-deploy`; repo variables `AWS_ROLE_ARN`, `SITE_BUCKET`, `CF_DISTRIBUTION_ID` (jermainewatkins-com-hosting.md, README.md)
- iCloud custom-domain mail (MX mx01/mx02.mail.icloud.com, DKIM CNAME sig1._domainkey) (jermainewatkins-com-hosting.md)
- Google Search Console verification TXT on apex; backs Gmail Triage OAuth app (GCP project `gmail-triage-494101`) Branding (jermainewatkins-com-hosting.md, gmail-triage-oauth-app.md)

## People
- None named in sources besides Jermaine (owner of the OAuth app per gmail-triage-oauth-app.md)

## Status
- Last commit: 2026-09-25 52bd78b "Deploy to AWS (S3 + CloudFront) from GitHub Actions"; working tree clean
- Open cos_work items: none

## Gotchas / decisions
- Apex TXT set holds three values that must stay together (SPF include:icloud.com, apple-domain, google-site-verification); a Route 53 UPSERT replaces the whole set — read current set and write all values back (jermainewatkins-com-hosting.md)
- Dropping a TXT value silently breaks iCloud mail or the Search Console verification the OAuth app Branding depends on (jermainewatkins-com-hosting.md)
- Site changes go through the repo, not manual S3 uploads (jermainewatkins-com-hosting.md)
- Deploy uses GitHub OIDC; no AWS keys stored in GitHub (deploy.yml)
- Changing privacy.html or the home URL affects the Gmail Triage OAuth app Branding page (gmail-triage-oauth-app.md)

## Gaps
- No CLAUDE.md; no statement of planned content beyond home + privacy page
- Live status not re-verified in this pass (no curl run)

## Sources
- /Users/jermainewatkins/Code/jermainewatkins.com/README.md, .github/workflows/deploy.yml; git log/status
- /Users/jermainewatkins/.claude/projects/-Users-jermainewatkins-Documents-Documents---Jermaine-s-MacBook-Pro-Sites/memory/jermainewatkins-com-hosting.md, gmail-triage-oauth-app.md
