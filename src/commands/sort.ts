// Sort command: classify new items and apply bouncer rules

import {
  getUnclassifiedItems,
  updateClassification,
  updateStatusAndRoute,
  getBouncerDecision,
  formatBouncerDecision,
  logSuccess,
  logFailure,
  closeDb,
  getStatusCounts,
  type MemoryItem,
} from "../storage/index.js";
import { classifyItems, type ClassifiableItem } from "../classifier/index.js";
import type { StepResult } from "../pipeline/types.js";

/**
 * Convert a MemoryItem to a ClassifiableItem for the classifier.
 */
function memoryItemToClassifiable(item: MemoryItem): ClassifiableItem {
  const metadata = item.metadata_json ? JSON.parse(item.metadata_json) : {};

  return {
    id: item.id,
    type: item.source,
    from: metadata.from || metadata.handleId,
    to: metadata.to,
    subject: item.title,
    content: item.snippet,
    date: item.occurred_at,
    metadata,
  };
}

/**
 * Process a batch of items through classification and bouncer.
 */
async function processBatch(
  items: MemoryItem[],
  log: (...args: unknown[]) => void,
): Promise<{
  classified: number;
  autoActed: number;
  queued: number;
  stored: number;
  errors: number;
  lastError?: Error;
}> {
  const stats: {
    classified: number;
    autoActed: number;
    queued: number;
    stored: number;
    errors: number;
    lastError?: Error;
  } = { classified: 0, autoActed: 0, queued: 0, stored: 0, errors: 0 };

  if (items.length === 0) {
    return stats;
  }

  // Convert to classifiable items
  const classifiableItems = items.map(memoryItemToClassifiable);

  // Classify in batch
  log(`  Classifying ${items.length} items...`);
  let classifications;
  try {
    classifications = await classifyItems(classifiableItems);
  } catch (err) {
    log("Classification failed:", err);
    for (const item of items) {
      logFailure(item.id, "classify", (err as Error).message);
      stats.errors++;
    }
    stats.lastError = err as Error;
    return stats;
  }

  // Process each result
  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    const classification = classifications[i];

    try {
      // Update classification in database
      updateClassification(item.id, {
        category: classification.category,
        priority: classification.priority,
        confidence: classification.confidence,
        reason: classification.reason,
        suggested_actions_json: JSON.stringify([classification.suggested_next_action]),
      });

      // Create updated item with classification for bouncer
      const classifiedItem: MemoryItem = {
        ...item,
        category: classification.category,
        priority: classification.priority,
        confidence: classification.confidence,
        reason: classification.reason,
      };

      // Get bouncer decision
      const decision = getBouncerDecision(classifiedItem);

      // Update status and route
      const newStatus = decision.shouldAutoAct
        ? "processed"
        : decision.shouldQueue
          ? "queued"
          : "processed";

      updateStatusAndRoute(item.id, newStatus, decision.route);

      // Log the action
      logSuccess(item.id, "sort", {
        category: classification.category,
        priority: classification.priority,
        confidence: classification.confidence,
      }, {
        decision: formatBouncerDecision(decision),
        route: decision.route,
        reason: decision.reason,
      });

      stats.classified++;

      if (decision.shouldAutoAct) {
        stats.autoActed++;
      } else if (decision.shouldQueue) {
        stats.queued++;
      } else {
        stats.stored++;
      }

      // Print per-item summary
      const badge = formatBouncerDecision(decision);
      log(`    [${classification.priority}] ${item.title.slice(0, 50)} → ${badge}`);
    } catch (err) {
      log(`  Error processing ${item.id}:`, err);
      logFailure(item.id, "sort", (err as Error).message);
      stats.errors++;
      stats.lastError = err as Error;
    }
  }

  return stats;
}

/**
 * Determine whether an error looks retryable (Claude CLI timeout, parse errors, etc.).
 */
function isRetryableError(err: Error): boolean {
  const msg = err.message.toLowerCase();
  return (
    msg.includes("timeout") ||
    msg.includes("timed out") ||
    msg.includes("parse") ||
    msg.includes("json") ||
    msg.includes("econnreset") ||
    msg.includes("econnrefused") ||
    msg.includes("spawn")
  );
}

/**
 * Core sort logic: classify unclassified items and apply bouncer rules.
 *
 * Does NOT call closeDb() or process.exit() — those are handled by the CLI
 * entry point (main).
 */
