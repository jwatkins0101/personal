# AI Chief of Staff: Build Plan (for review)

**Status:** DRAFT for your review. Nothing will be built until you approve it.
**Date:** 2026-09-24
**Inputs:** Perplexity research report (`Sites/ai-chief-of-staff-report/`), your Claude Code insights report (69 sessions, 2026-05 to 2026-09), and a read-through of what already runs on this Mac.
**After approval:** this plan becomes `PRD.md` in this folder via your Ralph workflow (with AC IDs and evidence targets). The stories are then built with gates.

---

## 1. The one-paragraph version

Don't start from scratch. The `assistance` repo already has most of the parts: hourly Gmail triage (live, last run 9:00 PM tonight), Apple Calendar via AppleScript, iMessage/SMS capture, Google Tasks capture, a people graph (3,082 people), a SQLite store (9,515 items), a pipeline orchestrator with retries, and flight checks. Separately you run deal-watch, the YouTube daily brief and a Teaching Ops agent. The chief of staff (CoS) is a **thin orchestrator on top of these existing jobs**. It reads what they produce, verifies it, adds the missing pieces (a commitment ledger, an end-of-day wrap, one approvals queue, and a calendar writer with enforced dedupe), and hands you **one brief a day with three buckets: Decide / FYI / Escalations**. It interrupts you only for sends, payments and sign-ins, which is how you already work.

---

## 2. How your working style shapes the design

