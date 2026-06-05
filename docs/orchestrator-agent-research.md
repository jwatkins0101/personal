# Orchestrator Agent — Research Prompt

## Context

You are a senior TypeScript systems engineer specializing in workflow orchestration, error recovery, and macOS automation. You have been given the codebase for a **personal productivity assistant** that ingests data from Apple Mail, iMessage, and Apple Calendar, classifies it with Claude AI, routes it to Apple Notes, and generates daily briefings.

The system currently requires **four separate manual commands** run in sequence:

```
npm run ingest    →  npm run sort    →  npm run route    →  npm run briefing
```

Each command is a standalone TypeScript script that opens/closes its own SQLite connection, does its work, prints a summary, and exits. They must run in order because each depends on the prior step's database writes. The user runs these manually every morning (and sometimes again mid-day), which is friction that kills the habit.

**The goal:** Design and build a single Orchestrator Agent that chains the full pipeline with intelligent error handling, partial-success recovery, and clear reporting — so the user runs one command and gets a briefing.

## Codebase Facts (Read These Carefully)

### Current Pipeline Architecture

**Step 1 — Ingest** (`src/commands/ingest.ts`)
- Fetches emails, messages, and calendar events **in parallel** via `Promise.all`
- Each source has its own catch handler — if one fails, the others still complete
- Inserts items into SQLite `memory_items` table with status `new`
- Links items to people via `matchOrCreatePerson()`
- Outputs: count of inserted vs duplicates per source, database status counts
- **Failure mode:** AppleScript timeout (Mail.app not running, Calendar permission denied), iMessage DB locked

**Step 2 — Sort** (`src/commands/sort.ts`)
- Reads all items with status `new` (unclassified) from SQLite
- Converts to `ClassifiableItem[]` and sends to Claude CLI in batches of 10
- Claude CLI is spawned as a subprocess: `claude -p <prompt> --output-format json --model sonnet`
- Applies bouncer confidence gating: >= 0.85 auto-act, 0.60-0.84 queue, < 0.60 store-only
- P0 items always route to inbox regardless of confidence
- Updates item classification (category, priority, confidence) and route in DB
- **Failure mode:** Claude CLI timeout (120s), JSON parse errors from stdout, empty classification response

**Step 3 — Route** (`src/commands/route.ts`)
- Reads items with status `processed` grouped by route
- Generates formatted content for each Apple Notes folder (Inbox, Review, Work, Personal, etc.)
- Calls `upsertNote()` which runs AppleScript to create/update notes
- Marks successfully routed items as `acted`
- **Failure mode:** AppleScript timeout, Notes.app not running, note creation fails silently

**Step 4 — Briefing** (`src/commands/briefing.ts`)
- Reads high-priority items, queued items, calendar events, people-to-nudge, recent connections
- Tries template-based approach first (duplicates a template note), falls back to HTML upsert
- Calendar fetch can fail independently (caught, returns empty array)
- **Failure mode:** Template note not found, AppleScript timeout, calendar fetch failure

### Database Details

- **Location:** `~/Library/Application Support/assistance/secondbrain.sqlite`
- **Connection:** Singleton via `getDb()`, closed via `closeDb()` — each command currently calls `closeDb()` at exit
- **WAL mode** enabled for concurrent reads
- **Status flow:** `new` → `processed` → `queued` | `acted` | `ignored`
- **Key query:** `getStatusCounts()` returns `{ new, processed, queued, acted, ignored, error }` — useful for pipeline health checks

### Error Handling Today

- **Retry utility** (`src/utils/retry.ts`): exponential backoff with configurable max attempts, delay, and fallback values. Already used by mail and calendar fetching.
- **Each command** wraps its `main()` in try/finally with `closeDb()` and `process.exit(1)` on failure
- **Ingest** is the most resilient: each source wrapped in `.catch()` so one failing doesn't block others
- **Sort** logs failures per-item to `action_logs` table but aborts the whole batch if Claude CLI fails
- **Route** logs per-item failures but continues to next route on error
- **Briefing** falls back from template to HTML on any template error

### Environment & Constraints

- macOS only — AppleScript is the interface to Mail, Calendar, and Notes
- Apple apps must be running for their scripts to work
- Claude CLI must be installed and on PATH
- Scripts have 180s process timeout, AppleScript has 120s internal timeout
- SQLite DB is local, no network dependency for storage
- No test suite exists — `npm run build` (tsc --noEmit) is the only validation

---

## Research Objectives

Investigate the following areas and return findings with concrete, implementable recommendations for each.

---

### 1. Orchestration Architecture

- What is the right abstraction for chaining these four steps within a single Node.js process? Evaluate: (a) sequential async function calls sharing a DB connection, (b) a pipeline/middleware pattern, (c) a lightweight state machine, (d) spawning each step as a subprocess. Consider that the commands currently each manage their own `closeDb()` lifecycle.
- How should the orchestrator manage the SQLite connection? The current pattern of open/close per command won't work in a single process. Research whether `better-sqlite3` supports long-lived connections safely, and what happens if a step throws mid-transaction.
- Should the orchestrator import the step functions directly (refactoring each command to export its `main()` or core logic), or should it shell out to `tsx src/commands/ingest.ts` etc.? Weigh: code reuse, error propagation, DB connection sharing, and the effort to refactor.
- Research how other TypeScript CLI tools handle multi-step pipelines with partial failure (e.g., Turborepo task graph, Nx pipeline, Changesets release flow). What patterns translate to a single-user local tool?

