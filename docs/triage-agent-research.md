# Triage Agent — Research Prompt

## Context

You are a senior TypeScript systems engineer specializing in interactive CLI tooling, human-in-the-loop AI workflows, and local-first productivity systems. You have been given the codebase for a **personal productivity assistant** that ingests data from Apple Mail, iMessage, and Apple Calendar, classifies it with Claude AI, stores it in SQLite, and routes it to Apple Notes.

The system uses a **confidence-gated bouncer** to decide what to do with classified items:

| Confidence | Action | Status |
|------------|--------|--------|
| >= 0.85 | Auto-act (route immediately) | `acted` |
| 0.60–0.84 | Queue for human review | `queued` |
| < 0.60 | Store only | `processed` |

Items in the **0.60–0.84 zone** are the problem. They're important enough that the classifier flagged them, but not confident enough to auto-route. Today, handling them requires **two separate manual commands** run in sequence:

```
npm run review              # List queued items, read one at a time
npm run review -- <id>      # Inspect a specific item
npm run fix -- --approve <id>    # Approve → auto-route
npm run fix -- --ignore <id>     # Dismiss
npm run fix -- <id> category work  # Reclassify a field
```

This is friction that causes the review queue to pile up. The user often skips review entirely because the overhead of copy-pasting item IDs and running multiple commands per item is too high.

**The goal:** Design and build a **Triage Agent** — a single interactive command (`npm run triage`) that presents queued items one at a time and accepts quick decisions (approve / ignore / reclassify) in a tight loop, recording feedback and routing items in real time.

## Codebase Facts (Read These Carefully)

### Current Review Workflow

**Review command** (`src/commands/review.ts`):
- `getQueuedItems()` fetches all items with `status='queued'` from SQLite
- Displays top 10 items with: source emoji, category, priority, confidence %, reason, suggested action, date
- `npm run review -- <id>` shows full metadata, status, route, and ingestion timestamp
- `getStatusCounts()` provides summary: `{ new, processed, queued, acted, ignored, error }`

**Fix command** (`src/commands/fix.ts`):
- `approveItem(itemId)` — overrides confidence to 1.0, calls `getBouncerDecision()` to determine route, updates status to `acted`, records feedback, logs action
- `ignoreItem(itemId, note?)` — sets status to `ignored`, records feedback, logs action
- `applyCorrection(itemId, field, value, note?)` — records feedback with old/new values, updates the item field
- Supported correction fields: `category`, `priority`, `status`, `route`

### Bouncer Logic (`src/storage/bouncer.ts`)

```typescript
getBouncerDecision(item, thresholds): BouncerDecision
```

Decision rules (in priority order):
1. **P0 (critical)** → Always route to "inbox" regardless of confidence
2. **Confidence >= 0.85** → Auto-act, route via `getAutoRoute(category, priority)`
3. **Confidence 0.60–0.84** → Queue for review, route = "review"
4. **Confidence < 0.60** → Store only, route = "archive"

Auto-routing map:
- P1 → "inbox"
- newsletter, reference → "archive"
- urgent, work → "notes:inbox"
- personal → "notes:personal"
- finance → "notes:finance"
- health → "notes:health"
- admin → "notes:admin"
- idea → "notes:ideas"
- waiting-on → "notes:waiting"

### Storage Layer Functions

```typescript
// Querying
getQueuedItems()                    // All items with status='queued'
getItem(id)                         // Single item by ID
getStatusCounts()                   // { new, processed, queued, acted, ignored, error }

// Updating
updateClassification(id, { category, priority, confidence, reason, suggested_actions_json })
updateStatus(id, status)
updateRoute(id, route)
updateStatusAndRoute(id, status, route)

// Feedback
applyCorrection(itemId, field, value, note?)  // Records feedback + updates item
recordFeedback({ item_id, created_at, field, old_value, new_value, user_note })
getFeedbackStats()
getCommonCorrections(field)

// Audit
logSuccess(itemId, action, inputs?, outputs?)
logFailure(itemId, action, errorMessage, inputs?)
```

### Database Schema (Relevant Tables)

