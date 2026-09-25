# Feature: AI Chief of Staff (v1)

Revision: 13. Status: in progress. Feature ID: ai-chief-of-staff.
Source plan: `PLAN.md` (approved 2026-09-24, decisions D1–D8 = recommended). Harness: Ralph 2.0 @ `6d9f21ea27bb41662e1e69dd19ca1c483ad41c44`.

## Current specification

### Problem and outcome
Jermaine (the principal) runs several separate scheduled assistants on this Mac: Gmail triage, task capture, flight checks, deal-watch and the YouTube brief. Each reports on its own, and some fail silently. Nothing merges their output into one set of decisions, tracks commitments, or checks its own numbers. Claude Code insights (69 sessions, 2026-05 → 2026-09) show the costliest failures are wrong assumptions and ignored conventions: a Gmail query read as 90 months, digest counts that didn't reconcile, a claimed file that didn't exist, a silent scheduled-run failure.

**Outcome:** a chief of staff (CoS) orchestrator in this repo that, every weekday:
- produces **one verified brief** (07:30) with **Decide / FYI / Escalations** buckets;
- keeps a **commitment ledger**;
- writes a **17:30 EOD wrap** that feeds the next brief, plus a **Friday review**;
- queues every consequential action for a short-word approval (`approve N`, `send N`, `skip N`). No answer means no action.

It never sends, pays or signs up on its own.

### Verified facts and assumptions

**Code and system facts** (repo `jwatkins0101/personal` @ `a4fbd9b`, checked 2026-09-24):

| Fact | Evidence |
|---|---|
| Gmail triage runs hourly (launchd `com.assistance.gmail-triage`) as `claude --print --permission-mode bypassPermissions --allowedTools Bash` over a prompt file | `~/Library/Application Support/assistance/triage/run-gmail-triage.sh`; last run in `~/Library/Logs/assistance/gmail-triage.log` 2026-09-24 21:00 |
| The **deployed** triage prompt (229 lines) differs from the repo copy `prompts/gmail-triage.md`, even though the runner says "edit the repo copy" | `diff -q` → differ |
| Both copies use `in:inbox newer_than:90m`. In Gmail search, `m` means **months** | grep lines 16/46 (repo), 22/52 (deployed); Gmail search operator docs; insights report friction |
| The triage context has Bash + `gws` with `gmail.modify` scope, which permits sending. So the inbox-reading context can send (the "lethal trifecta") | prompt header; Google OAuth scope docs |
| YouTube daily brief latest file is `2026-09-16.md` (8 days stale); its err log shows a `maxfiles` error | `Sites/youtube-knowledge/briefs/` listing |
| Deal-watch brief is current (`brief-2026-09-24.html`) | `Sites/deal-watch/briefs/` |
| Existing modules: pipeline runner with retries/preflight/run history, unified classifier with confidence bouncer, Apple Calendar reader, Google Tasks, people graph, SQLite store (`memory_items` 9,515 rows; `people` 3,082) | `src/pipeline/`, `src/classifier/`, `src/calendar/apple.ts`, `src/tasks/`, `src/people/`, `src/storage/` |
| Apple Notes pipeline last ran 2026-02-25 | `pipeline_runs` table |
| No test framework and no CI in the repo. `npm run build` = `tsc --noEmit` | `package.json`; no `.github/` |
| No wake schedule is configured for mornings | `pmset -g sched` |
| Task-capture failed every run from 2026-09-02 18:00 to 2026-09-24 (`tsx: command not found`: no `node_modules` in the main checkout; `better-sqlite3` 12.6.2 does not build on Node 26). After the fix, SMS classification failed because the current `claude` CLI prints an event array | `~/Library/Logs/assistance/task-capture.log` |

**External claims** (from `Sites/ai-chief-of-staff-report/research.md`, retrieved 2026-09-24):

| Claim | Source | Disproving test |
|---|---|---|
| Per-action approval prompts cause fatigue (~93% approval rate); containment beats prompts | Anthropic, "How we contain Claude" (2026-05-25) | Your approve-unchanged rate stays low with ≤5 items a day |
| Inbox-reading agent + external send = exfiltration risk; filters miss social-engineering injections | Willison (2025-06-16); OpenAI (2026-03-11) | n/a (design constraint) |
| Sub-agents need an objective, output format, tools and boundaries; multi-agent costs ~15x tokens | Anthropic multi-agent research (2025-06-13) | Sequential v1 meets the brief SLA at ≤$5/day |
| CLAUDE.md is context, not enforced configuration | Claude Code memory docs | n/a |

