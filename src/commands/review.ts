// Review command: list queued items for human review

import {
  getQueuedItems,
  getItem,
  getStatusCounts,
  closeDb,
  type MemoryItem,
} from "../storage/index.js";

/**
 * Format a single item for display.
 */
function formatItem(item: MemoryItem, index: number): string {
  const lines: string[] = [];

  // Header with index and ID
  lines.push(`\n[${ index + 1}] ${item.id}`);
  lines.push("─".repeat(50));

  // Title and source
  const emoji = getSourceEmoji(item.source);
  lines.push(`${emoji} ${item.title}`);

  // Classification details
  const confidence = item.confidence
    ? `${(item.confidence * 100).toFixed(0)}%`
    : "?";
  lines.push(`   Category: ${item.category || "unknown"} | Priority: ${item.priority || "?"} | Confidence: ${confidence}`);

  // Snippet
  if (item.snippet) {
    const truncated = item.snippet.length > 150
      ? item.snippet.slice(0, 150) + "..."
      : item.snippet;
    lines.push(`   ${truncated}`);
  }

  // Reason
  if (item.reason) {
    lines.push(`   💡 ${item.reason}`);
  }

  // Suggested action
  if (item.suggested_actions_json) {
    try {
      const actions = JSON.parse(item.suggested_actions_json);
      if (actions[0]) {
        lines.push(`   ⚡ ${actions[0]}`);
      }
    } catch {
      // ignore parse errors
    }
  }

  // Date
  lines.push(`   📅 ${formatDate(item.occurred_at)}`);

  return lines.join("\n");
}

function getSourceEmoji(source: string): string {
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

async function main() {
  const args = process.argv.slice(2);
  const showAll = args.includes("--all") || args.includes("-a");
  const itemId = args.find((a) => !a.startsWith("-"));

  try {
    // If an item ID is provided, show just that item
    if (itemId) {
      const item = getItem(itemId);
      if (!item) {
        console.error(`Item not found: ${itemId}`);
        process.exit(1);
      }

      console.log("\n" + "=".repeat(50));
      console.log("ITEM DETAILS");
      console.log("=".repeat(50));
      console.log(formatItem(item, 0));

      // Show metadata
      if (item.metadata_json) {
        try {
          const metadata = JSON.parse(item.metadata_json);
          console.log("\n--- Metadata ---");
          console.log(JSON.stringify(metadata, null, 2));
        } catch {
          // ignore parse errors
        }
      }

      console.log("\n--- Status ---");
      console.log(`  Status: ${item.status}`);
      console.log(`  Route: ${item.route || "none"}`);
      console.log(`  Ingested: ${item.ingested_at}`);

      closeDb();
      return;
    }

    // Otherwise, list queued items
    const items = getQueuedItems();
    const counts = getStatusCounts();

    console.log("\n" + "=".repeat(50));
    console.log("REVIEW QUEUE");
    console.log("=".repeat(50));

    if (items.length === 0) {
      console.log("\n✨ Review queue is empty!\n");
    } else {
      const displayItems = showAll ? items : items.slice(0, 10);

      for (let i = 0; i < displayItems.length; i++) {
        console.log(formatItem(displayItems[i], i));
      }

      if (!showAll && items.length > 10) {
        console.log(`\n... and ${items.length - 10} more. Use --all to see all.`);
      }
    }

    // Print status summary
    console.log("\n" + "=".repeat(50));
    console.log("STATUS SUMMARY");
    console.log("=".repeat(50));
    console.log(`  New: ${counts.new}`);
    console.log(`  Processed: ${counts.processed}`);
    console.log(`  Queued: ${counts.queued}`);
    console.log(`  Acted: ${counts.acted}`);
    console.log(`  Ignored: ${counts.ignored}`);
    console.log(`  Error: ${counts.error}`);

    console.log("\n--- Usage ---");
    console.log("  npm run review              # Show queued items");
    console.log("  npm run review -- --all     # Show all queued items");
    console.log("  npm run review -- <item_id> # Show specific item");
    console.log("  npm run fix -- <item_id> <field> <value>  # Apply correction");
  } finally {
    closeDb();
  }
}

main().catch((err) => {
  console.error("Review failed:", err);
  closeDb();
  process.exit(1);
});
