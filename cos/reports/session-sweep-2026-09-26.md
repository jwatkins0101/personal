# Session sweep: Sep 19–26, 2026

134 Claude Code sessions reviewed (111 automated triage/agent runs skipped). 4 read-only reviewers; top claims spot-checked by CoS.
Evidence = session id prefix + date + check run. Items 1–11 are on the board's Decide list.

## Now (before Monday)
1. **Guardian forwarding address is probably wrong.** Jenna and Connor were told `guardianowl@in.owlthat.com` (e02a0b89, 09-23). The box label is `guardianowldigital` and the route matches `^<label>(\+…)?@` (a50f20ac). The octic memory and the card also say `guardianowl@`. Mailgun is unverified. Next: confirm the live route, then draft a correction to Jenna.
2. **Mail "adopt" trusts the box's own in.owlthat.com address.** The flaw was confirmed and you said "yes" to fixing it, but the session ended first (a50f20ac, 09-23). `cortex/apps/web/lib/mail/adopt.ts` has no exclusion; the last mail commit is 7b49f058 (09-22). Next: fix it, purge the bad entry on HQ, and prove the eligible→drafted path.
3. **Sensei demo on Mon 9/28 10:00 EDT (Teams, with Dan): real student names show on the Progress screen.** The only live test was on a real course; there is no name-masking setting (2cfb4368, 09-23). Decide: demo course, masking, or skip the screen.
4. **Sensei: Class Progress is uncommitted and the runbook is stale.** status.json shows 37/0 passing but "user commits". AIAgents has 94 uncommitted paths on the `sensei-console` branch, including course folders with student data. The runbook was last changed 09-21 and doesn't cover Messages or Progress.
5. **CIS-260 grades haven't been re-pulled.** Week 6 is due 2026-09-27 (evidence/live-proof-cis-260.md). The last pull was 09-21, and the pull needs you to sign in to Blackboard.
6. **Your personal Dropbox may still be connected to the canary box.** It was connected by mistake while testing, and no disconnect was seen (1d9e03ad, 09-25). Check the canary's Connections page.
7. **Keys to rotate:** an Anthropic token is in an Apple Note title (7f44652a); an OpenRouter key showed up in a screenshot (92360086, 09-21). There's no evidence either was rotated.

## This week
8. **assistance `main` is 47 commits ahead of origin** (verified: `git branch -vv`). All of the CoS work is on this laptop only. Remote: jwatkins0101/personal.
9. **Backup of deleted prod tenants is untracked in the core checkout.** The file is `ops/tenants-prod-deleted-backup-2026-08-30.json` and contains customer data (verified: `git status`). Move it somewhere private or delete it.
10. **People you owe or are waiting on:**
    - Jenn Callahan (Amplify) coaching follow-up, before Build & Pitch on Sep 29 (21eb93dd)
    - Mamata: revised NDA, a possible duplicate $1,000 Zelle, no session-2 date (6f658db8, 09-18)
    - Josh/Fairway hasn't replied since your Sep 22 reply
    - Keeley on veryweb row 24 (New Mexico therapy), open since 8/20
11. **CSC/Clerky registered agent** is held with no date to revisit it. A lapse has legal consequences.

## Low priority / when convenient
- veryapp PR #18 (CI shows real results) has been an open draft since 09-23 (verified).
- cortex is 1 commit ahead (LinkedIn PRD); 2 customer-discovery docs are untracked; website has uncommitted brand-guidelines changes.
- Stale ops docs: `canva-app.md:4` (it was submitted) and `client-box-setup.md:242` (Stella now has voice).
- The Mailgun Tax ID is still the placeholder "ASDSADSD" (8556189f).
- Canva app v3 is in review (about Sep 29–Oct 9). When approved, rotate the reviewer passwords and turn on MFA.
- Three cards are still pending for Jenna on the Guardian box (adf5f171). Kentuckiana live proof isn't done (a50f20ac).
- 100-box goal: the fusion recommended 10–20 by 10-15; no decision is recorded (71269c22).
- Interview-room S00 test is paused, and its evidence folder is untracked (7f44652a).
- Sensei: two copies of the code have drifted (the GitHub copy is at 408cf2e, 9/21, without Messages or Progress). Pick the master.
- Check the Outlook Sent folder: CIS-260 D1 student follow-up (9e5d170f) and the withdrawal of Research Computing ticket 3316425 (6f604958).
- Course evaluation summary for Dan: the PDF is in ~/Downloads, but only 1 of 5 Blue reports downloaded (efd4b080).
- CoS: STORIES.json only covers Phase 0; stale worktree `nervous-euler-e0de0e`; the iMessage brief ping timed out once (09-25); no step keeps the installed runner in sync.
- Unanswered offers: delete the flights code? Switch to AGENTS.md only? Clean up 22,268 unmatched techunify emails? Fix veryweb sheet rows 22 and 26?

## Confirmed done (dropped: 33)
Includes: jermainewatkins.com is live; AACSB reply sent (deadline corrected to Oct 1); Jenna reply sent 9/25; Fairway reply sent; cortex PR #2 and core PR #3 merged; veryweb v1.5.15 is live; 4 AIAgents commits pushed; the D1 double submission was fixed.

## Proposed card updates (not applied; need your OK)
- owlthat-hq: Mailgun is on Foundation 50k at $35/mo from Oct 1; each box has `<label>@in.owlthat.com`; the Canva app "OwlThat Cortex" v3 is in review; the Dropbox app is in development status (0/500 users).
- guardianowldigital: flag the forwarding-address discrepancy (item 1).
- AIAgents: demo Mon 9/28 10:00 EDT with Dan; Class Progress passes but isn't committed; OwlThat/sensei-console is at 408cf2e; the AACSB deadline is Oct 1.
- assistance: main is ahead of origin by 47; the flights lane is removed but the code is kept; the board runs as launchd `com.assistance.cos-board`.
- veryweb: the last prod tag is v1.5.15; row 24 is waiting on Keeley.
- jermainewatkins.com: re-verified live on Sep 26 (closes that gap).
