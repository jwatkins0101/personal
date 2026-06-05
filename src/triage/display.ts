// Triage display: item card rendering, progress, and formatting

import type { MemoryItem } from "../storage/types.js";
import { VALID_CATEGORIES, VALID_PRIORITIES } from "./actions.js";

// ---------------------------------------------------------------------------
// Source emoji
// ---------------------------------------------------------------------------

function getSourceEmoji(source: string): string {
  switch (source) {
    case "email": return "\u{1F4E7}";
    case "message": return "\u{1F4AC}";
    case "calendar": return "\u{1F4C5}";
    case "note": return "\u{1F4DD}";
    default: return "\u{1F4CC}";
  }
}

// ---------------------------------------------------------------------------
// Confidence badge
// ---------------------------------------------------------------------------

function confidenceBadge(confidence: number | null): string {
  if (confidence === null) return "[? ??%]";
  const pct = Math.round(confidence * 100);
  if (confidence >= 0.80) return `[\u{2191} ${pct}%]`;   // up arrow — high
  if (confidence >= 0.65) return `[\u{2194} ${pct}%]`;   // left-right — mid
  return `[\u{2193} ${pct}%]`;                            // down arrow — low
}

// ---------------------------------------------------------------------------
// Priority badge
// ---------------------------------------------------------------------------

function priorityBadge(priority: string | null): string {
  switch (priority) {
    case "P0": return "[P0 CRITICAL]";
    case "P1": return "[P1 TODAY]";
    case "P2": return "[P2 WEEK]";
    case "P3": return "[P3 LOW]";
    default: return "[??]";
  }
}

// ---------------------------------------------------------------------------
// Date formatting
// ---------------------------------------------------------------------------

function formatDate(dateStr: string): string {
  try {
    const date = new Date(dateStr);
    return date.toLocaleString("en-US", {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    });
  } catch {
    return dateStr;
  }
}

function formatAge(dateStr: string): string {
  try {
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    if (diffMins < 60) return `${diffMins}m ago`;
    const diffHrs = Math.floor(diffMins / 60);
    if (diffHrs < 24) return `${diffHrs}h ago`;
    const diffDays = Math.floor(diffHrs / 24);
    return `${diffDays}d ago`;
  } catch {
    return "";
  }
}

// ---------------------------------------------------------------------------
// Item card — compact format for the triage loop
// ---------------------------------------------------------------------------

