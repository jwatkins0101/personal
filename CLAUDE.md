# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
# Run email processing (classify and archive/flag unread emails)
npm run process

# Generate daily digest (emails + calendar + messages)
npm run digest              # Console output
npm run digest:html         # HTML file saved to digests/
npm run digest:md           # Markdown file saved to digests/

# Calendar commands
npm run calendar            # Analyze today's schedule
npm run calendar:review     # Review today + tomorrow
npm run calendar:gaps       # Find available time slots
npm run calendar:suggest -- --task "Task name" --duration 60

# Pipeline (orchestrated daily workflow — replaces running ingest/sort/route/briefing individually)
npm run pipeline                             # Full pipeline: ingest → sort → route → briefing
npm run pipeline -- -p refresh               # Midday refresh: ingest → sort only
npm run pipeline -- -p briefing-only         # Briefing from existing data
npm run pipeline -- --dry-run                # Preview without side effects
npm run pipeline -- --from route -v          # Resume from route step, verbose
npm run pipeline -- --steps ingest,sort      # Run specific steps only
npm run pipeline -- --retries 3              # Override retry count per step

# Second Brain commands (individual steps — also usable standalone)
npm run ingest              # Fetch mail/messages/calendar → store in SQLite
npm run sort                # Classify new items, apply bouncer rules
npm run route               # Write sorted items to Apple Notes views
npm run briefing            # Generate daily briefing note
npm run review              # List items queued for human review
npm run review -- <id>      # Show specific item details
npm run fix -- <id> <field> <value>  # Apply user correction
npm run fix -- --approve <id>        # Approve and route an item
npm run fix -- --ignore <id>         # Mark item as ignored
npm run fix -- --stats               # Show correction statistics

# LinkedIn import commands
npm run ingest:linkedin -- <path>    # Import LinkedIn export ZIP or directory
npm run ingest:linkedin -- ~/Downloads/LinkedInExport.zip

# People management commands
npm run review:people                # Show overview + pending matches
npm run review:people -- matches     # List pending match candidates
npm run review:people -- recent      # Show recent LinkedIn connections
npm run review:people -- nudge       # Show people to reconnect with
npm run review:people -- stats       # Show people statistics

npm run fix:person -- search "query"         # Search for people
npm run fix:person -- show <personId>        # Show person details
npm run fix:person -- merge <primaryId> <secondaryId>  # Merge two people
npm run fix:person -- set <personId> email=x@y.com company="Acme"
npm run fix:person -- add-identity <personId> email john@example.com
npm run fix:person -- unlink-item <personId> <itemId>
npm run fix:person -- delete <personId> --yes
npm run fix:person -- create "Name" --email x@y.com --phone 1234567890 --company "Acme"

# Deep dive (ingest all messages/emails for a person)
npm run deep-dive -- <personId_or_name>        # Ingest all messages + emails
npm run deep-dive -- <personId_or_name> --dry-run  # Preview without writing