**memory_items:** `id`, `source`, `source_ref`, `ingested_at`, `occurred_at`, `title`, `summary`, `snippet`, `category`, `priority`, `confidence`, `reason`, `suggested_actions_json`, `status`, `route`, `metadata_json`

**feedback:** `id`, `item_id`, `created_at`, `field`, `old_value`, `new_value`, `user_note`

**action_logs:** `id`, `item_id`, `action`, `performed_at`, `inputs_json`, `outputs_json`, `result`, `error_message`

### Existing Command Patterns

Every command in `src/commands/` follows this structure:
1. Parse CLI args (positional + flags)
2. Call storage functions
3. Print formatted output to console
4. `closeDb()` in finally block, `process.exit(1)` on error

The **fix-person** command (`src/commands/fix-person.ts`) is the closest existing analogy to interactive multi-action CLI usage — it handles subcommands (search, show, merge, set, create, delete) via argument parsing.

### Pipeline Integration

The orchestrator pipeline (`src/pipeline/`) chains steps with this interface:

```typescript
interface Step {
  name: StepName
  preflight?(ctx: PipelineContext): { ready: boolean; reason?: string }
  run(ctx: PipelineContext): Promise<StepResult>
}
```

The sort command exports `runSort()` and the route command exports `runRoute()` for pipeline use. Any new command should follow this pattern if it needs pipeline integration.

### Environment & Constraints

- macOS only, Node.js + TypeScript (tsx runner)
- SQLite via `better-sqlite3` (synchronous API, singleton connection via `getDb()`)
- No test suite — `npm run build` (tsc --noEmit) is the only validation
- CLI-only — no web UI, no Electron, terminal interaction only
- Claude CLI is available on PATH for any AI-powered features
- The user runs commands via `npm run <script>` mapped in `package.json`
- Apple Notes routing happens via AppleScript through `src/notes/` module

---

## Research Objectives

Investigate the following areas and return findings with concrete, implementable recommendations for each.

---

### 1. Interactive CLI Architecture

- What is the right Node.js library for building an interactive triage loop in the terminal? Evaluate: (a) raw `process.stdin` with readline, (b) `inquirer` / `@inquirer/prompts`, (c) `prompts`, (d) `clack` / `@clack/prompts`, (e) `ink` (React for CLI). Consider: minimal dependencies, speed of interaction (single-keypress vs. enter-to-confirm), support for displaying rich item previews, and compatibility with the existing tsx + ESM setup.
- The core UX is: **display item → wait for keypress → act → next item**. What interaction pattern minimizes friction? Research single-key shortcuts (a=approve, i=ignore, c=correct, s=skip, q=quit) vs. menu selection vs. numbered choices. Look at how `lazygit`, `tig`, or `gh pr review` handle rapid item-by-item decisions.
- Should the triage loop be a REPL (persistent prompt, user types commands) or a "card deck" (system presents items, user reacts)? Evaluate the UX tradeoff: REPLs give power users flexibility but add cognitive load; card decks are faster for the common case (approve/ignore) but need an escape hatch for corrections.
- How should the item display be formatted in terminal? Research: compact single-line summaries vs. multi-line detail cards. The user needs to see at minimum: source type, sender/from, subject/title, snippet, classifier's category + priority + confidence, reason, and suggested action. How much content can fit in a standard 80x24 terminal without scrolling?
- Research whether `blessed`, `blessed-contrib`, or `terminal-kit` could provide a split-pane TUI (queue list on left, item detail on right) — and whether that complexity is justified for a queue of typically 5-20 items.

### 2. Triage Decision Model