export function renderItemCard(item: MemoryItem, index: number, total: number): string {
  const lines: string[] = [];
  const width = Math.min(process.stdout.columns || 80, 100);
  const divider = "\u2500".repeat(width);

  // Header: progress + item ID
  lines.push(divider);
  lines.push(`  [${index + 1}/${total}]  ${item.id}`);
  lines.push(divider);

  // Source + title
  const emoji = getSourceEmoji(item.source);
  const title = item.title.length > width - 6
    ? item.title.slice(0, width - 9) + "..."
    : item.title;
  lines.push(`  ${emoji}  ${title}`);

  // Classification line
  const conf = confidenceBadge(item.confidence);
  const prio = priorityBadge(item.priority);
  const cat = item.category ?? "unknown";
  lines.push(`  ${prio}  ${cat}  ${conf}`);

  // Snippet (truncated to ~3 lines)
  if (item.snippet) {
    const maxLen = (width - 6) * 3;
    const truncated = item.snippet.length > maxLen
      ? item.snippet.slice(0, maxLen) + "..."
      : item.snippet;
    // Wrap to width
    const wrapped = wrapText(truncated, width - 6);
    for (const line of wrapped) {
      lines.push(`      ${line}`);
    }
  }

  // Reason
  if (item.reason) {
    lines.push("");
    const reason = item.reason.length > width - 8
      ? item.reason.slice(0, width - 11) + "..."
      : item.reason;
    lines.push(`  WHY: ${reason}`);
  }

  // Suggested action
  if (item.suggested_actions_json) {
    try {
      const actions = JSON.parse(item.suggested_actions_json);
      if (actions[0]) {
        const action = String(actions[0]);
        const truncAction = action.length > width - 8
          ? action.slice(0, width - 11) + "..."
          : action;
        lines.push(`  ACT: ${truncAction}`);
      }
    } catch {
      // ignore
    }
  }

  // Date
  lines.push(`  ${formatDate(item.occurred_at)}  (${formatAge(item.occurred_at)})`);

  lines.push(divider);

  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// Item detail — full metadata for 'v' (view) mode
// ---------------------------------------------------------------------------

export function renderItemDetail(item: MemoryItem): string {
  const lines: string[] = [];
  const width = Math.min(process.stdout.columns || 80, 100);
  const divider = "\u2500".repeat(width);

  lines.push(divider);
  lines.push(`  ITEM DETAIL: ${item.id}`);
  lines.push(divider);

  lines.push(`  Source:      ${item.source}`);
  lines.push(`  Title:       ${item.title}`);
  lines.push(`  Category:    ${item.category ?? "unknown"}`);
  lines.push(`  Priority:    ${item.priority ?? "?"}`);
  lines.push(`  Confidence:  ${item.confidence !== null ? Math.round(item.confidence! * 100) + "%" : "?"}`);
  lines.push(`  Status:      ${item.status}`);
  lines.push(`  Route:       ${item.route ?? "none"}`);
  lines.push(`  Occurred:    ${item.occurred_at}`);
  lines.push(`  Ingested:    ${item.ingested_at}`);

  if (item.reason) {
    lines.push(`  Reason:      ${item.reason}`);
  }

  if (item.suggested_actions_json) {
    try {
      const actions = JSON.parse(item.suggested_actions_json);
      lines.push(`  Actions:     ${actions.join(", ")}`);
    } catch {
      // ignore
    }
  }

  if (item.summary) {
    lines.push("");
    lines.push("  SUMMARY:");
    for (const line of wrapText(item.summary, width - 6)) {
      lines.push(`      ${line}`);
    }
  }

  if (item.snippet) {
    lines.push("");
    lines.push("  CONTENT:");
    for (const line of wrapText(item.snippet, width - 6)) {
      lines.push(`      ${line}`);
    }
  }

  if (item.metadata_json) {
    try {
      const metadata = JSON.parse(item.metadata_json);
      lines.push("");
      lines.push("  METADATA:");
      for (const [key, val] of Object.entries(metadata)) {
        const valStr = typeof val === "string" ? val : JSON.stringify(val);
        const truncVal = valStr.length > width - 16
          ? valStr.slice(0, width - 19) + "..."
          : valStr;
        lines.push(`      ${key}: ${truncVal}`);
      }
    } catch {
      // ignore
    }
  }

  lines.push(divider);
  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// Session progress
// ---------------------------------------------------------------------------

export interface TriageProgress {
  reviewed: number;
  total: number;
  approved: number;
  ignored: number;
  reclassified: number;
  skipped: number;
}

export function renderProgress(progress: TriageProgress): string {
  return `  [${progress.reviewed}/${progress.total}]  A:${progress.approved}  I:${progress.ignored}  R:${progress.reclassified}  S:${progress.skipped}`;
}

// ---------------------------------------------------------------------------
// Session summary
// ---------------------------------------------------------------------------

export function renderSessionSummary(progress: TriageProgress, durationMs: number): string {
  const lines: string[] = [];
  const width = Math.min(process.stdout.columns || 80, 100);
  const divider = "\u2500".repeat(width);

  lines.push("");
  lines.push(divider);
  lines.push("  TRIAGE SESSION COMPLETE");
  lines.push(divider);
  lines.push(`  Reviewed:      ${progress.reviewed} of ${progress.total}`);
  lines.push(`  Approved:      ${progress.approved}`);
  lines.push(`  Ignored:       ${progress.ignored}`);
  lines.push(`  Reclassified:  ${progress.reclassified}`);
  lines.push(`  Skipped:       ${progress.skipped}`);
  lines.push(`  Duration:      ${formatDuration(durationMs)}`);

  if (progress.total - progress.reviewed > 0) {
    lines.push(`  Remaining:     ${progress.total - progress.reviewed} items still queued`);
  }

  lines.push(divider);
  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// Hotkey legend
// ---------------------------------------------------------------------------

export function renderLegend(): string {
  return "  a=approve  i=ignore  s=skip  c=category  p=priority  v=detail  u=undo  q=quit";
}

// ---------------------------------------------------------------------------
// Category picker
// ---------------------------------------------------------------------------

export function renderCategoryPicker(): string {
  const lines: string[] = [];
  lines.push("  Pick category:");
  for (let i = 0; i < VALID_CATEGORIES.length; i++) {
    lines.push(`    ${i}: ${VALID_CATEGORIES[i]}`);
  }
  lines.push("  Press 0-9 or Esc to cancel:");
  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// Priority picker
// ---------------------------------------------------------------------------

export function renderPriorityPicker(): string {
  const lines: string[] = [];
  lines.push("  Pick priority:");
  for (let i = 0; i < VALID_PRIORITIES.length; i++) {
    lines.push(`    ${i}: ${VALID_PRIORITIES[i]}`);
  }
  lines.push("  Press 0-3 or Esc to cancel:");
  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function wrapText(text: string, maxWidth: number): string[] {
  const words = text.replace(/\s+/g, " ").trim().split(" ");
  const lines: string[] = [];
  let current = "";

  for (const word of words) {
    if (current.length + word.length + 1 > maxWidth) {
      lines.push(current);
      current = word;
    } else {
      current = current ? current + " " + word : word;
    }
  }

  if (current) lines.push(current);

  // Limit to a reasonable number of lines
  if (lines.length > 6) {
    return [...lines.slice(0, 5), "..."];
  }

  return lines;
}

function formatDuration(ms: number): string {
  const secs = Math.floor(ms / 1000);
  if (secs < 60) return `${secs}s`;
  const mins = Math.floor(secs / 60);
  const remSecs = secs % 60;
  return `${mins}m ${remSecs}s`;
}