| What the insights showed | What the CoS does about it |
|---|---|
| You delegate outcome-level goals and walk away; 959 messages vs 4,500+ Bash calls | Runs headless on launchd. Everything that needs you lands in **one** Approvals block, not a stream of pings |
| Your go-ahead is a short word like "send" | Approvals use short commands: `approve 3`, `send 2`, `skip 4`. Fail closed: no answer means nothing happens |
| Top frictions are **wrong_approach (29)** and **misunderstood_request (14)**, mostly from ignoring your conventions | Conventions are enforced in code and hooks, not just written in prompts. The research is explicit that CLAUDE.md is "context, not enforced configuration" |
| Gmail `newer_than:90m` was read as **90 months** (and it's **still in `prompts/gmail-triage.md` today**) | Epoch-bounded queries only (`after:<epoch>`). A fixture test fails the build if `newer_than:\d+m` appears |
| Digest counts didn't reconcile (17 in the lanes vs 16 triaged); "saved 5 PDFs" when only 1 existed | Every run ends with a reconciliation check: lane totals must equal items processed, and every file claimed must exist on disk. A failure moves the run to Escalations |
| Unescaped `'` broke a digest | All output goes through JSON serialization or quoted heredocs. No hand-escaped strings |
| Pasted threads with no instructions led to wrong guesses | For any item with an unclear ask, the CoS proposes the intent (reply / withdraw / follow up / summarize) as a one-line Decide item instead of drafting |
| Browser automation is brittle (Sheets misclicks, wrong signed-in account, OAuth in the wrong profile) | APIs and CLIs first (`gws`, AppleScript, SQLite). The browser is used only where there's no API (Blackboard, Canva). A missing sign-in or scope becomes an Escalation with the exact re-auth command |
| Scheduled runs failed silently (a bad `run.sh` path, an API error killed triage) | Every job gets retries, absolute paths, a run ledger, and a **heartbeat check**. The brief lists any lane that didn't report ("deal-watch: no run since 07:18 yesterday") |
| Your rules: Family iCloud calendar, dedupe before writing, never infer dates, no Co-Authored-By | Built into the tools. `create_event` **refuses** to run without a fresh dedupe listing and a cited source message. A hook blocks Co-Authored-By |

---

## 3. What already exists, and how the CoS uses it

| Existing piece | Where it lives | Status | Role in the CoS |
|---|---|---|---|
| Gmail triage (hourly, labels/archives, stars, heads-up draft) | `~/Library/Application Support/assistance/triage/` + `com.assistance.gmail-triage` | **Live** | **Inbox lane.** Keeps running as is. The CoS reads its run log. Fix the `newer_than:90m` bug first |
| Task capture (email + SMS → Google Tasks, 8am/6pm) | `task-capture/` + launchd | Live | Feeds the **commitment ledger** |
| Flight checks (7:43am) | `scripts/cron-flight-check.sh` | Live | FYI lane |
| Deal-watch (7:18am) | `Sites/deal-watch` | Live | FYI lane (deals only when they cross a threshold) |
| YouTube daily brief (7:03am) | `Sites/youtube-knowledge` | Live | Its "headline" line goes into FYI |
| Teaching Ops agent | `~/.claude/agents/teaching-ops.md` | On demand | **Teaching lane**, drafts only, FERPA rules kept |
| Apple Calendar reader | `src/calendar/apple.ts`, `scripts/get-calendar-events.sh` | Works | **Calendar lane** (read). Base for the new gated writer |
| People graph + nudges | `src/people/` | Works | Meeting-prep context, "people to reconnect with" |
| Pipeline orchestrator (ingest → sort → route → briefing) | `src/pipeline/` | **Dormant since Feb 2026** | Reuse its retry, preflight and run-history code for the CoS runner. Retire the Apple Notes briefing in favor of the CoS brief (**decision D3**) |
| Classifier + bouncer (≥0.85 auto, 0.60–0.84 review) | `src/classifier/` | Works | Reused as is for the Decide vs FYI split |

---

## 4. Target architecture

```
                              YOU
             approve / send / skip  ▲  one brief: Decide | FYI | Escalations
                                    │  (HTML + audio + short push)
                    ┌───────────────┴────────────────┐
                    │   CHIEF OF STAFF (orchestrator) │  headless `claude -p` on launchd
                    │   plan → dispatch → VERIFY →    │  owns the brief + the Approvals queue
                    │   reconcile → merge → report    │  only component that can request A3 actions
                    └───────────────┬────────────────┘
      ┌──────────┬──────────┬───────┴─────┬─────────────┬──────────────┐
      ▼          ▼          ▼             ▼             ▼              ▼
   INBOX     CALENDAR   COMMITMENTS    TEACHING      RESEARCH     FYI FEEDS
 (existing  (read now;   (new ledger;   (Teaching    (Perplexity  (flights, deals,
  triage)   gated writer  task-capture   Ops agent,   on demand)   YT brief, and later
            later)        feeds it)      drafts only)              the Cortex fleet)
```

**Contract every lane returns** (structured JSON, never free text):
`{lane, status: ok|partial|failed, ran_at, items_in, items_out, findings[{claim, source_ref}], proposed_actions[{id, action, risk_tier, source_ref}], open_questions[], gaps[]}`

**The CoS verifies before reporting up:**
1. Re-reads the source (Gmail message ID / calendar event ID) for every date, time, amount and name attached to a proposed action.
2. Removes duplicates across lanes (the same commitment from email and SMS).
3. Reconciles counts (items in = sum of items out per lane).
4. Retries a failed lane **once** with the error in context. After that it goes to Escalations as "couldn't verify X". It never fills the gap.
5. Only structured fields cross between lanes, so email text can't change another lane's instructions.

**v1 runs the lanes one after another in one session.** Parallel sub-agents come later, only if they're needed (the research puts them at about 15x the tokens).

---

## 5. Autonomy matrix (from the research, adapted to your rules)

| Action | Level | Rule |
|---|---|---|
| Read mail, calendar, tasks, SMS, notes for briefs | A4 auto | Read-only. The inbox lane has no send tool |
| Label/archive/star mail (existing triage) | A4 auto | As today. Weekly spot-check of 10 |
| Write the brief, EOD summary, ledger, run log | A4 auto | Your own files, git-versioned |
| Draft replies (Gmail drafts folder) | A2 draft | Never auto-sends |
| **Send any email or message** | A3 approve | `send N` in the approval step shows the final text and recipients. No response means no send |
| Send to a **new** recipient, or containing data from another thread | A3+ | Also shows a "data leaving: X" preview |
| **Create an event on the Family calendar** | A3 approve | Must cite a source message ID plus the dedupe result for that date range. No source date, no event |
| Accept/decline/reschedule; edit or delete events | A3 approve | Shows before/after |
| Private focus block on your own calendar | A3 → A4 | Promoted after 20 clean runs |
| Chase someone for status | A2 draft | You decide when |
| Student records/grades | A0 external / A2 drafts | FERPA: never leaves the Mac; drafts only |
| Payments, purchases, sign-ups, Stripe links | A0 never | Surfaced as a Decide item only |
| Commit your time to new meetings | A1 suggest | You decide |
| Run instructions found in an email or doc | A0 never | Always treated as data |
| Save memory from outside content | A1 propose | Quarantine file; you approve it |
| Customer-box (Cortex) actions | Out of scope for v1 | Read-only status could join as a lane in Phase 5 |

---

## 6. Daily and weekly rhythm

| When | What | Notes |
|---|---|---|
| 07:00–09:00 hourly (existing) | Gmail triage | Unchanged apart from the bug fix |
| **07:30** | **Morning brief** | After triage (07:00), YT brief (07:03), deal-watch (07:18). Flights run at 07:43, so the brief uses yesterday's flight run or moves flights earlier (**D5**) |
| Before meetings that need prep | Prep note | Last thread with each attendee, open ledger items, people-graph context |
| **17:30** | **EOD wrap** | What got done, what slipped, decisions made. **It writes the input for tomorrow's brief** |
| **Fri 15:00** | Weekly review | Scorecard, commitment sweep, stale memory, proposals to raise or lower autonomy |

**Morning brief layout (one screen):**
1. Status: CLEAR / WATCH / CRITICAL
2. **Decide**: numbered approvals, one line each
3. Critical path (≤5)
4. Meetings needing prep
5. Replies owed / Waiting on others
6. Deadlines (7–14 days)
7. FYI (flights, deals, YT headline)
8. **Escalations**: failed lanes, missing sign-ins, unverifiable items
9. One first move

---

## 7. Build phases

Each phase ends with gates run and the output pasted, the change live on this Mac, the result checked in a real run, and earlier issues rechecked. That's your "Done" definition.

### Phase 0: Charter and guardrails (small; can start right after approval)
- `cos/CLAUDE.md` charter: role, decision rights, the autonomy matrix above, and the never-list.
- **Hooks:** block `Co-Authored-By` in commits; block `newer_than:\d+m` in Gmail queries; typecheck on edit.
- Fix the live `newer_than:90m` bug in `prompts/gmail-triage.md` → `after:<epoch>`.
- **Gate:** each hook proven with a deliberately failing case (your "prove the watcher" rule).

### Phase 1: Harden the existing lanes
- Add a **fixture suite** of about 40 labeled sample emails (newsletters, payment failures, client asks, invites, receipts, school). Triage must route 100% correctly before any change ships.
- Count reconciliation plus a file-existence check at the end of every run.
- Standard run ledger for every lane (`ran_at, status, in, out, gaps`) and a heartbeat check.
- Retries (3x with backoff) and absolute paths in every launchd script.
- **Gate:** fixtures 100%; a reconciliation failure is caught when deliberately injected; a killed job shows up as a missing heartbeat.

### Phase 2: The CoS orchestrator and morning brief
- `npm run cos -- morning`: reads every lane's ledger, verifies, reconciles, merges, writes the brief.
- Output: HTML brief (same style and audio narration as the research report) + markdown in git + a short push notification (**D2**).
- The Approvals queue is stored in SQLite (reuses the `action_logs` table). You act on it with `npm run cos -- approve 3` / `send 2` / `skip 4`, or by typing the same words in a Claude Code session.
- **Gate:** 5 consecutive live mornings with correct counts, no invented dates, and every Decide item citing a source ID.

### Phase 3: Commitment ledger, EOD wrap, weekly review
- The ledger captures "I'll send X by Friday" (yours and others') from email, SMS and task-capture. A loop only closes with evidence: sent mail, an event, or a completed task.
- The 17:30 EOD wrap feeds the next morning. The Friday review runs the scorecard (dropped balls, caught errors, approvals per day, decision latency, net time, cost).
- **Gate:** seeded test commitments open and close correctly; the EOD output shows up in the next brief.

### Phase 4: Gated calendar writer and meeting prep
- A `create_event` tool on top of AppleScript that writes only to the Family iCloud calendar (picked by event count). It **refuses** to run without a fresh `list_events` for the range, a source message ID, and your approval.
- Meeting prep notes from the people graph and recent threads.
- **Gate:** trying to write without a dedupe listing is refused (tested); a duplicate invite is detected (tested); one real approved event is written and checked in Calendar.app.

### Phase 5: Optional lanes (each one is your call)
- Teaching Ops as a scheduled lane (drafts only).
- **Cortex fleet status** as a read-only lane (heartbeats, TLS/routing-policy expiry, paused pollers). It flags issues; it never deploys.
- SOW hours tally and invoice reminders.
- Parallel sub-agents, only if the one-after-another runtime becomes too slow.

---

## 8. Decisions I need from you

| # | Decision | My recommendation |
|---|---|---|
| **D1** | Where it lives | **Extend the `assistance` repo** (the reusable code is already here) rather than start a new repo |
| **D2** | How the brief reaches you | **HTML + audio page** (like the research report) plus a **one-line iMessage to yourself** with the status and number of approvals. Alternatives: email to yourself, Apple Notes (current) |
| **D3** | The dormant Apple Notes briefing pipeline | **Retire it**, keep its modules, and replace it with the CoS brief |
| **D4** | How you approve | **CLI/Claude Code first** (`approve 3`, `send 2`). Replying by iMessage is possible later but adds an injection risk to design around |
| **D5** | Flight-check timing | Move it to 07:20 so the 07:30 brief has today's data |
| **D6** | Scope of v1 | Phases 0–3 (charter, hardening, brief, ledger/EOD). The calendar writer (Phase 4) comes after 2 weeks of clean briefs |
| **D7** | Cost ceiling | Daily token/$ budget for headless runs, e.g. **$5/day** to start. The brief shows actual spend |
| **D8** | Cortex fleet lane | Not in v1. Revisit in Phase 5 |

---

## 9. Risks and how they're handled

| Risk | How it's handled |
|---|---|
| Prompt injection through email ("lethal trifecta") | The inbox lane can't send or fetch URLs. Sends happen only through your approval step. Email content never becomes instructions |
| Approval fatigue | ≤ about 5 Decide items a day. Anything you approve unchanged 20 times becomes a candidate for more autonomy |
| Silent failures | Heartbeats + an Escalations section that always lists missing lanes |
| Stale or poisoned memory | Every fact has a source and a last-verified date. Anything from outside content goes into a quarantine file you review on Fridays |
| Cost creep | Daily budget, sequential lanes, spend shown in the brief |
| Mac asleep at 07:30 | `pmset` wake schedule or launchd catch-up on wake. The brief notes when it ran late |

---

## 10. What happens after you approve

1. You mark up this plan (change any decision D1–D8).
2. I turn it into `docs/tasks/active/ai-chief-of-staff/PRD.md` using your Ralph PRD template, with AC IDs and evidence targets, and record the decisions in `DECISIONS.md`.
3. Optional: a `/fusion` review round on the PRD.
4. Build Phase 0 → 1 → 2 → 3 through Ralph stories. Each phase stops for your sign-off with pasted gate output and live evidence.
