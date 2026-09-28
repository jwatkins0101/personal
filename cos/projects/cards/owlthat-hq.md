# owlthat-hq
_Card for CoS sub-agent briefs. Built 2026-09-26 from the Sources below; hand-maintained, build-index.mjs never overwrites it._

## What it is
OwlThat HQ holds all of OwlThat's repos. The folder itself is not a git repo; each subfolder is its own repo with its own deploy pipeline (CLAUDE.md). Main products: Cortex, "the SaaS app customers use (self-hosted company-agent platform)", and core, the "Hosted brain / control plane — model-key proxy, licensing, telemetry, admin" (CLAUDE.md). Each customer runs on their own Cortex "box" (memory fleet-status-check.md).

## Clients
- guardianowldigital: Guardian Owl Digital (Jenna), an OwlThat client on its own Cortex box; see cards/guardianowldigital.md (Jermaine, 2026-09-26)

## Paths
- Folder: `/Users/jermainewatkins/Documents/Documents - Jermaine’s MacBook Pro/Sites/owlthat-hq` (not git; run git inside subfolders)
- CLAUDE.md: `<folder>/CLAUDE.md` · README: `<folder>/README.md` (stale on brand color) · `website/CLAUDE.md`; READMEs in core/, cortex/, docs/, mobile/, website/, sensei-console/
- Memory (main): `~/.claude/projects/-Users-jermainewatkins-Documents-Sites-owlthat-hq/memory/` (index `MEMORY.md`, ~114 files)
- Memory (other): `...-Documents-Documents---Jermaine-s-MacBook-Pro-Sites-owlthat-hq/memory/` (fleet-status-check.md); `...-Documents-Sites-owlthat-hq-core/memory/` (17 files, early July: pivot, control plane, deck); `...-Documents-Sites-owlthat-hq-cortex/memory/` (empty)
- ORPHAN memory: `~/.claude/projects/-Users-jermainewatkins-Documents-Sites-owlthat/memory/`, 17 files byte-identical to the owlthat-hq-core memory (old path `Sites/owlthat`)
- Subrepos (GitHub org OwlThat): `core/` (OwlThat/core), `cortex/` (OwlThat/cortex), `website/` (OwlThat/owlthat-website), `mobile/` (OwlThat/mobile), `docs/` (OwlThat/docs, PRIVATE), `sensei-console/` (OwlThat/sensei-console), `.github/`; `marketing/` is local only
- Linked worktrees: core-{dropbox-sharing, keylessA, loop4, mailgun-ralph, pages-health, s04a}; cortex-{gatefix-ads, gatefix-browserop, gatefix-import, gatefix-meta, gatefix-scantruth, mailgun-ralph, mpml-s06, mpml-s08, mpml-s09, pages-fix, pages-ralph, release3}; `.worktrees/cortex-forest-palette`. Memory workspace_overview.md calls them "stale", each about 1 GB of node_modules.

## Stack & how to run/test
- core: npm workspaces `service/` (Lambda) + `infra/` (CDK). Test with `npm run test -w service`. Deploy with `AWS_PROFILE=owlthat npm run deploy:dev -w infra` (or `deploy:prod`). There is no CI deploy: merged is not deployed (CLAUDE.md; memory owlthat-aws-profiles.md).
- cortex: Next.js 15 + Prisma + BullMQ worker, Docker Compose. Commands: `npm run dev | worker:dev | build | typecheck | lint | test`; prisma generate/migrate. Deploys via GH Actions → GHCR → `ops/deploy-pull.sh` (CLAUDE.md; owlthat-aws-profiles.md).
- website: Vite/React, prerendered; a push to main auto-deploys owlthat.com. mobile: SwiftUI, `xcodegen generate` (CLAUDE.md).

## Accounts, services & IDs
- core AWS account 756493389453; profile `owlthat` (cicd) works, `owlthat-admin` token is dead (CLAUDE.md; owlthat-aws-profiles.md)
- Lightsail boxes in us-east-2: `cortex-prod-1` → cortex.owlthat.com (demo/builder), `cortex-owlthat-hq-1` → hq.owlthat.com (owlthat-aws-profiles.md; owlthat-hq-box.md)
- Paid customer boxes: Stella Venues, Guardian Owl Digital, Kentuckiana Pumps, The Johnson Law Group, Very (fleet-status-check.md)
- Secrets live in AWS Secrets Manager under `owlthat/cortex/<env>/*` (names only; CLAUDE.md)
- Google OAuth shared app project `owlthat-502717`, CASA Tier 2 verification in progress (google-oauth-connection-state.md; workspace memory project_owlthat_google_verification.md)
- Dropbox app "OwlThat" (app key not copied; see dropbox-connector.md); Canva connector in Canva review (canva-connector-research.md)
- Email: Workspace user jwatkins@owlthat.com; info@ is a Google Group; Mailgun `email.owlthat.com`; Route 53 zone Z06576931BLQY1GAIL62Y (owlthat-email-setup.md)
- Twilio: OwlThat main account with A2P brand "OwlThat Inc"; each box is a subaccount; public line +15025563911 (twilio-a2p-brand-sharing.md; cortex-twilio-config index line)
- Venture Codex investor MCP for the raise (MEMORY.md index)

