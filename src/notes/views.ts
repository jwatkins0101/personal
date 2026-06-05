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
 * Generate daily briefing note content (HTML for Apple Notes).
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
  },
  gtdTasksText?: string
): string {
  const dateStr = formatDate(date);
  const timeStr = date.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });

  const lines: string[] = [];

  // Header
  lines.push(`<h1>📋 Daily Briefing</h1>`);
  lines.push(`<p><b>${dateStr}</b><br>Generated: ${timeStr}</p>`);
  lines.push(`<hr>`);

  // Urgent section
  lines.push(`<h2>🔴 Urgent (${urgentItems.length})</h2>`);
  if (urgentItems.length === 0) {
    lines.push(`<p>No urgent items.</p>`);
  } else {
    lines.push(`<ul>`);
    for (const item of urgentItems) {
      let li = `<li>${sourceEmoji(item.source)} <b>${escapeHtml(item.title)}</b>`;
      if (item.suggested_actions_json) {
        try {
          const actions = JSON.parse(item.suggested_actions_json);
          if (actions[0]) {
            li += `<br><i>→ ${escapeHtml(actions[0])}</i>`;
          }
        } catch {}
      }
      li += `</li>`;
      lines.push(li);
    }
    lines.push(`</ul>`);
  }

  // Calendar section
  lines.push(`<h2>📅 Today's Schedule (${calendarEvents.length})</h2>`);
  if (calendarEvents.length === 0) {
    lines.push(`<p>No events scheduled.</p>`);
  } else {
    lines.push(`<ul>`);
    for (const event of calendarEvents) {
      const time = event.isAllDay ? "All day" : formatTime(event.startTime);
      let li = `<li><b>${time}</b> - ${escapeHtml(event.title)}`;
      if (event.location) {
        li += `<br>📍 ${escapeHtml(event.location)}`;
      }
      li += `</li>`;
      lines.push(li);
    }
    lines.push(`</ul>`);
  }

  // Today's Tasks (Google Tasks: overdue / due today / 🔥 Today list)
  if (gtdTasksText && gtdTasksText.trim()) {
    const taskLines = gtdTasksText.split("\n").filter((l) => l.trim());
    lines.push(`<h2>✅ Today's Tasks (${taskLines.length})</h2>`);
    lines.push(`<ul>`);
    for (const t of taskLines) lines.push(`<li>${escapeHtml(t)}</li>`);
    lines.push(`</ul>`);
  }

  // People section
  if (peopleData) {
    lines.push(`<hr>`);
    lines.push(`<h2>👥 People</h2>`);

    // New connections
    if (peopleData.newConnections.length > 0) {
      lines.push(`<h3>🆕 New Connections (${peopleData.newConnections.length})</h3>`);
      lines.push(`<ul>`);
      for (const person of peopleData.newConnections.slice(0, 5)) {
        let li = `<li><b>${escapeHtml(person.display_name)}</b>`;
        if (person.company) li += ` @ ${escapeHtml(person.company)}`;
        if (person.connected_on) {
          li += ` <i>(${formatShortDate(person.connected_on)})</i>`;
        }
        li += `</li>`;
        lines.push(li);
      }
      if (peopleData.newConnections.length > 5) {
        lines.push(`<li><i>... and ${peopleData.newConnections.length - 5} more</i></li>`);
      }
      lines.push(`</ul>`);
    }

    // People to nudge
    if (peopleData.nudges.length > 0) {
      lines.push(`<h3>💭 People to Reconnect With</h3>`);
      lines.push(`<ul>`);
      for (const nudge of peopleData.nudges.slice(0, 5)) {
        let li = `<li><b>${escapeHtml(nudge.person.display_name)}</b>`;
        if (nudge.person.company) li += ` @ ${escapeHtml(nudge.person.company)}`;
        li += `<br><i>${escapeHtml(nudge.reason)}</i></li>`;
        lines.push(li);
      }
      lines.push(`</ul>`);
    }

    // Waiting on
    if (peopleData.waitingOn.length > 0) {
      lines.push(`<h3>⏳ Waiting On Response</h3>`);
      lines.push(`<ul>`);
      for (const item of peopleData.waitingOn.slice(0, 5)) {
        lines.push(`<li>${escapeHtml(item.title)}</li>`);
      }
      lines.push(`</ul>`);
    }
  }

  // Action items section - show ALL items as a checklist
  lines.push(`<hr>`);
  lines.push(`<h2>📌 Action Items (${todayItems.length})</h2>`);
  if (todayItems.length === 0) {
    lines.push(`<p>No action items for today.</p>`);
  } else {
    lines.push(`<ul>`);
    for (const item of todayItems) {
      lines.push(`<li>${sourceEmoji(item.source)} ${escapeHtml(item.title)}</li>`);
    }
    lines.push(`</ul>`);
  }

  // Review queue reminder
  if (queuedCount > 0) {
    lines.push(`<hr>`);
    lines.push(`<p>⚠️ <b>${queuedCount} items in review queue</b></p>`);
  }

  lines.push(`<hr>`);
  lines.push(`<p>Have a productive day! ✨</p>`);

  return lines.join("\n");
}

/**
 * Escape HTML special characters.
 */
function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
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
