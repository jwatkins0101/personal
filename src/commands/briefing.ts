// Briefing command: generate daily briefing note

import {
  getHighPriorityItems,
  getQueuedItems,
  getStatusCounts,
  closeDb,
  getItemsByStatus,
  type MemoryItem,
} from "../storage/index.js";
import { getTodayEvents } from "../calendar/apple.js";
import { createBriefingFromTemplate, upsertNote, generateBriefingView } from "../notes/index.js";
import {
  listPeopleToNudge,
  getRecentConnections,
  getLinkedInConnectionCount,
  getPeopleCount,
} from "../people/index.js";
import type { CalendarEvent } from "../calendar/apple.js";

/**
 * Get urgent (P0) items.
 */
function getUrgentItems(items: MemoryItem[]): MemoryItem[] {
  return items.filter((item) => item.priority === "P0");
}

/**
 * Get today's action items (P0 and P1).
 */
function getTodayActionItems(items: MemoryItem[]): MemoryItem[] {
  return items.filter(
    (item) => item.priority === "P0" || item.priority === "P1"
  );
}

/**
 * Get items with "waiting-on" category.
 */
function getWaitingOnItems(): MemoryItem[] {
  // Get processed items with waiting-on category
  const items = getItemsByStatus("processed");
  return items.filter((item) => item.category === "waiting-on");
}

/**
 * Generate and save the daily briefing note.
 */
async function generateBriefing(): Promise<void> {
  const now = new Date();
  const dateStr = now.toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });

  console.log(`Generating briefing for ${dateStr}...\n`);

  // Fetch data in parallel
  const [highPriorityItems, calendarEvents, queuedItems] = await Promise.all([
    Promise.resolve(getHighPriorityItems()),
    getTodayEvents().catch((err) => {
      console.warn("Could not fetch calendar events:", err.message);
      return [] as CalendarEvent[];
    }),
    Promise.resolve(getQueuedItems()),
  ]);

  console.log(`  High priority items: ${highPriorityItems.length}`);
  console.log(`  Calendar events: ${calendarEvents.length}`);
  console.log(`  Items in review queue: ${queuedItems.length}`);

  // Fetch people data
  const nudgeDays = parseInt(process.env.PEOPLE_NUDGE_DAYS || "30", 10);
  const newConnections = getRecentConnections(10);
  const nudges = listPeopleToNudge(nudgeDays, 5);
  const waitingOn = getWaitingOnItems();

  console.log(`  New connections: ${newConnections.length}`);
  console.log(`  People to nudge: ${nudges.length}`);
  console.log(`  Waiting on: ${waitingOn.length}`);

  // Generate briefing content
  const urgentItems = getUrgentItems(highPriorityItems);
  const todayItems = getTodayActionItems(highPriorityItems);

  // Try template-based approach first
  const sections = {
    urgent: urgentItems.length > 0
      ? urgentItems.map(item => `${item.title}`).join("\n")
      : "No urgent items",
    schedule: calendarEvents.length > 0
      ? calendarEvents.map(e => {
          const time = e.isAllDay ? "All day" : new Date(e.startTime).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
          return `${time} - ${e.title}${e.location ? ` (${e.location})` : ""}`;
        }).join("\n")
      : "No events scheduled",
    connections: newConnections.length > 0
      ? newConnections.map(p => `${p.display_name}${p.company ? ` @ ${p.company}` : ""}`).join("\n")
      : "",
    reconnect: nudges.length > 0
      ? nudges.map(n => `${n.person.display_name}${n.person.company ? ` @ ${n.person.company}` : ""} - ${n.reason}`).join("\n")
      : "",
    actionItems: todayItems.length > 0
      ? todayItems.map(item => `${item.title}`).join("\n")
      : "No action items",
    reviewQueue: queuedItems.length > 0
      ? `${queuedItems.length} items need review`
      : "",
  };

  let result = await createBriefingFromTemplate(now, sections);

  // Fall back to HTML approach if template fails (not found, can't copy, etc.)
  if (!result.success) {
    console.log(`  Template approach failed (${result.error}), using HTML format...`);
    const content = generateBriefingView(
      now,
      urgentItems,
      todayItems,
      calendarEvents,
      queuedItems.length,
      {
        newConnections,
        nudges,
        waitingOn,
      }
    );
    const noteTitle = `📋 Briefing - ${now.toLocaleDateString("en-US", { month: "short", day: "numeric" })}`;
    result = await upsertNote(noteTitle, content, "Briefings");
  }

  if (result.success) {
    const noteTitle = `📋 Briefing - ${now.toLocaleDateString("en-US", { month: "short", day: "numeric" })}`;
    console.log(`\n✓ Briefing ${result.action}: ${noteTitle}`);
  } else {
    console.error(`\n✗ Failed to create briefing: ${result.error}`);
  }

  // Print summary
  const counts = getStatusCounts();
  console.log("\n--- Status Summary ---");
  console.log(`  Urgent (P0): ${urgentItems.length}`);
  console.log(`  Today (P0+P1): ${todayItems.length}`);
  console.log(`  Calendar events: ${calendarEvents.length}`);
  console.log(`  Review queue: ${queuedItems.length}`);
  console.log(`\n--- People ---`);
  console.log(`  Total: ${getPeopleCount()}`);
  console.log(`  LinkedIn connections: ${getLinkedInConnectionCount()}`);
  console.log(`\n--- Database ---`);
  console.log(`  New: ${counts.new}`);
  console.log(`  Processed: ${counts.processed}`);
  console.log(`  Queued: ${counts.queued}`);
  console.log(`  Acted: ${counts.acted}`);
}

async function main() {
  console.log("Starting briefing generation...\n");

  try {
    await generateBriefing();
  } finally {
    closeDb();
  }
}

main().catch((err) => {
  console.error("Briefing failed:", err);
  closeDb();
  process.exit(1);
});