**Assumptions:**

| # | Assumption | Confidence | Disproving test |
|---|---|---|---|
| A1 | The triage LLM routes the fixture set deterministically enough to gate on 100% across 2 runs | Medium | Fixture eval shows run-to-run disagreement > 0. If so, gate at 100% on the rule-matched subset and ≥95% overall, and record the decision change |
| A2 | Messages.app can send a one-line iMessage to the principal's own handle via AppleScript from launchd | Medium | AC-15 live test fails. Fall back to an email to self (drafts API + an approved send rule) |
| A3 | `claude -p --output-format json` reports usage/cost well enough to enforce a $5/day budget | Medium | The JSON has no cost field. Estimate from tokens × published price and mark it estimated |

### Scope and non-goals
**In scope (v1 = plan Phases 0–3):**
- guardrails and hooks;
- hardening the existing lanes: fixtures, run ledger, reconciliation, heartbeats, retries;
- the CoS orchestrator and morning brief (HTML + audio + iMessage ping);
- the approvals queue;
- the commitment ledger, EOD wrap and Friday review.

**Non-goals (v1):**
- Calendar **writes** of any kind (Phase 4, after 2 weeks of clean briefs).
- Cortex fleet lane.
- Parallel sub-agents.
- Replying to approvals by iMessage.
- Auto-sending anything.
- Changing the triage labeling policy itself.
- Teaching Ops as a scheduled lane (it stays on demand).
- The Apple Notes briefing: retired, and its modules kept.

### Behavior and contracts

**Lanes** (existing jobs keep running as they do today):

| Lane | Producer | Schedule |
|---|---|---|
| `inbox` | Gmail triage | hourly |
| `tasks` | task-capture | 08:00 / 18:00 |
| `deals` | deal-watch | 07:18 |
| `yt` | youtube daily brief | 07:03 |
| `calendar` | read-only via `src/calendar/apple.ts` | at brief time |
| `commitments` | new ledger | at brief/EOD |

**Run record contract.** Every lane appends one JSON line per run to `~/Library/Application Support/assistance/ledger/<lane>.jsonl`:
```json
{"lane":"inbox","run_id":"…","status":"ok|partial|failed","started_at":"ISO","finished_at":"ISO",
 "items_in":16,"items_out":{"archived":9,"starred":2,"kept":5},"artifacts":["/abs/path"],
 "findings":[{"claim":"…","source_ref":"gmail:MSG_ID"}],
 "proposed_actions":[{"id":"…","action":"…","risk_tier":"A2|A3","source_ref":"…","payload":{}}],
 "open_questions":["…"],"gaps":["…"],"cost_usd":0.12}
```
Existing prompt-driven lanes emit this record with a wrapper step (the lane writes a JSON summary; the wrapper validates it and appends it). Records that fail validation are logged as `status:"failed"` with reason `invalid_record`.

**Invariants, checked by the `cos` runner and wrappers:**
- **Reconcile:** `items_in == sum(items_out)`. Otherwise the run is re-labeled `failed` with gap `reconciliation: in=X out=Y`.
- **Artifacts:** every path in `artifacts` exists and is non-empty. Otherwise `failed` with gap `missing_artifact: <path>`.
- **Heartbeat:** each lane has an expected cadence in `cos/lanes.json`. A lane without a record inside its window + grace period shows as an Escalation `stale: <lane> last=<ts>`.
- **Gmail queries:** time windows use `after:<epoch>` / `before:<epoch>` only. `newer_than:<n>m` and `older_than:<n>m` are forbidden (lint gate).
- **Text output:** written through JSON serialization or quoted heredocs only.

**CoS runner:** `npm run cos -- <morning|eod|weekly|health|approve|send|skip|queue>`.
- `morning` reads today's lane records plus yesterday's EOD, then:
  1. verifies every proposed action's date, time, amount and person by re-fetching its `source_ref` (Gmail message metadata; calendar event by UID);
  2. dedupes across lanes;
  3. retries a failed lane once, then escalates;
  4. writes `briefs/YYYY-MM-DD.md`, `.html` and `.mp3` (in `~/Library/Application Support/assistance/briefs/`), inserts approvals, and sends the iMessage ping.

  A proposed action whose source can't be verified is **not** put in Decide. It goes to Escalations.
