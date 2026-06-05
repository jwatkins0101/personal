// Ingest command: fetch mail/messages/calendar and store as new items

import { createHash } from "crypto";
import { fetchUnreadEmails } from "../mail/client.js";
import { MessagesClient } from "../messages/client.js";
import { getTodayEvents, getTomorrowEvents } from "../calendar/apple.js";
import {
  insertItem,
  closeDb,
  getStatusCounts,
  type NewMemoryItem,
  type ItemSource,
} from "../storage/index.js";
import { linkItemToMatchedPerson, matchOrCreatePerson } from "../people/matcher.js";
import { getPeopleCount } from "../people/repository.js";
import type { EmailMessage } from "../mail/types.js";
import type { Message } from "../messages/types.js";
import type { CalendarEvent } from "../calendar/apple.js";
import type { StepResult } from "../pipeline/types.js";

type LogFn = (...args: unknown[]) => void;

/**
 * Compute SHA256 hash of content for deduplication.
 */
function computeHash(content: string): string {
  return createHash("sha256").update(content).digest("hex");
}

/**
 * Truncate text to a maximum length.
 */
function truncate(text: string, maxLength = 500): string {
  if (text.length <= maxLength) return text;
  return text.slice(0, maxLength) + "...";
}

/**
 * Convert an EmailMessage to a NewMemoryItem.
 */
function emailToMemoryItem(email: EmailMessage): NewMemoryItem {
  const content = `${email.subject}\n${email.from}\n${email.snippet}`;
  return {
    source: "email",
    source_ref: email.id,
    occurred_at: email.date || new Date().toISOString(),
    title: email.subject || "(No subject)",
    snippet: truncate(email.snippet || ""),
    raw_hash: computeHash(content),
    metadata_json: JSON.stringify({
      from: email.from,
      to: email.to,
      account: email.account,
      labels: email.labels,
      threadId: email.threadId,
    }),
  };
}

/**
 * Convert a Message to a NewMemoryItem.
 */
function messageToMemoryItem(message: Message): NewMemoryItem {
  const content = `${message.handleId}\n${message.text}`;
  const title = message.isFromMe
    ? `To: ${message.handleId}`
    : `From: ${message.handleId}`;

  return {
    source: "message",
    source_ref: String(message.id),
    occurred_at: message.date.toISOString(),
    title: title,
    snippet: truncate(message.text || ""),
    raw_hash: computeHash(content),
    metadata_json: JSON.stringify({
      handleId: message.handleId,
      isFromMe: message.isFromMe,
      isRead: message.isRead,
      hasAttachments: message.hasAttachments,
      chatId: message.chatId,
      guid: message.guid,
    }),
  };
}

/**
 * Convert a CalendarEvent to a NewMemoryItem.
 */
function calendarEventToMemoryItem(event: CalendarEvent): NewMemoryItem {
  // Create a unique source_ref from title and start time
  const sourceRef = computeHash(`${event.title}:${event.startTime}`).slice(0, 16);
  const content = `${event.title}\n${event.startTime}\n${event.location || ""}`;

  return {
    source: "calendar",
    source_ref: sourceRef,
    occurred_at: event.startTime,
    title: event.title,
    snippet: truncate(
      [
        event.isAllDay ? "All day" : `${event.startTime} - ${event.endTime}`,
        event.location,
        event.calendar ? `Calendar: ${event.calendar}` : "",
      ]
        .filter(Boolean)
        .join("\n")
    ),
    raw_hash: computeHash(content),
    metadata_json: JSON.stringify({
      startTime: event.startTime,
      endTime: event.endTime,
      location: event.location,
      calendar: event.calendar,
      isAllDay: event.isAllDay,
    }),
  };
}

interface IngestResult {
  source: ItemSource;
  total: number;
  inserted: number;
  duplicates: number;
  peopleLinked: number;
}

async function ingestEmails(log: LogFn): Promise<IngestResult> {
  log("Fetching unread emails...");
  const emails = await fetchUnreadEmails();
  log(`  Found ${emails.length} unread emails`);

  let inserted = 0;
  let duplicates = 0;
  let peopleLinked = 0;

  for (const email of emails) {
    const item = emailToMemoryItem(email);
    const result = insertItem(item);
    if (result.inserted) {
      inserted++;

      // Try to link to a person by email
      const match = linkItemToMatchedPerson(result.id, { email: email.from });
      if (match.person) {
        peopleLinked++;
      }
    } else {
      duplicates++;
    }
  }

  return { source: "email", total: emails.length, inserted, duplicates, peopleLinked };
}

async function ingestMessages(log: LogFn): Promise<IngestResult> {
  log("Fetching recent messages...");
  const client = new MessagesClient();

  // Get today's messages and any unread
  const [todaysMessages, unreadMessages] = await Promise.all([
    client.getTodaysMessages(),
    client.getUnreadMessages(),
  ]);

  // Combine and dedupe by ID
  const messageMap = new Map<number, Message>();
  for (const msg of [...todaysMessages, ...unreadMessages]) {
    messageMap.set(msg.id, msg);
  }
  const messages = Array.from(messageMap.values());

  log(`  Found ${messages.length} messages`);

  let inserted = 0;
  let duplicates = 0;
  let peopleLinked = 0;

  for (const message of messages) {
    const item = messageToMemoryItem(message);
    const result = insertItem(item);
    if (result.inserted) {
      inserted++;

      // Link to person by phone/email (handleId can be either)
      if (!message.isFromMe && message.handleId) {
        const { person, created } = matchOrCreatePerson(message.handleId, "messages_ingest");
        if (person) {
          const { linkItemToPerson } = await import("../people/repository.js");
          linkItemToPerson(result.id, person.id, 0.95, "iMessage contact match");
          peopleLinked++;
        }
      }
    } else {
      duplicates++;
    }
  }

  return { source: "message", total: messages.length, inserted, duplicates, peopleLinked };
}

