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

async function ingestEmails(): Promise<IngestResult> {
  console.log("Fetching unread emails...");
  const emails = await fetchUnreadEmails();
  console.log(`  Found ${emails.length} unread emails`);

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

async function ingestMessages(): Promise<IngestResult> {
  console.log("Fetching recent messages...");
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

  console.log(`  Found ${messages.length} messages`);

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

async function ingestCalendar(): Promise<IngestResult> {
  console.log("Fetching calendar events...");
  const [todayEvents, tomorrowEvents] = await Promise.all([
    getTodayEvents(),
    getTomorrowEvents(),
  ]);

  const events = [...todayEvents, ...tomorrowEvents];
  console.log(`  Found ${events.length} events (today + tomorrow)`);

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

async function main() {
  console.log("Starting ingest...\n");

  const results: IngestResult[] = [];

  try {
    // Run all ingests in parallel
    const [emailResult, messageResult, calendarResult] = await Promise.all([
      ingestEmails().catch((err) => {
        console.error("Email ingest failed:", err.message);
        return { source: "email" as const, total: 0, inserted: 0, duplicates: 0, peopleLinked: 0 };
      }),
      ingestMessages().catch((err) => {
        console.error("Message ingest failed:", err.message);
        return { source: "message" as const, total: 0, inserted: 0, duplicates: 0, peopleLinked: 0 };
      }),
      ingestCalendar().catch((err) => {
        console.error("Calendar ingest failed:", err.message);
        return { source: "calendar" as const, total: 0, inserted: 0, duplicates: 0, peopleLinked: 0 };
      }),
    ]);

    results.push(emailResult, messageResult, calendarResult);

    // Print summary
    console.log("\n--- Ingest Summary ---");
    for (const r of results) {
      let line = `${r.source}: ${r.inserted} new, ${r.duplicates} duplicates (${r.total} total)`;
      if (r.peopleLinked > 0) {
        line += `, ${r.peopleLinked} linked to people`;
      }
      console.log(line);
    }

    // Print overall status counts
    const counts = getStatusCounts();
    console.log("\n--- Database Status ---");
    console.log(`  New: ${counts.new}`);
    console.log(`  Processed: ${counts.processed}`);
    console.log(`  Queued: ${counts.queued}`);
    console.log(`  Acted: ${counts.acted}`);
    console.log(`  Ignored: ${counts.ignored}`);
    console.log(`  Error: ${counts.error}`);

    // Print people count
    console.log(`\n--- People ---`);
    console.log(`  Total: ${getPeopleCount()}`);
  } finally {
    closeDb();
  }
}

main().catch((err) => {
  console.error("Ingest failed:", err);
  closeDb();
  process.exit(1);
});
