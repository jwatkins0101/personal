// View generators for Apple Notes

import type { MemoryItem } from "../storage/types.js";
import type { CalendarEvent } from "../calendar/apple.js";
import type { Person, PersonNudge } from "../people/types.js";

/**
 * Format a date for display.
 */
function formatDate(date: Date): string {
  return date.toLocaleDateString("en-US", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

/**
 * Format a time for display.
 */
function formatTime(dateString: string): string {
  try {
    const date = new Date(dateString);
    return date.toLocaleTimeString("en-US", {
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    });
  } catch {
    return dateString;
  }
}

/**
 * Get priority emoji.
 */
function priorityEmoji(priority: string | null): string {
  switch (priority) {
    case "P0":
      return "🔴";
    case "P1":
      return "🟠";
    case "P2":
      return "🟡";
    case "P3":
      return "🟢";
    default:
      return "⚪";
  }
}

/**
 * Get source emoji.
 */
function sourceEmoji(source: string): string {
  switch (source) {
    case "email":
      return "📧";
    case "message":
      return "💬";
    case "calendar":
      return "📅";
    case "note":
      return "📝";
    default:
      return "📌";
  }
}

/**
 * Generate inbox view note content.
 */
export function generateInboxView(items: MemoryItem[]): string {
  const now = new Date();
  const dateStr = formatDate(now);
  const timeStr = now.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });

  let content = `📥 INBOX\n`;
  content += `${dateStr}\n`;
  content += `Last updated: ${timeStr}\n`;
  content += `\n${"━".repeat(40)}\n\n`;

  if (items.length === 0) {
    content += "✨ Inbox is empty! Great job.\n";
    return content;
  }

  // Group by priority
  const byPriority = new Map<string, MemoryItem[]>();
  for (const item of items) {
    const p = item.priority || "P3";
    const list = byPriority.get(p) || [];
    list.push(item);
    byPriority.set(p, list);
  }

  // Print P0 first, then P1, P2, P3
  for (const priority of ["P0", "P1", "P2", "P3"]) {
    const priorityItems = byPriority.get(priority);
    if (!priorityItems || priorityItems.length === 0) continue;

    content += `\n${priorityEmoji(priority)} ${priority === "P0" ? "CRITICAL" : priority === "P1" ? "HIGH" : priority === "P2" ? "MEDIUM" : "LOW"}\n`;
    content += `${"─".repeat(30)}\n`;

    for (const item of priorityItems) {
      content += `${sourceEmoji(item.source)} ${item.title}\n`;
      if (item.snippet) {
        content += `   ${item.snippet.slice(0, 100)}${item.snippet.length > 100 ? "..." : ""}\n`;
      }
      if (item.reason) {
        content += `   💡 ${item.reason}\n`;
      }
      content += `\n`;
    }
  }

  return content;
}

/**
 * Generate review queue view note content.
 */
export function generateReviewView(items: MemoryItem[]): string {
  const now = new Date();
  const dateStr = formatDate(now);
  const timeStr = now.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });

  let content = `🔍 REVIEW QUEUE\n`;
  content += `${dateStr}\n`;
  content += `Last updated: ${timeStr}\n`;
  content += `\n${"━".repeat(40)}\n\n`;

  if (items.length === 0) {
    content += "✨ Review queue is empty.\n";
    return content;
  }

  content += `${items.length} items need review:\n\n`;

  for (const item of items) {
    const confidence = item.confidence
      ? `${(item.confidence * 100).toFixed(0)}%`
      : "?%";

    content += `${sourceEmoji(item.source)} ${item.title}\n`;
    content += `   Category: ${item.category || "unknown"} | Confidence: ${confidence}\n`;
    if (item.snippet) {
      content += `   ${item.snippet.slice(0, 80)}...\n`;
    }
    if (item.reason) {
      content += `   💡 ${item.reason}\n`;
    }
    content += `   ⚡ ${item.suggested_actions_json ? JSON.parse(item.suggested_actions_json)[0] : "Review and decide"}\n`;
    content += `\n`;
  }

  return content;
}

/**
 * Generate daily briefing note content.
 */