export async function runSort(options?: { verbose?: boolean }): Promise<StepResult> {
  const verbose = options?.verbose ?? true;
  const log: (...args: unknown[]) => void = verbose
    ? console.log.bind(console)
    : () => {};

  const startedAt = new Date();

  try {
    // Get unclassified items
    const items = getUnclassifiedItems();
    log(`Found ${items.length} unclassified items\n`);

    if (items.length === 0) {
      log("Nothing to sort.");
      return {
        status: "skipped",
        counts: { total: 0, classified: 0, autoActed: 0, queued: 0, stored: 0, errors: 0 },
        startedAt,
        finishedAt: new Date(),
      };
    }

    // Group by source for better logging
    const bySource = new Map<string, MemoryItem[]>();
    for (const item of items) {
      const list = bySource.get(item.source) || [];
      list.push(item);
      bySource.set(item.source, list);
    }

    const totalStats = { classified: 0, autoActed: 0, queued: 0, stored: 0, errors: 0 };
    let lastError: Error | undefined;

    // Process each source
    for (const [source, sourceItems] of bySource) {
      log(`\nProcessing ${source}s (${sourceItems.length}):`);

      // Process in batches of 10 to avoid overwhelming the classifier
      const batchSize = 10;
      for (let i = 0; i < sourceItems.length; i += batchSize) {
        const batch = sourceItems.slice(i, i + batchSize);
        const stats = await processBatch(batch, log);

        totalStats.classified += stats.classified;
        totalStats.autoActed += stats.autoActed;
        totalStats.queued += stats.queued;
        totalStats.stored += stats.stored;
        totalStats.errors += stats.errors;
        if (stats.lastError) {
          lastError = stats.lastError;
        }
      }
    }

    // Print summary
    log("\n--- Sort Summary ---");
    log(`  Classified: ${totalStats.classified}`);
    log(`  Auto-acted: ${totalStats.autoActed}`);
    log(`  Queued for review: ${totalStats.queued}`);
    log(`  Stored (low confidence): ${totalStats.stored}`);
    if (totalStats.errors > 0) {
      log(`  Errors: ${totalStats.errors}`);
    }

    // Print database status
    const counts = getStatusCounts();
    log("\n--- Database Status ---");
    log(`  New: ${counts.new}`);
    log(`  Processed: ${counts.processed}`);
    log(`  Queued: ${counts.queued}`);
    log(`  Acted: ${counts.acted}`);
    log(`  Ignored: ${counts.ignored}`);
    log(`  Error: ${counts.error}`);

    // Determine overall status
    const total = items.length;
    let status: StepResult["status"];
    let error: StepResult["error"] | undefined;

    if (totalStats.classified === 0 && totalStats.errors > 0) {
      // Nothing classified at all — total failure
      status = "failed";
      error = {
        code: "SORT_FAILED",
        message: lastError?.message ?? "All items failed classification",
        retryable: lastError ? isRetryableError(lastError) : true,
      };
    } else if (totalStats.errors > 0) {
      // Some classified, some errors — partial success
      status = "partial";
      error = {
        code: "SORT_PARTIAL",
        message: lastError?.message ?? "Some items failed classification",
        retryable: lastError ? isRetryableError(lastError) : true,
      };
    } else {
      status = "success";
    }

    return {
      status,
      counts: {
        total,
        classified: totalStats.classified,
        autoActed: totalStats.autoActed,
        queued: totalStats.queued,
        stored: totalStats.stored,
        errors: totalStats.errors,
      },
      error,
      startedAt,
      finishedAt: new Date(),
    };
  } catch (err) {
    // Unexpected top-level error — complete failure
    return {
      status: "failed",
      counts: { total: 0, classified: 0, autoActed: 0, queued: 0, stored: 0, errors: 1 },
      error: {
        code: "SORT_UNEXPECTED",
        message: (err as Error).message,
        retryable: isRetryableError(err as Error),
      },
      startedAt,
      finishedAt: new Date(),
    };
  }
}

async function main() {
  console.log("Starting sort...\n");

  try {
    const result = await runSort({ verbose: true });

    if (result.status === "failed") {
      console.error(`\nSort failed: ${result.error?.message}`);
      process.exit(1);
    }
  } catch (err) {
    console.error("Sort failed:", err);
    process.exit(1);
  } finally {
    closeDb();
  }
}

// Only run when executed directly (not when imported by the orchestrator).
const isDirectRun =
  process.argv[1] &&
  import.meta.url.endsWith(process.argv[1].replace(/.*\//, ""));
if (isDirectRun) {
  main();
}
