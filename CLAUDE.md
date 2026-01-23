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

# Type checking
npm run build               # tsc --noEmit
```

## Architecture

This is a macOS-only productivity assistant that uses **AppleScript** (via bash scripts) to interact with Apple Mail, Apple Calendar, and Messages. It uses the **Claude CLI** (`claude` command) for AI-powered classification and analysis.

### Data Flow

1. **Shell scripts** (`scripts/*.sh`) execute AppleScript to read from macOS apps
2. **TypeScript clients** parse the script output using `<||>` and `<|>` delimiters
3. **Claude CLI** is spawned as a subprocess for classification/analysis
4. Results are formatted and optionally written to files

### Key Modules

- `src/mail/client.ts` - Apple Mail interface via `scripts/get-mail.sh`, `archive-mail.sh`, `flag-mail.sh`
- `src/calendar/apple.ts` - Apple Calendar interface via `scripts/get-calendar-events.sh`
- `src/messages/client.ts` - iMessage/SMS via direct SQLite queries on `~/Library/Messages/chat.db`
- `src/claude/invoke.ts` - Spawns Claude CLI with prompts, parses JSON responses
- `src/digest/generator.ts` - Orchestrates fetching from all sources, calls Claude for analysis

### Email Categories and Actions

Categories defined in `src/mail/types.ts`:
- **Archived automatically**: newsletter, receipt, social, spam, promotional
- **Kept in inbox**: work, teaching, important, urgent, personal, uncategorized

Each category maps to an Apple Mail flag color (red=urgent, orange=important, blue=work, etc.).

### Environment Variables

- `MAX_EMAILS_PER_RUN` - Limit emails processed per run (default: 20)

## Notes

- Scripts have a 180-second timeout; AppleScript itself times out at 120 seconds
- The digest generator fetches calendar events and messages in parallel with email analysis
- Claude CLI is called with `--output-format json` and responses are parsed for embedded JSON
