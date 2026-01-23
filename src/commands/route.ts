// Route command: write items to Apple Notes views

import {
  getItemsByStatus,
  getItemsByRoute,
  getQueuedItems,
  updateStatus,
  logSuccess,
  logFailure,
  closeDb,
  type MemoryItem,
} from "../storage/index.js";
import {
  upsertNote,
  generateInboxView,
  generateReviewView,
  getFolderForRoute,
} from "../notes/index.js";

interface RouteResult {
  route: string;
  folder: string;
  itemCount: number;
  success: boolean;
  action?: "created" | "updated";
  error?: string;
}

/**
 * Route processed items to their destination notes.
 */
async function routeToNotes(): Promise<RouteResult[]> {
  const results: RouteResult[] = [];

  // Get items that have been processed but not yet acted upon
  const processedItems = getItemsByStatus("processed");

  // Group by route
  const byRoute = new Map<string, MemoryItem[]>();
  for (const item of processedItems) {
    if (!item.route) continue;
    const list = byRoute.get(item.route) || [];
    list.push(item);
    byRoute.set(item.route, list);
  }

  console.log(`Routing ${processedItems.length} processed items...`);

  // Route inbox items
  const inboxItems = [
    ...(byRoute.get("inbox") || []),
    ...(byRoute.get("notes:inbox") || []),
  ];

  if (inboxItems.length > 0) {
    console.log(`  Routing ${inboxItems.length} items to Inbox...`);
    const content = generateInboxView(inboxItems);
    const result = await upsertNote("📥 Inbox", content, "Inbox");

    results.push({
      route: "inbox",
      folder: "Inbox",
      itemCount: inboxItems.length,
      success: result.success,
      action: result.action === "error" ? undefined : result.action,
      error: result.error,
    });

    if (result.success) {
      // Mark items as acted
      for (const item of inboxItems) {
        updateStatus(item.id, "acted");
        logSuccess(item.id, "route", { route: "inbox" }, { noteId: result.noteId });
      }
    } else {
      for (const item of inboxItems) {
        logFailure(item.id, "route", result.error || "Unknown error");
      }
    }
  }

  // Route review queue items
  const queuedItems = getQueuedItems();
  if (queuedItems.length > 0) {
    console.log(`  Routing ${queuedItems.length} items to Review...`);
    const content = generateReviewView(queuedItems);
    const result = await upsertNote("🔍 Review Queue", content, "Review");

    results.push({
      route: "review",
      folder: "Review",
      itemCount: queuedItems.length,
      success: result.success,
      action: result.action === "error" ? undefined : result.action,
      error: result.error,
    });

    if (result.success) {
      // Don't change status - they're still queued
      for (const item of queuedItems) {
        logSuccess(item.id, "route", { route: "review" }, { noteId: result.noteId });
      }
    }
  }

  // Route category-specific items
  const categoryRoutes = [
    "notes:work",
    "notes:personal",
    "notes:finance",
    "notes:health",
    "notes:admin",
    "notes:ideas",
    "notes:waiting",
  ];

  for (const route of categoryRoutes) {
    const items = byRoute.get(route);
    if (!items || items.length === 0) continue;

    const folder = getFolderForRoute(route);
    console.log(`  Routing ${items.length} items to ${folder}...`);

    // Generate a summary note for this category
    const categoryName = route.replace("notes:", "").toUpperCase();
    const content = generateCategoryView(categoryName, items);
    const result = await upsertNote(`📁 ${categoryName}`, content, folder);

    results.push({
      route,
      folder,
      itemCount: items.length,
      success: result.success,
      action: result.action === "error" ? undefined : result.action,
      error: result.error,
    });

    if (result.success) {
      for (const item of items) {
        updateStatus(item.id, "acted");
        logSuccess(item.id, "route", { route }, { noteId: result.noteId });
      }
    } else {
      for (const item of items) {
        logFailure(item.id, "route", result.error || "Unknown error");
      }
    }
  }

  return results;
}

/**
 * Generate a category view for a group of items.
 */
function generateCategoryView(category: string, items: MemoryItem[]): string {
  const now = new Date();
  const dateStr = now.toLocaleDateString("en-US", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });
  const timeStr = now.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });

  let content = `📁 ${category}\n`;
  content += `${dateStr}\n`;
  content += `Last updated: ${timeStr}\n`;
  content += `\n${"━".repeat(40)}\n\n`;

  if (items.length === 0) {
    content += "No items.\n";
    return content;
  }

  content += `${items.length} items:\n\n`;

  // Sort by priority
  const sorted = [...items].sort((a, b) => {
    const priorityOrder = { P0: 0, P1: 1, P2: 2, P3: 3 };
    const aOrder = priorityOrder[a.priority as keyof typeof priorityOrder] ?? 4;
    const bOrder = priorityOrder[b.priority as keyof typeof priorityOrder] ?? 4;
    return aOrder - bOrder;
  });

  for (const item of sorted) {
    const emoji = getSourceEmoji(item.source);
    const priority = item.priority ? `[${item.priority}]` : "";

    content += `${emoji} ${priority} ${item.title}\n`;
    if (item.snippet) {
      content += `   ${item.snippet.slice(0, 100)}${item.snippet.length > 100 ? "..." : ""}\n`;
    }
    if (item.suggested_actions_json) {
      const actions = JSON.parse(item.suggested_actions_json);
      if (actions[0]) {
        content += `   → ${actions[0]}\n`;
      }
    }
    content += `\n`;
  }

  return content;
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

async function main() {
  console.log("Starting route...\n");

  try {
    const results = await routeToNotes();

    // Print summary
    console.log("\n--- Route Summary ---");
    for (const r of results) {
      const status = r.success
        ? `✓ ${r.action || "ok"}`
        : `✗ ${r.error || "failed"}`;
      console.log(`  ${r.folder}: ${r.itemCount} items ${status}`);
    }

    const totalRouted = results
      .filter((r) => r.success)
      .reduce((sum, r) => sum + r.itemCount, 0);
    const totalFailed = results
      .filter((r) => !r.success)
      .reduce((sum, r) => sum + r.itemCount, 0);

    console.log(`\n  Total routed: ${totalRouted}`);
    if (totalFailed > 0) {
      console.log(`  Failed: ${totalFailed}`);
    }
  } finally {
    closeDb();
  }
}

main().catch((err) => {
  console.error("Route failed:", err);
  closeDb();
  process.exit(1);
});
