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
import type { StepResult } from "../pipeline/types.js";

interface RouteResult {
  route: string;
  folder: string;
  itemCount: number;
  success: boolean;
  action?: "created" | "updated" | "exists" | "appended";
  error?: string;
}

interface RunRouteOptions {
  dryRun?: boolean;
  verbose?: boolean;
}

/**
 * Route processed items to their destination notes.
 *
 * Core logic extracted for programmatic use. Does NOT call closeDb() or
 * process.exit() — the caller is responsible for lifecycle management.
 */
export async function runRoute(options?: RunRouteOptions): Promise<StepResult> {
  const startedAt = new Date();
  const dryRun = options?.dryRun ?? false;
  const log = options?.verbose === false ? (..._args: unknown[]) => {} : console.log;

  const results: RouteResult[] = [];
  let lastError: string | undefined;

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

  // Also count queued items for total
  const queuedItems = getQueuedItems();

  // Total items we will attempt to route
  const inboxItems = [
    ...(byRoute.get("inbox") || []),
    ...(byRoute.get("notes:inbox") || []),
  ];

  const categoryRoutes = [
    "notes:work",
    "notes:personal",
    "notes:finance",
    "notes:health",
    "notes:admin",
    "notes:ideas",
    "notes:waiting",
  ];

  let categoryItemCount = 0;
  for (const route of categoryRoutes) {
    const items = byRoute.get(route);
    if (items) categoryItemCount += items.length;
  }

  const totalItems = inboxItems.length + queuedItems.length + categoryItemCount;

  // If there is nothing to route, return skipped
  if (totalItems === 0) {
    const finishedAt = new Date();
    log("No processed items to route.");
    return {
      status: "skipped",
      counts: {
        totalItems: 0,
        totalRouted: 0,
        totalFailed: 0,
        routesAttempted: 0,
        routesSucceeded: 0,
      },
      artifacts: { routes: [] },
      startedAt,
      finishedAt,
    };
  }

  log(`Routing ${processedItems.length} processed items...`);

  // Route inbox items
  if (inboxItems.length > 0) {
    log(`  Routing ${inboxItems.length} items to Inbox...`);

    if (dryRun) {
      results.push({
        route: "inbox",
        folder: "Inbox",
        itemCount: inboxItems.length,
        success: true,
      });
    } else {
      const content = generateInboxView(inboxItems);
      const result = await upsertNote("\u{1F4E5} Inbox", content, "Inbox");

      results.push({
        route: "inbox",
        folder: "Inbox",
        itemCount: inboxItems.length,
        success: result.success,
        action: result.action === "error" ? undefined : result.action,
        error: result.error,
      });

      if (result.success) {
        for (const item of inboxItems) {
          updateStatus(item.id, "acted");
          logSuccess(item.id, "route", { route: "inbox" }, { noteId: result.noteId });
        }
      } else {
        lastError = result.error || "Unknown error";
        for (const item of inboxItems) {
          logFailure(item.id, "route", result.error || "Unknown error");
        }
      }
    }
  }

  // Route review queue items
  if (queuedItems.length > 0) {
    log(`  Routing ${queuedItems.length} items to Review...`);

    if (dryRun) {
      results.push({
        route: "review",
        folder: "Review",
        itemCount: queuedItems.length,
        success: true,
      });
    } else {
      const content = generateReviewView(queuedItems);
      const result = await upsertNote("\u{1F50D} Review Queue", content, "Review");

      results.push({
        route: "review",
        folder: "Review",
        itemCount: queuedItems.length,
        success: result.success,
        action: result.action === "error" ? undefined : result.action,
        error: result.error,
      });

      if (result.success) {
        for (const item of queuedItems) {
          logSuccess(item.id, "route", { route: "review" }, { noteId: result.noteId });
        }
      } else {
        lastError = result.error || "Unknown error";
      }
    }
  }

  // Route category-specific items
  for (const route of categoryRoutes) {
    const items = byRoute.get(route);
    if (!items || items.length === 0) continue;

    const folder = getFolderForRoute(route);
    log(`  Routing ${items.length} items to ${folder}...`);

    if (dryRun) {
      results.push({
        route,
        folder,
        itemCount: items.length,
        success: true,
      });
    } else {
      const categoryName = route.replace("notes:", "").toUpperCase();
      const content = generateCategoryView(categoryName, items);
      const result = await upsertNote(`\u{1F4C1} ${categoryName}`, content, folder);

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
        lastError = result.error || "Unknown error";
        for (const item of items) {
          logFailure(item.id, "route", result.error || "Unknown error");
        }
      }
    }
  }

  // Compute counts
  const totalRouted = results
    .filter((r) => r.success)
    .reduce((sum, r) => sum + r.itemCount, 0);
  const totalFailed = results
    .filter((r) => !r.success)
    .reduce((sum, r) => sum + r.itemCount, 0);
  const routesAttempted = results.length;
  const routesSucceeded = results.filter((r) => r.success).length;

  // Determine status
  let status: StepResult["status"];
  if (routesSucceeded === 0 && routesAttempted > 0) {
    status = "failed";
  } else if (routesSucceeded < routesAttempted) {
    status = "partial";
  } else {
    status = "success";
  }

  const finishedAt = new Date();

  const stepResult: StepResult = {
    status,
    counts: {
      totalItems,
      totalRouted,
      totalFailed,
      routesAttempted,
      routesSucceeded,
    },
    artifacts: {
      routes: results.map((r) => ({
        route: r.route,
        folder: r.folder,
        itemCount: r.itemCount,
        success: r.success,
      })),
    },
    startedAt,
    finishedAt,
  };

  if (lastError) {
    stepResult.error = {
      code: "ROUTE_APPLESCRIPT_ERROR",
      message: lastError,
      retryable: true,
    };
  }

  return stepResult;
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

  let content = `\u{1F4C1} ${category}\n`;
  content += `${dateStr}\n`;
  content += `Last updated: ${timeStr}\n`;
  content += `\n${"\u2501".repeat(40)}\n\n`;

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
        content += `   \u2192 ${actions[0]}\n`;
      }
    }
    content += `\n`;
  }

  return content;
}

function getSourceEmoji(source: string): string {
  switch (source) {
    case "email":
      return "\u{1F4E7}";
    case "message":
      return "\u{1F4AC}";
    case "calendar":
      return "\u{1F4C5}";
    case "note":
      return "\u{1F4DD}";
    default:
      return "\u{1F4CC}";
  }
}

async function main() {
  console.log("Starting route...\n");

  try {
    const result = await runRoute({ verbose: true });

    // Print summary
    console.log("\n--- Route Summary ---");
    const routes = (result.artifacts?.routes as Array<{
      route: string;
      folder: string;
      itemCount: number;
      success: boolean;
    }>) || [];

    for (const r of routes) {
      const status = r.success ? "\u2713 ok" : "\u2717 failed";
      console.log(`  ${r.folder}: ${r.itemCount} items ${status}`);
    }

    console.log(`\n  Total routed: ${result.counts.totalRouted}`);
    if (result.counts.totalFailed > 0) {
      console.log(`  Failed: ${result.counts.totalFailed}`);
    }
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
    console.error("Route failed:", err);
    closeDb();
    process.exit(1);
  });
}