## People
- Dan Murphy (Slingshot Ventures; dmurphy@owlthat.com) (workspace memory project_team.md; triage MEMORY.md)
- Sarah Bhatia (Slingshot AI Product) (project_team.md)
- Jenna Ahern, Connor Rafferty, Cassidy Anderson, Bailey (Guardian Owl) (octic-auction-pilot.md; guardian-pacing-v2-decisions.md)
- Mamata, first paid advisory client (MEMORY.md index: mamata-advisory-engagement.md)

## Status
- Last commits: core 2026-09-23 `9d2c13f` (PR #2 merge); core-dropbox-sharing 2026-09-25 `1706b9a` (PR #3 merge); cortex 2026-09-24 `7400cec4` "docs(linkedin-connector): PRD stub..."; website 2026-09-23 `76d4a09`; mobile 2026-09-16 `fa9f169`; docs 2026-09-20 `4af89d6`; sensei-console 2026-09-21 `408cf2e`.
- cos_work open: #2 review (Octic pilot plan), #3 review (Dropbox allowlist on Guardian box; core must add sharing.read), #5 running (Dropbox share-link: sharing.read + owlctl shared-link), #7 review (cortex PRD `cortex/docs/tasks/active/dropbox-shared-links/`, uncommitted). Done: #1, #4, #6.
- Milestone: 100 paying boxes by 2026-10-15. Measured MRR was $250 (Stella only) as of 2026-09-15 (owlthat-100-customer-sprint.md).

## Gotchas / decisions
- Pushing `website/` to main deploys the live site. `docs/` is private and must never be published (CLAUDE.md).
- Keyless box rule: provider keys and tokens never go on a box; everything goes through core (CLAUDE.md; owlthat-aws-profiles.md).
- Stage specific files, never `git add -A`. Other sessions share the cortex checkout (cortex-tree-has-concurrent-wip.md).
- Check every box's image tag ancestry before deploying; parallel deploys clobber each other. Deploy only from a clean worktree (cortex-parallel-deploys-clobber.md; guardian-pacing-v2-decisions.md).
- Brand is "Quiet Studio, Forest" green `#2E6B4F` since 2026-09-16. README's orange `#F97316` is stale (CLAUDE.md).
- Cortex UI is full pages only, never modals. Link customers to cortex.owlthat.com, never app.owlthat.com (CLAUDE.md).
- The positioning is an agent platform, not "voice", and it covers tasks rather than replacing employees (MEMORY.md index lines).

## Gaps
- Which of the 18 core-*/cortex-* worktrees are still needed? Memory calls them stale.
- The orphan `-Documents-Sites-owlthat` memory duplicates owlthat-hq-core. Should it be removed?
- README.md brand line is outdated vs CLAUDE.md.
- Current MRR and billing state per box: not re-verified since 2026-09-15.
- Only about 12 of the ~114 memory files were read in full. Use MEMORY.md to go deeper.

## Sources
owlthat-hq/CLAUDE.md; README.md; sensei-console/README.md (head); git log per subrepo and worktree; memory MEMORY.md (owlthat-hq, owlthat-hq-core, Documents-...-owlthat-hq); fleet-status-check.md; guardianowl-box-setup.md; octic-auction-pilot.md; cortex-paying-customers.md; guardian-pacing-v2-decisions.md; guardian-pacing-live-state-0922.md; owlthat-aws-profiles.md; owlthat-100-customer-sprint.md; twilio-a2p-brand-sharing.md; google-oauth-connection-state.md; guardian-chat-worker-fixes-0914.md; dropbox-connector.md; owlthat-email-setup.md; owlthat-hq-box.md; fleet-live-findings-2026-09-16.md; cortex-tree-has-concurrent-wip.md; cortex-parallel-deploys-clobber.md; workspace memory project_team.md, workspace_overview.md, project_owlthat_google_verification.md; orphan memory (cmp against owlthat-hq-core); triage MEMORY.md; cos_work rows 1-7.