### 2. Error Recovery & Partial Success

- The ingest step can partially succeed (emails fail but messages work). How should the orchestrator decide whether to proceed to sort? Define a clear policy: (a) always proceed if any source succeeded, (b) require a minimum number of new items, (c) proceed but tag the run as degraded.
- If sort fails mid-batch (e.g., Claude CLI times out on batch 3 of 5), batches 1-2 are already committed to SQLite. Should the orchestrator re-run sort (which will skip already-classified items), retry just the failed batch, or proceed to route with whatever got classified?
- AppleScript is the most unreliable layer. Research patterns for "app readiness checks" — can we verify Mail.app, Calendar.app, and Notes.app are running before starting the pipeline? What AppleScript or `osascript` commands can test app availability without side effects?
- Design a retry strategy specifically for the orchestrator: which steps should retry (ingest yes, sort maybe, route yes, briefing yes), how many times, and with what backoff? The existing `retry()` utility supports this.

### 3. Pipeline Observability & Reporting

- The user currently reads console output from each command. In a single orchestrator run, this becomes a wall of text. Design a reporting format that shows: (a) per-step status (pass/partial/fail), (b) item counts flowing through the pipeline, (c) total wall-clock time, (d) actionable errors only.
- Should the orchestrator log its runs to the `action_logs` table? If so, what action type and what input/output structure? This would enable "when did I last run the pipeline" queries.
- Research whether the orchestrator should write a pipeline-run summary to Apple Notes (a "run log" note) or just to console. Consider: the user already gets a briefing note — duplicating status there might be noise.
- What is the minimum viable dashboard for pipeline health? Could `getStatusCounts()` before and after each step provide a "flow meter" showing items moving through the funnel?

### 4. Scheduling & Triggers

- The user wants to run this daily. Research options: (a) macOS `launchd` plist for scheduling, (b) cron job, (c) a long-running daemon with `setInterval`, (d) Shortcuts.app automation. Which is most reliable for a tool that depends on GUI apps (Mail, Calendar, Notes) being accessible?
- If using `launchd`: what are the gotchas for running AppleScript from a launchd agent vs. a login item? Does the script have access to the GUI session? Research the `LimitLoadToSessionType` and `ProcessType` keys.
- Should the orchestrator support both manual (`npm run pipeline`) and scheduled modes? If so, should scheduled mode suppress console output and write to a log file instead?
- Research whether macOS Focus modes, Do Not Disturb, or screen lock affect AppleScript execution. Can the pipeline run while the screen is locked?

### 5. Concurrency & Performance

- Ingest already runs three sources in parallel. Could sort and route overlap? Specifically: could items that finish classification in batch 1 start routing while batch 2 is still being classified? Research whether this "streaming pipeline" approach is worth the complexity for a dataset of 20-50 items.
- The classifier spawns Claude CLI as a subprocess. If the orchestrator also needs Claude for briefing content, is there a risk of concurrent Claude processes conflicting? Research Claude CLI's behavior with concurrent invocations.
- What is the typical wall-clock time for the full pipeline today? (Estimate from: AppleScript fetch ~10-30s per source, Claude classification ~15-30s per batch of 10, Note creation ~5s per note.) Is the total under 2 minutes, or do we need to optimize?

### 6. Configuration & Extension Points

- What configuration should the orchestrator expose? Candidates: which steps to run (skip briefing on weekends?), dry-run mode (ingest + sort but don't write notes), verbose vs. quiet output, force re-run (re-sort already-sorted items).
- Should the orchestrator support "profiles" — e.g., a morning run (full pipeline) vs. a midday refresh (ingest + sort only) vs. an evening review (briefing only)?
- How should the orchestrator integrate with the existing `npm run` commands? Should `npm run pipeline` exist alongside the individual commands, or should the individual commands become flags on the orchestrator (`npm run pipeline -- --step ingest`)?
- Research whether the orchestrator should be a new command file (`src/commands/orchestrate.ts`) or a higher-level entry point (`src/pipeline.ts`). Consider the existing file organization pattern.

### 7. Refactoring Requirements

- Each command currently has a `main()` function that calls `closeDb()` in a finally block and `process.exit(1)` on error. To compose these in an orchestrator, they need to: (a) export their core logic without DB lifecycle management, (b) throw errors instead of calling `process.exit()`, (c) return structured results instead of printing to console. Estimate the refactoring effort for each command.
- The `closeDb()` calls are scattered. Research whether a single "cleanup on process exit" handler (via `process.on('exit')` or `process.on('SIGINT')`) is safer than manual close calls.
- Sort processes items in batches of 10. Should this batch size be configurable from the orchestrator? Could the orchestrator adjust batch size based on how many items ingest found (smaller batches for 5 items, larger for 50)?
- What shared types or interfaces should be defined for step results? Design a `StepResult` type that all four steps return, enabling the orchestrator to make uniform decisions.

---

## Output Format

For each section, provide:
1. **Key findings** — what you discovered, with code examples or references where applicable
2. **Recommended approach** — the specific pattern or architecture to use, with rationale
3. **Implementation sketch** — enough TypeScript pseudocode or structure to start coding
4. **Risks & mitigations** — what could go wrong and how to handle it

Close with:
- **Recommended file structure** for the orchestrator module
- **Refactoring checklist** — ordered list of changes to existing files before the orchestrator can work
- **MVP scope** — the minimum viable orchestrator (what to build first, what to defer)
- **Phase 2 scope** — scheduling, profiles, and advanced error recovery to add later