- **Brief sections, in order:** Status (CLEAR / WATCH / CRITICAL), Decide (numbered), Critical path (≤5), Meetings needing prep, Replies owed, Waiting on others, Deadlines (7–14 days), FYI, Escalations, One first move, Cost today.
- **Approvals** live in the SQLite table `cos_approvals` (id, created_at, expires_at, action, risk_tier, source_ref, payload_json, status pending|approved|sent|skipped|expired, decided_at).
  - `approve N` runs a non-send action.
  - `send N` prints the final recipients and body, then sends only that draft via `gws gmail users drafts send`.
  - `skip N` closes the item.
  - Items expire at 23:59 local time with status `expired` and no side effect (fail closed).
  - The inbox lane never gets send capability.
- **Commitments** live in the SQLite table `cos_commitments` (id, owner me|them, counterparty, what, due_quote, due_at nullable, source_ref, status open|closed, closed_evidence, created_at, updated_at).
  - `due_at` is set only when `due_quote` contains an explicit date or weekday tied to the source message's date. Vague phrases leave `due_at` null and add an open question.
  - Closing requires evidence: a sent Gmail message ID, a sent SMS from that day, a past calendar event, or a completed task ID (D14).
- **EOD (17:30)** writes `eod/YYYY-MM-DD.json` (done, slipped, decisions, carry-forward). `morning` must read the prior EOD, or escalate `missing_eod`.
- **Weekly (Fri 15:00)** writes the scorecard: dropped balls, caught errors (from `feedback`), approvals per day and unchanged rate, decision latency, cost. It also lists autonomy-promotion candidates. It never promotes automatically.

**Charter:** `cos/CLAUDE.md` holds the role, the autonomy matrix (PLAN.md §5) and the never-list. It is loaded by every CoS `claude -p` call via `--append-system-prompt-file`. Rules that must hold are enforced in code and hooks. The charter is context only.

**Hooks (repo `.claude/settings.json` + triage run dir):**
- PreToolUse(Bash) blocks commit messages containing `Co-Authored-By`.
- PreToolUse(Bash) in the triage context blocks `gws gmail users messages send` and `gws gmail users drafts send`.

### Acceptance