export function generateBriefingView(
  date: Date,
  urgentItems: MemoryItem[],
  todayItems: MemoryItem[],
  calendarEvents: CalendarEvent[],
  queuedCount: number,
  peopleData?: {
    newConnections: Array<Person & { connected_on: string }>;
    nudges: PersonNudge[];
    waitingOn: MemoryItem[];
  }
): string {
  const dateStr = formatDate(date);
  const timeStr = date.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });

  let content = `📋 DAILY BRIEFING\n`;
  content += `${dateStr}\n`;
  content += `Generated: ${timeStr}\n`;
  content += `\n${"━".repeat(40)}\n`;

  // Urgent section
  content += `\n🔴 URGENT (${urgentItems.length})\n`;
  content += `${"─".repeat(30)}\n`;

  if (urgentItems.length === 0) {
    content += "No urgent items.\n";
  } else {
    for (const item of urgentItems) {
      content += `• ${sourceEmoji(item.source)} ${item.title}\n`;
      if (item.suggested_actions_json) {
        const actions = JSON.parse(item.suggested_actions_json);
        if (actions[0]) {
          content += `  → ${actions[0]}\n`;
        }
      }
    }
  }

  // Calendar section
  content += `\n📅 TODAY'S SCHEDULE (${calendarEvents.length})\n`;
  content += `${"─".repeat(30)}\n`;

  if (calendarEvents.length === 0) {
    content += "No events scheduled.\n";
  } else {
    for (const event of calendarEvents) {
      const time = event.isAllDay
        ? "All day"
        : formatTime(event.startTime);
      content += `• ${time} - ${event.title}\n`;
      if (event.location) {
        content += `  📍 ${event.location}\n`;
      }
    }
  }

  // People section (if data provided)
  if (peopleData) {
    content += `\n${"━".repeat(40)}\n`;
    content += `\n👥 PEOPLE\n`;

    // New connections
    if (peopleData.newConnections.length > 0) {
      content += `\n🆕 New Connections (${peopleData.newConnections.length})\n`;
      content += `${"─".repeat(30)}\n`;
      for (const person of peopleData.newConnections.slice(0, 5)) {
        content += `• ${person.display_name}`;
        if (person.company) content += ` @ ${person.company}`;
        if (person.connected_on) {
          content += ` (${formatShortDate(person.connected_on)})`;
        }
        content += `\n`;
      }
      if (peopleData.newConnections.length > 5) {
        content += `  ... and ${peopleData.newConnections.length - 5} more\n`;
      }
    }

    // People to nudge
    if (peopleData.nudges.length > 0) {
      content += `\n💭 People to Reconnect With\n`;
      content += `${"─".repeat(30)}\n`;
      for (const nudge of peopleData.nudges.slice(0, 3)) {
        content += `• ${nudge.person.display_name}`;
        if (nudge.person.company) content += ` @ ${nudge.person.company}`;
        content += `\n`;
        content += `  ${nudge.reason}\n`;
      }
    }

    // Waiting on
    if (peopleData.waitingOn.length > 0) {
      content += `\n⏳ Waiting On Response\n`;
      content += `${"─".repeat(30)}\n`;
      for (const item of peopleData.waitingOn.slice(0, 5)) {
        content += `• ${item.title}\n`;
      }
    }
  }

  // Today's items section
  content += `\n📌 ACTION ITEMS (${todayItems.length})\n`;
  content += `${"─".repeat(30)}\n`;

  if (todayItems.length === 0) {
    content += "No action items for today.\n";
  } else {
    for (const item of todayItems.slice(0, 10)) {
      content += `☐ ${sourceEmoji(item.source)} ${item.title}\n`;
    }
    if (todayItems.length > 10) {
      content += `... and ${todayItems.length - 10} more\n`;
    }
  }

  // Review queue reminder
  if (queuedCount > 0) {
    content += `\n${"━".repeat(40)}\n`;
    content += `\n⚠️ ${queuedCount} items in review queue\n`;
  }

  content += `\n${"━".repeat(40)}\n`;
  content += `\nHave a productive day! ✨\n`;

  return content;
}

/**
 * Format a short date (e.g., "Jan 22").
 */
function formatShortDate(dateStr: string): string {
  try {
    const date = new Date(dateStr);
    return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  } catch {
    return dateStr;
  }
}

/**
 * Format a single item for routing to notes.
 */
export function formatItemForNote(item: MemoryItem): string {
  let content = `${priorityEmoji(item.priority)} ${item.title}\n`;
  content += `Source: ${item.source} | ${formatTime(item.occurred_at)}\n`;
  content += `\n`;

  if (item.snippet) {
    content += `${item.snippet}\n\n`;
  }

  if (item.category) {
    content += `Category: ${item.category}\n`;
  }

  if (item.reason) {
    content += `Classification: ${item.reason}\n`;
  }

  if (item.suggested_actions_json) {
    const actions = JSON.parse(item.suggested_actions_json);
    if (actions.length > 0) {
      content += `\nSuggested action: ${actions[0]}\n`;
    }
  }

  content += `\n${"─".repeat(30)}\n`;
  content += `ID: ${item.id}\n`;

  return content;
}
