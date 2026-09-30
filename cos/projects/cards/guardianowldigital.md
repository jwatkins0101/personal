# guardianowldigital
_Card for CoS sub-agent briefs. Built 2026-09-26 from the Sources below; hand-maintained, build-index.mjs never overwrites it. Box facts refreshed 2026-09-30._

**Parent: OwlThat** (cards/owlthat-hq.md). Guardian Owl Digital / Jenna is an OwlThat client (Jermaine, 2026-09-26); always load the owlthat-hq card with this one.

## What it is
Workspace for Guardian Owl Digital (guardianowldigital.com), described as the "first customer engagement" for Jermaine's company-management SaaS; it is not the core product (CLAUDE.md). Phase 1 is As-Is process discovery (11 maps, synthesis in INDEX.md), which feeds Guardian's Cortex box, hosted in owlthat-hq (INDEX.md, harness-import/README.md). Guardian Owl Digital is "a ~15-person digital/marketing agency" with "a parallel auctions business (Auctic)" (INDEX.md).

## Paths
- Folder: `/Users/jermainewatkins/Documents/Documents - Jermaine’s MacBook Pro/Sites/guardianowldigital` (also reachable via `~/Documents/Sites/guardianowldigital`)
- CLAUDE.md: `<folder>/CLAUDE.md` · README: none · discovery hub: `<folder>/INDEX.md` · portable method: `<folder>/METHODOLOGY.md`
- Memory: `~/.claude/projects/-Users-jermainewatkins-Documents-Sites-guardianowldigital/memory/` (index `MEMORY.md`, 6 files)
- Related memory elsewhere: owlthat-hq memory `~/.claude/projects/-Users-jermainewatkins-Documents-Sites-owlthat-hq/memory/` (guardianowl-box-setup.md, octic-auction-pilot.md, guardian-pacing-*.md, guardian-chat-worker-fixes-0914.md, guardian-worker-test-0921.md); workspace memory `~/.claude/projects/-Users-jermainewatkins-Documents-Sites/memory/project_guardianowl_billing.md`; `~/.claude/projects/-Users-jermainewatkins-Documents-Documents---Jermaine-s-MacBook-Pro-Sites/memory/guardian-auction-sop-docs.md`; triage memory `~/.claude/projects/-Users-jermainewatkins-Library-Application-Support-assistance-triage/memory/guardianowl-jenna-real-contact.md`
- Subfolders: `discovery/` (01-13 scan/answers), `maps/` (01-11 As-Is), `deliverables/` (briefing PDF, `ux-audit-2026-09-19/`), `harness-import/` (Jenna's agents + seed scripts for the Cortex box), `hosting/` (discovery site), `tools/`
- The Cortex box code lives in owlthat-hq (`owlthat-hq/cortex`, `owlthat-hq/core`); see cards/owlthat-hq.md
- Auction work: asset doc copies in `<folder>/inputs/2026-09-auctic/` (gitignored); process map `<folder>/deliverables/auction-process-map-2026-09-29.{md,html}` (box check 2026-09-29); dry-run reports v1-v4 in `<folder>/deliverables/` (v4: 108/132 fields match) (Jermaine, 2026-09-30)

## Stack & how to run/test
- No build/lint/test commands (CLAUDE.md: "No build, lint, or test commands exist yet").
- Discovery site: `python3 tools/build_static.py`, then `aws s3 sync deliverables/site/ s3://guardianowl-discovery-private/ ...` (hosting/README.md).
- Seed scripts for the box: `harness-import/seed-guardianowl-workers*.mjs`, run inside the box's web container, idempotent (harness-import/README.md, owlthat-hq memory guardianowl-box-setup.md).

## Accounts, services & IDs
- Discovery site: AWS account 441955302496, us-east-1, S3 `guardianowl-discovery-private`, CloudFront `E1EM8NK73WJG3V` (den2q1izcmo8b.cloudfront.net), basic-auth CF Function `guardianowl-basic-auth` (hosting/README.md; login is in that file and `hosting/credentials.txt`, not copied here)
- Cortex box: Lightsail `cortex-guardianowldigital-3`, guardianowldigital.owlthat.com, us-east-2 (owlthat-hq memory guardianowl-box-setup.md, owlthat-aws-profiles.md)
- SSH access: `~/.ssh/cortex-guardianowldigital-1.pem` works (host 18.224.218.149, user ubuntu, /opt/cortex); `cortex-lightsail.pem` is refused (Jermaine, 2026-09-30)
- Deployed build: cortex main `3ee5aab02d4b` (PR #10 merge), deployed 2026-09-30 ~11:45 UTC; before that `21349adf` (Dropbox shared-links deploy, 05:06 UTC); before that `c2003cfd` (Jermaine, 2026-09-30)
- Box inbound/forwarding email: guardianowldigital@in.owlthat.com (address.ts:60-71; live Mailgun route 6ab32eea75f73e9c75a4a790; forwarding active since 2026-09-23, no mail received yet). guardianowl@in.owlthat.com is WRONG (no route) but was given to Jenna/Connor in gmail:1a0cc429e2109a1f on 9/22 (box check 2026-09-29). Forwarding config: `mail.forwardFrom` = bailey@, jenna@, team@ (@guardianowldigital.com); trusted senders auctic.com + guardianowldigital.com; Bailey set a team@ Gmail filter forwarding Amber, Kayla, Jean "Scope of Work" emails to guardianowldigital@in.owlthat.com (Jermaine, 2026-09-30)
- Google Ads MCC 7102468953; Guardian's own ads account 9463318457 (owlthat-hq memory guardianowl-box-setup.md, guardian-pacing-v2-decisions.md)
- Box phone line +1 502-600-4640; Twilio subaccount of OwlThat main; A2P campaign registration was outstanding as of 2026-09-05 (owlthat-hq memory twilio-a2p-brand-sharing.md)
- Connectors on the box: Google Workspace as team@guardianowldigital.com (Connor moved it from jenna@ during the 2026-09-29 call; team@ is a Google Group Jenna belongs to); Canva as Jenna, connected 2026-09-25, healthy; Dropbox: shared links ready (Connor's 2026-09-29 reconnect included sharing.read), `dropbox.allowedLinks` = 21 pilot links. Also Asana (Jenna's PAT), SEMrush, Google Ads (owlthat-hq memory guardianowl-box-setup.md; Jermaine, 2026-09-30)
- Dropbox app "OwlThat" (app key not copied; see cos_work #3 and owlthat-hq memory dropbox-connector.md)
- Stripe billing via OwlThat, Inc.: customer cus_UtLMAT7nKyqWTr; OT-GOD-002 $2,500 deposit sent 2026-07-15; OT-GOD-003 $2,500 final not yet created (workspace memory project_guardianowl_billing.md)
- Auctic SOP Google Docs: `1qre2CTDzCJpzPysyqC-lTTaAC5ojxhutcLtuLV967Ng` (Resources), `1yZsuNfNlgE5CoQ8EDPS75Gggy8C2C0XP7MPwnr3Vcd0` (Auction SOP) (guardian-auction-sop-docs.md)

## People
- Jenna Ahern, Founder + CEO, jenna@guardianowldigital.com (INDEX.md; project_guardianowl_billing.md; guardianowl-jenna-real-contact.md)
- Connor Rafferty, admin user on the box; also handles caption prompts (octic-auction-pilot.md; guardianowl-box-setup.md; Jermaine, 2026-09-30)
- Cassidy Anderson, approves Google Ads pacing changes in Asana; no Cortex account yet (guardian-pacing-v2-decisions.md; Jermaine, 2026-09-30)
- Bailey Phillips, Director of Marketing & Operations; set a team@ Gmail filter forwarding Auctic "Scope of Work" emails to guardianowldigital@in.owlthat.com; no Cortex account yet (guardianowl-jenna-real-contact.md; Jermaine, 2026-09-30)
- Leah, follower on pacing tasks (guardian-pacing-v2-decisions.md)
- Rachel Coomes, rachel@guardianowldigital.com, thumbnail approval assignee; no Cortex account yet (Jermaine, 2026-09-30)
- Auctic side: Kayla.Miller@ and Amber.Traub@auctic.com send auction emails (guardian-auction-sop-docs.md)
- Dan Murphy, dan@newguyai.com, on Guardian calls (guardian-pacing-v2-decisions.md)

## Status
- Last commit: 2026-05-13 `f6c9370` "Apply Owner Answers Batch 1 — reverses Closed=won finding". Much later work is uncommitted (INDEX.md, maps 01-09, discovery/12-13, harness-import/, hosting/, deliverables/ux-audit-2026-09-19/), per `git status`.
- cos_work open: #2 review "Pull Sep 22 read.ai notes and plan the workflow setup" (Octic pilot plan, needs approval before box changes); #3 review "Resolve Sept Dropbox folder path + set allowlist on Guardian box"; #5 running "Dropbox share-link support: sharing.read scope in core + owlctl shared-link command"; #7 review "Write cortex story: owlctl share-link read command".
- cos_work done: #1 (Canva connected on Guardian box as Jenna Ahern), #4 (Sept Dropbox scan, 301 files), #6 (core sharing.read deployed, PR #3).
- Workers: Lead Triage blocked on approval cmud3msa6004lo008sfytzri9 since 2026-09-22 (50 skipped runs); Vistage blocked on approval cmugwtcxc01mxpg08090jal2y since 2026-09-25; Stale Lead Revival waiting since 9/28; Website Diagnostic healthy; old Ad Budget Pacing worker paused (replaced by built-in pacing service; Google Ads writes still OFF). Auction worker on the box is still paused, running the old definition — the branch's 9/30 rules have not been re-seeded/deployed (Jermaine, 2026-09-30)
- Open items (2026-09-29, updated 2026-09-30): (1) correction owed to Guardian: the 9/22 email gave the wrong address guardianowl@, the right one is guardianowldigital@in.owlthat.com (not yet sent); (2) team@ auto-forward of Auctic "Scope of Work" emails to the box address is now set up (Bailey, 2026-09-30) — resolved; (3) approve the two pending worker approvals above (any admin: Jenna, Connor, or Jermaine); (4) auction worker still needs the `feature/guardian-auctic-pilot12` definition re-seeded and deployed to the box; dry-run reports v1-v4 exist (v4: 108/132 fields match) (box check 2026-09-29; Jermaine, 2026-09-30)

## Gotchas / decisions
- Sensitive-data rule: never commit raw scraped email, doc, or task content, and never echo it into memory (CLAUDE.md).
- Discovery comes before code. Don't scaffold, and don't pick a stack until the owner says so (memory feedback_discovery_first.md).
- Finish all maps first. Then re-scan the data before asking the owners questions (memory feedback_questions_via_rescan.md).
- "Octic" in notes means Auctic (auctic.com). The auction trigger email carries a Dropbox link, and the output is an Asana task with Canva links, not a post (guardian-auction-sop-docs.md, octic-auction-pilot.md).
- Pacing writes stay OFF (`adsPacing.writesEnabled=false`), and no Google Ads change has ever been applied (owlthat-hq memory guardian-pacing-live-state-0922.md).
- Approvals: any admin on the box, including Jermaine, can approve any pending approval, including ones they requested themselves (Jermaine, 2026-09-29). The old "Jermaine can't self-approve; Connor or Jenna must approve" rule (guardianowl-box-setup.md) is outdated. Admins = Jenna, Connor (+ Jermaine); team@ is a viewer; Bailey, Rachel, Cassidy have no Cortex accounts yet (Jermaine, 2026-09-30).
- Auction workflow: latest pushed code is on branch `feature/guardian-auctic-pilot12` (owlthat-hq/cortex), including Bailey's 9/30 rules — timezone only from Write Up, NAA always, Write Up wins, Rachel Coomes = thumbnail approval assignee, escalation service off/notify/reassign, moodboard colors (Jermaine, 2026-09-30).
- Bug: slug upsert overwrote pages. Ed's Machinery caption page was restored 2026-09-30 as slug `eds-machinery-captions`; fix PR in progress (Jermaine, 2026-09-30).
- Asana actions from the box appear as Jenna, because the PAT is hers (guardian-pacing-v2-decisions.md).
- Dropbox: auction assets arrive as a new shared Dropbox link in each email (from Jenna/Guardian or Auctic to team@); there is no fixed folder path, so the box must read shared links (share-link PRD D1 = C, links from email + zip support) (Jermaine, 2026-09-29)
- Auction emails reach the box ONLY by forwarding to its inbound address (team@ auto-forwards Auctic "Scope of Work" emails); the box does not read Jenna's or team@'s mailbox for this (Jermaine, 2026-09-29)
- Dropbox shared-link reading is a platform feature for all boxes (PRD: owlthat-hq/cortex docs/tasks/active/dropbox-shared-links/, branch docs/dropbox-shared-links-prd). Allowed senders are a per-box list set in the box's email-forwarding connection settings; Guardian's: guardianowldigital.com, auctic.com (Jermaine, 2026-09-29)
- Canva: Guardian is on Canva Business; the OwlThat Cortex Canva app is approved and connected (Jermaine, 2026-09-29)

## Gaps
- Discovery site disabled 2026-09-27 15:32 EDT (CloudFront E1EM8NK73WJG3V Enabled=false, Deployed; hostname no longer resolves), credential scrubbed (only `hosting/credentials.txt` remains; `hosting/` now gitignored and skipped by build_static.py), Stage B pending (Jermaine; commands in cos/reports/guardian-site-teardown-2026-09-26.md §3).
- Should the uncommitted discovery work since 2026-05-13 be committed?
- Monthly billing is unclear. owlthat-hq memory says "Guardian unbilled" for the plan and that OT-GOD-003 was not sent (owlthat-100-customer-sprint.md). Current state not verified.
- Dropbox plan type (personal vs Business) is unknown (octic-auction-pilot.md). — resolved 2026-09-29: the box's Dropbox connection "Guardian Owl Team" is personal/Basic and empty; assets come via shared links, not a folder (box check 2026-09-29)
- Are the To-Be / To-Do maps started? None found in `maps/`.

## Sources
guardianowldigital/CLAUDE.md; INDEX.md (top 80 lines); METHODOLOGY.md (head); hosting/README.md; harness-import/README.md; .gitignore; git log/status; guardianowldigital memory: MEMORY.md, project_overview.md, feedback_discovery_first.md, feedback_questions_via_rescan.md, methodology_process_mapping.md, user_profile.md; owlthat-hq memory: guardianowl-box-setup.md, octic-auction-pilot.md, cortex-paying-customers.md, guardian-pacing-v2-decisions.md, guardian-pacing-live-state-0922.md, guardian-chat-worker-fixes-0914.md, twilio-a2p-brand-sharing.md, google-oauth-connection-state.md, dropbox-connector.md, owlthat-aws-profiles.md, owlthat-100-customer-sprint.md; workspace memory project_guardianowl_billing.md; guardian-auction-sop-docs.md; triage memory guardianowl-jenna-real-contact.md, readai-meeting-reports.md; cos_work rows 1-7; box check 2026-09-29 (read-only); Jermaine's decisions 2026-09-29; box check 2026-09-30 (SSH, git log, connectors, approvals); Jermaine's decisions 2026-09-30.