async function ingestCalendar(log: LogFn): Promise<IngestResult> {
  log("Fetching calendar events...");
  const [todayEvents, tomorrowEvents] = await Promise.all([
    getTodayEvents(),
    getTomorrowEvents(),
  ]);

  const events = [...todayEvents, ...tomorrowEvents];
  log(`  Found ${events.length} events (today + tomorrow)`);

  let inserted = 0;
  let duplicates = 0;

  for (const event of events) {
    const item = calendarEventToMemoryItem(event);
    const result = insertItem(item);
    if (result.inserted) {
      inserted++;
    } else {
      duplicates++;
    }
  }

  return { source: "calendar", total: events.length, inserted, duplicates, peopleLinked: 0 };
}

// ---------------------------------------------------------------------------
// Exported core logic — callable from the pipeline or other modules.
// Does NOT call closeDb() or process.exit().
// ---------------------------------------------------------------------------

export interface IngestOptions {
  verbose?: boolean;
}

export async function runIngest(
  options: IngestOptions = {},
): Promise<StepResult> {
  const startedAt = new Date();
  const log: LogFn = options.verbose !== false
    ? (...args: unknown[]) => console.log(...args)
    : () => {};
  const logError: LogFn = options.verbose !== false
    ? (...args: unknown[]) => console.error(...args)
    : () => {};

  log("Starting ingest...\n");

  const sourceErrors: Array<{ source: string; error: Error }> = [];

  // Run all ingests in parallel
  const [emailResult, messageResult, calendarResult] = await Promise.all([
    ingestEmails(log).catch((err) => {
      logError("Email ingest failed:", err.message);
      sourceErrors.push({ source: "email", error: err });
      return { source: "email" as const, total: 0, inserted: 0, duplicates: 0, peopleLinked: 0 };
    }),
    ingestMessages(log).catch((err) => {
      logError("Message ingest failed:", err.message);
      sourceErrors.push({ source: "message", error: err });
      return { source: "message" as const, total: 0, inserted: 0, duplicates: 0, peopleLinked: 0 };
    }),
    ingestCalendar(log).catch((err) => {
      logError("Calendar ingest failed:", err.message);
      sourceErrors.push({ source: "calendar", error: err });
      return { source: "calendar" as const, total: 0, inserted: 0, duplicates: 0, peopleLinked: 0 };
    }),
  ]);

  const results: IngestResult[] = [emailResult, messageResult, calendarResult];

  // Print summary
  log("\n--- Ingest Summary ---");
  for (const r of results) {
    let line = `${r.source}: ${r.inserted} new, ${r.duplicates} duplicates (${r.total} total)`;
    if (r.peopleLinked > 0) {
      line += `, ${r.peopleLinked} linked to people`;
    }
    log(line);
  }

  // Print overall status counts
  const dbCounts = getStatusCounts();
  log("\n--- Database Status ---");
  log(`  New: ${dbCounts.new}`);
  log(`  Processed: ${dbCounts.processed}`);
  log(`  Queued: ${dbCounts.queued}`);
  log(`  Acted: ${dbCounts.acted}`);
  log(`  Ignored: ${dbCounts.ignored}`);
  log(`  Error: ${dbCounts.error}`);

  // Print people count
  log(`\n--- People ---`);
  log(`  Total: ${getPeopleCount()}`);

  const finishedAt = new Date();

  // Determine overall status
  const sourcesFailed = sourceErrors.length;
  const sourcesSucceeded = 3 - sourcesFailed;

  let status: StepResult["status"];
  if (sourcesSucceeded === 3) {
    status = "success";
  } else if (sourcesSucceeded >= 1) {
    status = "partial";
  } else {
    status = "failed";
  }

  const counts: Record<string, number> = {
    emailsTotal: emailResult.total,
    emailsInserted: emailResult.inserted,
    messagesTotal: messageResult.total,
    messagesInserted: messageResult.inserted,
    calendarTotal: calendarResult.total,
    calendarInserted: calendarResult.inserted,
    duplicates: emailResult.duplicates + messageResult.duplicates + calendarResult.duplicates,
    peopleLinked: emailResult.peopleLinked + messageResult.peopleLinked + calendarResult.peopleLinked,
    sourcesFailed,
  };

  const stepResult: StepResult = {
    status,
    counts,
    startedAt,
    finishedAt,
  };

  if (status === "failed") {
    const lastError = sourceErrors[sourceErrors.length - 1];
    stepResult.error = {
      code: "INGEST_ALL_SOURCES_FAILED",
      message: lastError.error.message,
      retryable: true,
    };
  }

  return stepResult;
}

// ---------------------------------------------------------------------------
// CLI entry point — calls runIngest(), handles closeDb() and process.exit().
// ---------------------------------------------------------------------------

async function main() {
  try {
    await runIngest({ verbose: true });
  } finally {
    closeDb();
  }
}

// Only run when executed directly (not when imported by the orchestrator).
const isDirectRun =
  process.argv[1] &&
  import.meta.url.endsWith(process.argv[1].replace(/.*\//, ""));
if (isDirectRun) {
  main().catch((err) => {
    console.error("Ingest failed:", err);
    closeDb();
    process.exit(1);
  });
}