# Type checking
npm run build               # tsc --noEmit
```

## Architecture

This is a macOS-only productivity assistant. **Email runs on the Gmail API** (via the `gws` CLI for auth); **Calendar, Messages, and Notes use AppleScript** (via bash scripts). It uses the **Claude CLI** (`claude` command) for AI-powered classification and analysis.

### Data Flow

1. **Shell scripts** (`scripts/*.sh`) execute AppleScript to read from macOS apps
2. **TypeScript clients** parse the script output using `<||>` and `<|>` delimiters
3. **Claude CLI** is spawned as a subprocess for classification/analysis
4. Results are formatted and optionally written to files

### Key Modules

- `src/pipeline/` - **Orchestrator** for chaining steps (ingest → sort → route → briefing) with retries, preflight checks, profiles, and DB-persisted run history
- `src/classifier/` - **Unified classifier** for all item types (emails, messages, notes, calendar)
- `src/storage/` - **SQLite storage layer** for unified item storage, action logging, feedback, and pipeline run tracking
- `src/people/` - **People graph** for entity linking (LinkedIn ↔ email sender ↔ iMessage contact)
- `src/linkedin/` - **LinkedIn import** parser for Connections.csv and messages.csv
- `src/notes/` - **Apple Notes integration** via AppleScript for view generation
- `src/commands/` - **CLI commands** (orchestrate, ingest, sort, route, briefing, review, fix, ingest-linkedin, review-people, fix-person, deep-dive)
- `src/mail/client.ts` - Email interface (Gmail API). Backed by `src/mail/gmail-api.ts` (low-level Gmail REST + `gws`-based auth). Archive = remove `INBOX`; mark read = remove `UNREAD`; category/flag = add a Gmail label or `STARRED`.
- `src/calendar/apple.ts` - Apple Calendar interface via `scripts/get-calendar-events.sh`
- `src/messages/client.ts` - iMessage/SMS via direct SQLite queries on `~/Library/Messages/chat.db`
- `src/claude/invoke.ts` - Wraps classifier for backwards-compatible email classification
- `src/digest/generator.ts` - Orchestrates fetching from all sources, uses unified classifier

### Storage Layer (Second Brain)

The `src/storage/` module provides a SQLite-based storage layer:

```typescript
import { insertItem, getItem, updateClassification } from "./storage/index.js";
```

**Database location:** `~/Library/Application Support/assistance/secondbrain.sqlite` (configurable via `DB_PATH` env var)

**Tables:**
- `memory_items` - Unified storage for all ingested items (emails, messages, calendar, notes)
- `action_logs` - Audit trail of all actions taken on items
- `feedback` - User corrections for learning/tuning
- `people` - Contact entities with display name, company, title, etc.
- `person_identities` - Email, phone, LinkedIn URL identities linked to people
- `item_people_map` - Links memory items to people (sender/recipient)
- `linkedin_connections` - LinkedIn connection metadata (connected_on date)
- `linkedin_messages` - LinkedIn message archive
- `import_batches` - Tracks imports with file hash for idempotency
- `match_candidates` - Potential person merges awaiting review

**Item Status Flow:** `new` → `processed` → `queued` | `acted` | `ignored`

**Bouncer Rules (confidence gating):**
| Confidence | Action | Status |
|------------|--------|--------|
| >= 0.85 | Auto-act | `acted` |
| 0.60-0.84 | Queue for review | `queued` |
| < 0.60 | Store only | `processed` |

*Exception: P0 items always go to inbox regardless of confidence.*

### People Graph

The `src/people/` module manages contact entities and links them to items:

```typescript
import { matchOrCreatePerson, listPeopleToNudge } from "./people/index.js";

// During ingest, link items to people
const person = matchOrCreatePerson({ email: "john@example.com", name: "John Doe" });
linkItemToPerson(item.id, person.id, "sender", 0.95);

// Get people to reconnect with
const nudges = listPeopleToNudge(30, 10); // no interaction in 30 days, limit 10
```

**Person ID format:** `li:{linkedin_member_id}` or `em:{sha256(email)}` or `ph:{normalized_phone}`

**Match priority (highest to lowest):**
1. Exact email match
2. LinkedIn profile URL match
3. Phone number match
4. Fuzzy name + company match (creates match_candidate for review)

**Match confidence thresholds:**
| Confidence | Action |
|------------|--------|
| >= 0.85 | Auto-merge |
| 0.60-0.84 | Queue for review (match_candidate) |
| < 0.60 | Create new person |

**Daily briefing includes:**
- New LinkedIn connections
- People to nudge (no interaction in N days)
- Waiting on response items

### Unified Classifier

The `src/classifier/` module provides a single `classifyItems()` function for all item types:

```typescript
import { classifyItems, emailsToClassifiable } from "./classifier/index.js";

const items = emailsToClassifiable(emails);
const results = await classifyItems(items);
```

**Classification output:**
- `type`: email | message | note | calendar
- `category`: urgent | work | personal | newsletter | finance | health | admin | idea | waiting-on | reference
- `priority`: P0 (critical) | P1 (today) | P2 (this week) | P3 (low)
- `confidence`: 0-1
- `reason`: short explanation
- `suggested_next_action`: specific action to take

**Adapters** in `src/classifier/adapters.ts` convert domain objects to classifiable items:
- `emailsToClassifiable()`, `messagesToClassifiable()`, `notesToClassifiable()`, `calendarEventsToClassifiable()`

### Categories and Priorities

| Category | Flag Color | Auto-Archive |
|----------|------------|--------------|
| urgent | red | no |
| work | blue | no |
| personal | green | no |
| finance | yellow | no |
| health | purple | no |
| newsletter | gray | yes |
| reference | none | yes |

### Environment Variables

- `MAX_EMAILS_PER_RUN` - Limit emails processed per run (default: 20)
- `DB_PATH` - SQLite database path (default: `~/Library/Application Support/assistance/secondbrain.sqlite`)
- `BOUNCER_AUTO_ACT` - Confidence threshold for auto-acting (default: 0.85)
- `BOUNCER_QUEUE` - Confidence threshold for queuing (default: 0.60)
- `PEOPLE_NUDGE_DAYS` - Days without interaction before suggesting reconnection (default: 30)

### Apple Notes Integration

The system uses a **template-based approach** for Daily Tasks notes to preserve interactive checklist formatting:

1. **Template note**: User creates "Daily Tasks Template" in "Second Brain" folder with real checklists
2. **Duplication**: System duplicates template for each day (preserves checklist structure)
3. **Section markers**: Content is inserted between `<!-- SECTION_START -->` and `<!-- SECTION_END -->` markers
4. **Checklist preservation**: Existing checkboxes above markers remain interactive

**Setup required**: See `docs/daily-tasks-template.md` for template creation instructions.

**Key functions:**
- `duplicateNote(template, newTitle, folder)` - Duplicates preserving formatting
- `updateNoteSection(title, section, content, folder)` - Updates marked section only
- `createDailyTasksNote(date, sections)` - High-level daily tasks creator

## Automation Conventions

- **Email uses the Gmail API, NOT Apple Mail / AppleScript.** `src/mail/client.ts` → `src/mail/gmail-api.ts`, authenticated through the `gws` CLI (`gws auth export --unmasked` for creds; `gws auth login` to re-auth when the token dies with `invalid_grant`). Do NOT reintroduce `scripts/get-mail.sh` or any AppleScript Mail path — it times out (`AppleEvent timed out -1712`) because `whose`-filters scan the whole mailbox. Quota is 15,000 units/min/user: prefer `listMessageIds` + `batchModify` (≤1000 ids/call) over per-message `get` for bulk work.
- **AppleScript is intentional for Calendar / Messages / Notes.** Do NOT migrate these to DOM/browser automation — shell scripts under `scripts/` are the canonical interface for them.
- **Native OS dialogs cannot be automated**: file pickers, permission modals, download prompts. Stop and prompt the user to drag-and-drop or click manually — don't retry.
- **AppleScript timeouts**: 120s for AppleScript, 180s for the wrapping shell script. If a script hits the timeout, investigate rather than blindly retrying — usually signals a hung app or a permission dialog.

## Notes

- Scripts have a 180-second timeout; AppleScript itself times out at 120 seconds
- The digest generator fetches calendar events and messages in parallel with email analysis
- Claude CLI is called with `--output-format json` and responses are parsed for embedded JSON
- Apple Notes checklists cannot be created via text - use the template approach for interactive checkboxes