| ID | Trigger and expected behavior | Automated gate or live evidence | Verification state |
|---|---|---|---|
| **Phase 0: guardrails** |||
| AC-01 | A `git commit` whose message contains `Co-Authored-By` from a Claude session in this repo is blocked with exit 2 | `gate:hook-coauthor`: feeds hook JSON for a violating commit (expects block) and a clean one (expects allow) | not_run |
| AC-02 | Any `newer_than:<n>m`/`older_than:<n>m` in `prompts/`, deployed prompts or `src/` fails the lint. Triage uses `after:<epoch>` computed at run time | `gate:gmail-query-lint` with a negative fixture; live triage log shows an `after:` query | not_run |
| AC-03 | The repo prompt is the single source. Deploy copies it, and a drift check compares sha256 of repo vs deployed | `gate:prompt-drift` (fails on an intentionally edited deployed copy); the live prompt is first reconciled into the repo | not_run |
| AC-04 | The triage context cannot send mail: `messages send` / `drafts send` are blocked; drafts create/label/archive still work | `gate:inbox-no-send` (hook negative test); one live triage run completes normally | not_run |
| AC-05 | `cos/CLAUDE.md` charter exists with the autonomy matrix and never-list and is passed to every CoS `claude -p` call | `gate:charter-wired` (asserts the flag in the runner's command construction) | not_run |
| **Phase 1: harden lanes** |||
| AC-06 | Fixture suite of ≥40 labeled emails (newsletter, receipt, shipping, finance, school, payment failure, client ask, invite, personal) with expected lane and action | `gate:triage-fixtures`: dry-run classification, 100% match on 2 consecutive runs (see A1) | not_run |
| AC-07 | Every lane appends a schema-valid run record; invalid records are logged as `failed/invalid_record` | `gate:ledger-schema` with valid and invalid fixtures; live records from all 5 existing lanes | not_run |
| AC-08 | Reconciliation mismatch marks the run `failed` and surfaces in Escalations | `gate:reconcile` with an injected 17-vs-16 fixture | not_run |
| AC-09 | A missing or empty claimed artifact marks the run `failed` | `gate:artifacts` with an injected missing path | not_run |
| AC-10 | `cos health` lists lanes past their window + grace period | `gate:heartbeat` with fixture ledgers; **live:** it flags the current `yt` staleness until that's fixed | not_run |
| AC-11 | Launchd wrappers use absolute paths and retry 3× with backoff; the YT `maxfiles` failure is fixed or escalated | `gate:launchd-lint` over the plists/scripts; live yt record `ok` | not_run |
| AC-23 | Every `claude -p --output-format json` consumer parses both the current event-array output and the legacy single object, through the shared `src/claude/result.ts`; output without a result event is an error | `gate:claude-json-parse` (negative: the legacy parser); live task-capture SMS step completes | not_run |
| **Phase 2: orchestrator and brief** |||
| AC-12 | `cos morning` writes md, html and mp3 briefs with the sections in the specified order; every Decide item has a `source_ref` | `gate:brief-shape` over fixture ledgers | not_run |
| AC-13 | A proposed action whose date doesn't match its re-fetched source goes to Escalations, not Decide | `gate:verify-source` with a mismatched fixture (stubbed fetcher) | not_run |
| AC-14 | Approvals: `approve`/`send`/`skip` change state; `send` shows the recipients and body and sends only that draft; unanswered items expire with no side effect | `gate:approvals` (stubbed gws) including an expiry test; live: 1 real `send` of a self-addressed test draft | not_run |
| AC-15 | After `morning`, a one-line iMessage (status + count of Decide items + brief path) reaches the principal's own handle | Live evidence (screenshot/log). Fallback per A2 | not_run |
| AC-16 | Daily cost is tallied; when it passes $5 the remaining CoS calls are skipped and escalated | `gate:budget` with a fixture over budget | not_run |
| AC-17 | launchd `com.assistance.cos-morning` 07:30 weekdays; wake schedule set | `gate:launchd-lint`; **live:** 5 consecutive weekday briefs with reconciled counts and 0 unverifiable Decide items | not_run |
| AC-35 | The morning iMessage is followed by the brief's MP3 as an attachment, staged in ~/Pictures/Chief of Staff (Messages cannot send from Application Support: error 25), newest 14 kept; a failed attachment shows in the run gaps | `gate:brief-audio`; live: 2026-09-25 audio delivered (chat.db transfer_state 5, error 0) | not_run |
| **Phase 3: commitments, EOD, weekly** |||
| AC-18 | Commitments are captured with `source_ref` and `due_quote`; vague due phrases leave `due_at` null and add an open question | `gate:commitments-dates` (fixtures incl. "by Friday", "next next week", "soon") | not_run |
| AC-19 | A commitment closes only with evidence (sent ID, event UID or task ID) | `gate:commitment-close` negative test | not_run |
| AC-20 | Duplicate commitments across lanes merge into one | `gate:dedupe` fixture (same promise in email and SMS) | not_run |
| AC-21 | `cos eod` at 17:30 writes EOD JSON; the next `morning` consumes it, or escalates `missing_eod` | `gate:eod-handoff`; live 2-day chain | not_run |
| AC-22 | `cos weekly` (Fri 15:00) writes a scorecard with the 5 metrics and promotion candidates, and never changes autonomy by itself | `gate:weekly-shape`; live Friday run | not_run |
| **Live task board (D16)** |||
| AC-24 | `http://127.0.0.1:8787` (launchd keep-alive) shows pending Decide items, Completed (approved / sent / skipped items, kept commitments, checked-off Google Tasks, end-of-day done) for today and this week, open and overdue commitments, and lane health; the page polls every 5 seconds and an action shows up on the next poll | `gate:board-live` (negative: frozen state) | not_run |
| AC-25 | Board actions keep every safety check: token required (401), Host must be localhost (403), JSON-only posts, 127.0.0.1 only; send needs a preview then an explicit confirm and keeps the placeholder, recipient-swap and expiry refusals; commitments close only with evidence | `gate:board-security` (negative: open board) | not_run |
| AC-26 | Mail you already answered (a message you sent later in the same thread) never becomes a Decide item or a reply owed; the board auto-completes pending email items you handled in Gmail, citing your sent message; "Done already" records anything else you finished, with no side effect; a failed check never hides mail | `gate:answered-mail` + `gate:board-live` | not_run |
| AC-36 | Brief items can be answered in the brief page (served by the board) and the board: Done (with note), Accept (never sends), Dismiss, Spam (moves the email to Spam in its account), Hold (needs a note; never expires; listed in each morning brief; Resume brings it back). Reply items also get Send…, which shows the real Gmail draft (To, Subject, body) and sends only on a second Confirm send click | `gate:respond` (negative: everything marked done) | not_run |
| **Hand to agent (D19)** |||
| AC-27 | "Hand to agent" on a board item starts a background, prepare-only agent (one per item, max 2 at once, <= $1.50/run within the $5/day budget, 10-min timeout, Stop button). It returns summary, findings with real message ids, needs-from-you and gaps; code (not the agent) creates the reply draft, only to the original sender in the original thread and never with placeholder text; the item becomes a pending reply that still needs Review & send; spend is logged | `gate:agent-flow` (negative: trusts agent recipient) | not_run |
| AC-28 | The agent runs with the charter, tools Bash/Read/Grep/Glob only (no web, no edits) and a fail-closed allowlist hook: read-only Gmail (messages/threads get|list, labels list) and text utilities; no send, draft, modify, trash, calendar, network tools, interpreters, command substitution or writes outside /tmp | `gate:agent-guard` (negative: no-op guard) | not_run |
| AC-29 | Email addressed to a reply-elsewhere mailbox (UofL: *@louisville.edu, forwarded into Gmail) never gets a Gmail reply draft from the brief or the agent; the item says "reply from Outlook", keeps the suggested text, and the board offers Open Outlook and Copy text | `gate:reply-elsewhere` (negative: rule removed) | not_run |
| AC-34 | Before a hand-off, code (not the agent) extracts the text of the source email's attachments (.docx/.doc/.rtf/.html via textutil, .pdf via pdftotext, .pptx/.xlsx, plain text), max 5 files / 10 MB each / 20k chars, images skipped; the agent receives it framed as data, never instructions; unreadable files appear in its gaps. The agent gains no new tools | `gate:agent-attachments` (negative: raw bytes) | not_run |
| AC-30 | The brief, end-of-day wrap, board and agent read every signed-in Google account (cos/accounts.json); items carry their account (`gmail:<account>:<id>`, old `gmail:<id>` = personal); replies are drafted, previewed and sent in the account the email came to; the agent reads that mailbox | `gate:multi-account` (negative: profile removed) | not_run |
| **Mailbox triage for all accounts (D24)** |||
| AC-31 | owlthat and techunify are triaged by deterministic rules (cos/triage-rules.json): CI alerts, newsletters, notifications and social mail are labeled CoS/... and archived; failed payments are kept and starred; security, legal and app-review mail, starred mail, anyone you've written to, and every unmatched sender stay in the inbox | `gate:triage-rules` (negative: archive-everything rules) | not_run |
| AC-32 | Triage never deletes: dry runs change nothing; real runs archive in label groups and log every change; `triage-undo` restores them; hourly runs use an epoch window | `gate:triage-apply` | not_run |
| AC-33 | The brief tracks owlthat CI from the alert emails (including archived ones): the latest result per workflow wins and a still-RED build is an escalation linking its alert | `gate:ci-status` | not_run |

All gates are registered in `cos/gates.json` (tier, command, script sha256, assertion-file sha256). They run with `npm run gates`, and each gate is proven to fail on its negative fixture before it counts.

### Delivery
- **Repo:** `jwatkins0101/personal` (local `~/Code/assistance`; moved out of iCloud Documents, D11), branch `feature/ai-chief-of-staff` in its own worktree.
- **Deployment units:**
  - launchd agents: `com.assistance.gmail-triage`, `com.assistance.task-capture`, `com.jermaine.deal-watch`, `com.jermaine.yt-daily-brief` (all through `cos/bin/lane-run.sh`), `com.assistance.cos-morning`, `com.assistance.cos-eod`, `com.assistance.cos-weekly`; `com.assistance.flight-check` removed (D10);
  - deployed prompt/runner copies in `~/Library/Application Support/assistance/`.
- **Rollback:** `launchctl bootout gui/$UID/<label>` for the new agents; redeploy the previous prompt from git (`scripts/deploy-triage-launchd.sh` at the prior SHA). The DB tables are additive.
- **CI:** none exists. Gates run locally via `npm run gates` (owner decision OD-1). The release record is the local gate output + commit SHA + live evidence.
- **States tracked separately in feature.json:** implemented, verified, deployed, live_verified.
- **External actions needing explicit approval at runtime:** any email send (`send N`) and the iMessage to self (covered by D2 approval).

## Decision history
See DECISIONS.md.
