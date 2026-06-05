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
import type { StepResult } from "../pipeline/types.js";
import { listOpenGtdTasks, GTD_LISTS, type GoogleTask } from "../tasks/google-tasks.js";

/**
 * Format the Google Tasks worth surfacing in the morning briefing:
 * anything overdue or due today (any list), plus everything in the 🔥 Today list.
 */
function formatGtdTasksForBriefing(tasks: GoogleTask[]): string {
  const today = new Date().toISOString().slice(0, 10);
  const relevant = tasks.filter(
    (t) => (t.due && t.due.slice(0, 10) <= today) || t.list === GTD_LISTS.today
  );
  if (relevant.length === 0) return "";
  return relevant
    .sort((a, b) => (a.due || "9999").localeCompare(b.due || "9999"))
    .map((t) => {
      const d = t.due?.slice(0, 10);
      const tag = d ? (d < today ? " ⚠️ overdue" : " 📅 today") : "";
      return `${t.title}${tag}`;
    })
    .join("\n");
}

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
 * Options for runBriefing.
 */
export interface BriefingOptions {
  /** If true, compute briefing content but skip actual note creation. */
  dryRun?: boolean;
  /** If false, suppress console.log output. Defaults to true. */
  verbose?: boolean;
}

/**
 * Core briefing logic. Generates and saves the daily briefing note.
 *
 * Returns a StepResult describing the outcome. Does NOT call closeDb()
 * or process.exit() — those are the caller's responsibility.
 */
export async function runBriefing(options?: BriefingOptions): Promise<StepResult> {
  const startedAt = new Date();
  const verbose = options?.verbose !== false;
  const dryRun = options?.dryRun === true;
  const log = verbose ? console.log.bind(console) : () => {};
  const warn = verbose ? console.warn.bind(console) : () => {};

  const now = new Date();
  const dateStr = now.toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });

  log(`Generating briefing for ${dateStr}...${dryRun ? " (dry run)" : ""}\n`);

  // Track whether any data fetch failed (for partial status)
  let calendarFailed = false;

  // Fetch data in parallel
  const [highPriorityItems, calendarEvents, queuedItems] = await Promise.all([
    Promise.resolve(getHighPriorityItems()),
    getTodayEvents().catch((err) => {
      warn("Could not fetch calendar events:", err.message);
      calendarFailed = true;
      return [] as CalendarEvent[];
    }),
    Promise.resolve(getQueuedItems()),
  ]);

  log(`  High priority items: ${highPriorityItems.length}`);
  log(`  Calendar events: ${calendarEvents.length}`);
  log(`  Items in review queue: ${queuedItems.length}`);

  // Fetch people data
  const nudgeDays = parseInt(process.env.PEOPLE_NUDGE_DAYS || "30", 10);
  const newConnections = getRecentConnections(10);
  const nudges = listPeopleToNudge(nudgeDays, 5);
  const waitingOn = getWaitingOnItems();

  log(`  New connections: ${newConnections.length}`);
  log(`  People to nudge: ${nudges.length}`);
  log(`  Waiting on: ${waitingOn.length}`);

  // Generate briefing content
  const urgentItems = getUrgentItems(highPriorityItems);
  const todayItems = getTodayActionItems(highPriorityItems);

  // Build counts for the StepResult
  const counts: Record<string, number> = {
    urgentItems: urgentItems.length,
    todayItems: todayItems.length,
    calendarEvents: calendarEvents.length,
    queuedItems: queuedItems.length,
    nudges: nudges.length,
    newConnections: newConnections.length,
    waitingOn: waitingOn.length,
  };

  // Pull today's/overdue Google Tasks (non-fatal if Tasks/auth unavailable).
  let gtdTasksText = "";
  try {
    gtdTasksText = formatGtdTasksForBriefing(await listOpenGtdTasks());
  } catch (err) {
    log(`  (Google Tasks unavailable: ${err instanceof Error ? err.message : err})`);
  }

  // Build sections used by both template and HTML approaches
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
    tasks: gtdTasksText || "No tasks due today",
    reviewQueue: queuedItems.length > 0
      ? `${queuedItems.length} items need review`
      : "",
  };

  const noteTitle = `📋 Briefing - ${now.toLocaleDateString("en-US", { month: "short", day: "numeric" })}`;

  // Dry run: compute content but skip note creation
  if (dryRun) {
    log(`\n[dry run] Would create briefing note: ${noteTitle}`);
    return {
      status: calendarFailed ? "partial" : "success",
      counts,
      artifacts: { noteTitle, method: "dry-run", sections },
      startedAt,
      finishedAt: new Date(),
    };
  }

  // Try template-based approach first
  let result = await createBriefingFromTemplate(now, sections);
  let method: string = "template";

  // Fall back to HTML approach if template fails (not found, can't copy, etc.)
  if (!result.success) {
    log(`  Template approach failed (${result.error}), using HTML format...`);
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
      },
      gtdTasksText
    );
    result = await upsertNote(noteTitle, content, "Briefings");
    method = "html";
  }

  if (result.success) {
    log(`\n✓ Briefing ${result.action}: ${noteTitle}`);
  } else {
    log(`\n✗ Failed to create briefing: ${result.error}`);
    return {
      status: "failed",
      counts,
      artifacts: { noteTitle, method },
      error: {
        code: "BRIEFING_NOTE_CREATION_FAILED",
        message: result.error || "Unknown error creating briefing note",
        retryable: true,
      },
      startedAt,
      finishedAt: new Date(),
    };
  }

  // Print summary
  const statusCounts = getStatusCounts();
  log("\n--- Status Summary ---");
  log(`  Urgent (P0): ${urgentItems.length}`);
  log(`  Today (P0+P1): ${todayItems.length}`);
  log(`  Calendar events: ${calendarEvents.length}`);
  log(`  Review queue: ${queuedItems.length}`);
  log(`\n--- People ---`);
  log(`  Total: ${getPeopleCount()}`);
  log(`  LinkedIn connections: ${getLinkedInConnectionCount()}`);
  log(`\n--- Database ---`);
  log(`  New: ${statusCounts.new}`);
  log(`  Processed: ${statusCounts.processed}`);
  log(`  Queued: ${statusCounts.queued}`);
  log(`  Acted: ${statusCounts.acted}`);

  return {
    status: calendarFailed ? "partial" : "success",
    counts,
    artifacts: { noteTitle, method },
    startedAt,
    finishedAt: new Date(),
  };
}

async function main() {
  console.log("Starting briefing generation...\n");

  try {
    await runBriefing();
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
    console.error("Briefing failed:", err);
    closeDb();
    process.exit(1);
  });
}
