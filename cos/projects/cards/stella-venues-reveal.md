# stella-venues-reveal
_Card for CoS sub-agent briefs. Built 2026-09-26 from the Sources below; hand-maintained, build-index.mjs never overwrites it._

## What it is
Website for Stella's Venue, "Louisville's true waterfront event space at 1346 River Road — one room for up to 184 guests, one event per day" (index.html meta description). Stella's Venue is Jermaine's Louisville, KY event-venue business (workspace memory project_stellas_venue_taxes.md). README is the unmodified Lovable template; no repo description found beyond index.html.

## Paths
- Project: /Users/jermainewatkins/Documents/Documents - Jermaine’s MacBook Pro/Sites/stella-venues-reveal
- CLAUDE.md: none
- README: <project>/README.md (Lovable template)
- Pages: <project>/src/pages/ (Index, Venues, Pricing, Gallery, FAQ, Contact, events/); i18n en/es in src/locales/
- Memory: no project memory dir; business context in /Users/jermainewatkins/.claude/projects/-Users-jermainewatkins-Documents-Sites/memory/project_stellas_venue_taxes.md
- Related folder (not this repo): ~/Documents/Sites/stellascorp/tax-prep/ (project_stellas_venue_taxes.md)

## Stack & how to run/test
- Vite + TypeScript + React + shadcn-ui + Tailwind (README.md)
- `npm run dev`, `npm run build`, `npm run lint`, `npm run preview` (package.json); no test script
- Push to `main` or `develop` builds and syncs to S3 + CloudFront invalidation (.github/workflows/main.yml)

## Accounts, services & IDs
- Lovable project 794c2eef-9864-48d6-91b6-1c00252a00b2 (README.md)
- S3 bucket `stellasvenue.com`, us-east-1; CloudFront distribution ID in GitHub secret `CLOUDFRONT_DISTRIBUTION_ID` (main.yml)
- Deploy uses static AWS keys in GitHub secrets `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY` (main.yml) — AWS account not stated
- GitHub repo https://github.com/jwatkins0101/stella-venues-reveal.git (inventory.json)
- Business books in QuickBooks Online (project_stellas_venue_taxes.md)

## People
- Christopher Watkins (chris@stellasvenue.com) — emails about Stella's Venue business (triage memory stellasvenue-real-contact.md); Cash App business account in Christopher Watkins' name (project_stellas_venue_taxes.md)
- Jordan Mason — signed "Stellas MarketingStrategy Contract" (triage memory gws-auth-revoked-gmail-mcp-fallback.md)

## Status
- Last commit: 2026-08-05 0cf584d "Rescope site to single venue with published rate card and policies"; prior 2026-05-15 b693e00 "Restructure pricing tiers with separate Fri/Sat rates"
- Open cos_work items: none

## Gotchas / decisions
- Deploys on both `main` and `develop` to the same prod bucket (main.yml)
- Workflow uses long-lived AWS access keys, not OIDC like the other sites (main.yml)
- Site was rescoped to a single venue with a published rate card (git log 0cf584d)
- Lovable commits land directly in this repo; pushes also flow back to Lovable (README.md)
- Stella's Venue has unfiled 2023–2025 taxes; separate workstream in stellascorp/tax-prep (project_stellas_venue_taxes.md)

## Gaps
- Which AWS account hosts stellasvenue.com; DNS/registrar not stated
- Whether `stella.owlthat.com/workflows` (a Cortex tab seen in triage memory gws-auth-revoked-gmail-mcp-fallback.md) is related to this site — not verified
- No CLAUDE.md or project memory; owner decisions about the site not recorded

## Sources
- <project>/README.md, package.json, index.html, .github/workflows/main.yml, src/ listing; git log
- /Users/jermainewatkins/.claude/projects/-Users-jermainewatkins-Documents-Sites/memory/project_stellas_venue_taxes.md
- /Users/jermainewatkins/.claude/projects/-Users-jermainewatkins-Library-Application-Support-assistance-triage/memory/stellasvenue-real-contact.md, boldsign-contract-notifications.md (grep), gws-auth-revoked-gmail-mcp-fallback.md (grep), promo-sender-ledger.md (grep)