- Define the complete set of actions a user can take on a queued item. Minimum viable: approve (accept classification, route it), ignore (dismiss), skip (defer to next item). Extended: reclassify category, change priority, change route, add note, view full metadata. Which actions should be single-keypress and which should require a sub-prompt?
- When the user approves an item, the system needs to: (a) override confidence to 1.0, (b) call `getBouncerDecision()` for routing, (c) update status and route, (d) record feedback, (e) log the action. Should this trigger Apple Notes routing immediately (call the route logic inline), or just mark it for the next `npm run route` pass? Evaluate latency vs. simplicity.
- When the user reclassifies an item (e.g., changes category from "newsletter" to "work"), should the system: (a) just record the correction and let the user approve separately, (b) auto-approve after correction (assume the user's reclassification is authoritative), or (c) re-run the bouncer with the corrected fields and let the confidence gate decide? Design the most intuitive flow.
- Research how confidence feedback could improve future classifications. If the user consistently promotes "newsletter" items to "work" from a specific sender, could this pattern be surfaced or used? The `feedback` table and `getCommonCorrections()` already exist — how could the triage agent leverage them to show "you've corrected this pattern 3 times before" hints?
- Should items be presented in a specific order? Options: (a) highest confidence first (easiest decisions at top), (b) lowest confidence first (hardest decisions, most valuable feedback), (c) by priority (P0 > P1 > P2 > P3), (d) by date (newest first), (e) by source type (emails, then messages, then calendar). What order maximizes triage throughput?

### 3. Batch Triage Shortcuts

- Beyond item-by-item review, research "bulk action" patterns: approve all items above a confidence threshold (e.g., "approve all >= 0.80"), ignore all newsletters, approve all from a specific sender. How should these be triggered — as commands within the triage loop, or as flags when launching? (e.g., `npm run triage -- --auto-approve 0.80`)
- Research whether the triage agent should support "undo" for the most recent action. If the user accidentally approves an item, can they press `u` to reverse it? What storage operations need to be reversed (status, route, feedback, action log)?
- Should the triage agent pre-group items by similarity? For example, if 5 queued items are all newsletters from different senders, presenting them as a group ("5 newsletters — approve all?") could 5x the throughput. Research clustering approaches: group by category, by sender, by priority, or by classifier reason.
- What should happen to items the user skips? Options: (a) leave as queued for next triage session, (b) move to end of current queue, (c) auto-ignore after N skips across sessions. Research "stale queue" management patterns.

### 4. Integration with Pipeline

- Should `npm run triage` be a standalone command or a step in the pipeline? If it's a pipeline step, it blocks on user input — which conflicts with the orchestrator's goal of unattended automation. Research hybrid approaches: (a) pipeline runs unattended, triage runs separately on accumulated queue, (b) pipeline pauses for triage if queue is non-empty, (c) triage is always standalone but pipeline skips routing queued items.
- Research a "triage-then-route" compound command: `npm run triage` runs the interactive loop, and when the user quits, it automatically routes all newly-approved items. This would replace three commands (`review` → `fix` → `route`) with one.
- Should the triage agent be integrated into the briefing? For example, the briefing note already lists queued items — could it include a "run `npm run triage` to review 7 items" call-to-action? Or could the briefing trigger triage automatically?
- How should the triage agent interact with `npm run sort`? If the user runs sort and then immediately runs triage, the queue is fresh. But if triage is run standalone, the queue may contain items from multiple sort runs. Should triage show the ingestion date and "age" of each item?

### 5. State Management & Resilience

- The triage loop modifies the database as it goes (approve/ignore/correct). If the user quits mid-session (Ctrl+C), some items are acted on and some aren't. Is this acceptable, or should the loop batch all changes and commit at the end? Research the tradeoff: immediate writes are resilient to crashes but irreversible; batched writes allow "cancel session" but risk data loss on crash.
- SQLite with `better-sqlite3` is synchronous. The triage loop is inherently async (waiting for user input). Research whether there are any pitfalls with mixing synchronous DB writes and async readline/inquirer input handlers in Node.js.
- Should the triage agent persist session state? For example, if the user triages 5 of 12 items and quits, should the next `npm run triage` resume from item 6? Or always start fresh from the full queued list? Research: is item ordering stable enough (by `ingested_at`?) to make resume meaningful?
- What happens if the queue changes while the user is triaging? (e.g., a background `npm run sort` adds new items). Since `better-sqlite3` uses WAL mode, reads see a consistent snapshot — but should the triage agent warn about stale data or refresh the queue periodically?

### 6. CLI UX & Display Design

- Design the item display card. Given the fields available (`source`, `title`, `snippet`, `category`, `priority`, `confidence`, `reason`, `suggested_actions_json`, `occurred_at`, `metadata_json`), what layout maximizes scanability? Research how `gh issue view`, `taskwarrior`, and `jira-cli` format item details in terminal.
- Research terminal color and formatting options for Node.js: `chalk`, `kleur`, `picocolors`, `ansi-colors`. Which is lightest-weight and ESM-compatible? Design a color scheme: confidence as a color gradient (red < 0.65, yellow 0.65-0.75, green > 0.75), priority badges (P0 red, P1 orange, P2 blue, P3 gray), source icons.
- The progress indicator matters — the user needs to know "I'm on item 3 of 12, 2 approved, 0 ignored." Research compact progress bar formats for terminal. Consider: `[3/12] ✓2 ✗0 ↷1` or a top-of-screen status line.
- How should the triage agent handle long snippets or items with lots of metadata? Options: (a) truncate to N lines with a "press 'd' for details" expansion, (b) paginate with `less`-like scrolling, (c) always show full content. Research what works best for email subjects + first 3 lines of body.
- Should the triage agent support terminal width detection and responsive layout? Or is a fixed-width format (80 chars) sufficient? Research `process.stdout.columns` reliability and whether it's worth the complexity.

### 7. Feedback Loop & Learning

- The `feedback` table records every correction. Research whether the triage agent should use this history to: (a) pre-fill suggestions ("last time you changed this sender from newsletter to work"), (b) surface correction patterns at the end of a triage session ("you reclassified 4 newsletters → work today"), (c) adjust local bouncer thresholds over time (if user approves 90% of items at 0.70+, raise the auto-act threshold for that category).
- Could the triage agent use Claude CLI to generate a "triage summary" after a session? For example: "You triaged 12 items: approved 8 (mostly work email from known senders), ignored 3 newsletters, reclassified 1 message from personal to work. Suggestion: auto-approve emails from @company.com next time." Research whether this adds value or is over-engineering.
- Research "active learning" patterns for human-in-the-loop classification. The 0.60–0.84 confidence zone is exactly where the classifier is uncertain — user corrections here are the highest-signal training data. How should corrections be structured to eventually improve the classifier prompt? Could the triage agent append correction patterns to the classifier's system prompt?
- The `getCommonCorrections(field)` function already analyzes feedback patterns. Research how to surface these as "auto-rules" — for example, if the user has corrected 5+ items from the same sender to the same category, suggest creating a permanent routing rule.

### 8. Refactoring Requirements

- The `approveItem()` and `ignoreItem()` functions in `src/commands/fix.ts` contain the core triage logic but are embedded in a CLI command parser. Research how to extract them into a shared module (`src/triage/actions.ts`?) that both `fix.ts` and the new triage agent can import.
- The review command's item display formatting (source emoji, confidence bar, etc.) should be reusable. Research whether to extract it into a shared formatter (`src/triage/display.ts`?) or keep display logic in the triage agent.
- Should the triage agent export a `runTriage()` function for pipeline integration, following the pattern of `runSort()` and `runRoute()`? If so, what does a non-interactive `runTriage()` look like — just auto-approve everything above a threshold?
- Research the `package.json` script registration pattern: `"triage": "tsx src/commands/triage.ts"`. Should this be `triage` or `review:interactive` or something else? Consider discoverability alongside existing `review` and `fix` commands.

---

## Output Format

For each section, provide:
1. **Key findings** — what you discovered, with code examples or references where applicable
2. **Recommended approach** — the specific pattern or architecture to use, with rationale
3. **Implementation sketch** — enough TypeScript pseudocode or structure to start coding
4. **Risks & mitigations** — what could go wrong and how to handle it

Close with:
- **Recommended file structure** for the triage agent module
- **Refactoring checklist** — ordered list of changes to existing files before the triage agent can work
- **MVP scope** — the minimum viable triage agent (what to build first, what to defer)
- **Phase 2 scope** — batch actions, feedback learning, pipeline integration, and advanced UX to add later
