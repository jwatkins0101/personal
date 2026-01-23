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
async function processBatch(items: MemoryItem[]): Promise<{
  classified: number;
  autoActed: number;
  queued: number;
  stored: number;
  errors: number;
}> {
  const stats = { classified: 0, autoActed: 0, queued: 0, stored: 0, errors: 0 };

  if (items.length === 0) {
    return stats;
  }

  // Convert to classifiable items
  const classifiableItems = items.map(memoryItemToClassifiable);

  // Classify in batch
  console.log(`  Classifying ${items.length} items...`);
  let classifications;
  try {
    classifications = await classifyItems(classifiableItems);
  } catch (err) {
    console.error("Classification failed:", err);
    for (const item of items) {
      logFailure(item.id, "classify", (err as Error).message);
      stats.errors++;
    }
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
      console.log(`    [${classification.priority}] ${item.title.slice(0, 50)} → ${badge}`);
    } catch (err) {
      console.error(`  Error processing ${item.id}:`, err);
      logFailure(item.id, "sort", (err as Error).message);
      stats.errors++;
    }
  }

  return stats;
}

async function main() {
  console.log("Starting sort...\n");

  try {
    // Get unclassified items
    const items = getUnclassifiedItems();
    console.log(`Found ${items.length} unclassified items\n`);

    if (items.length === 0) {
      console.log("Nothing to sort.");
      closeDb();
      return;
    }

    // Group by source for better logging
    const bySource = new Map<string, MemoryItem[]>();
    for (const item of items) {
      const list = bySource.get(item.source) || [];
      list.push(item);
      bySource.set(item.source, list);
    }

    let totalStats = { classified: 0, autoActed: 0, queued: 0, stored: 0, errors: 0 };

    // Process each source
    for (const [source, sourceItems] of bySource) {
      console.log(`\nProcessing ${source}s (${sourceItems.length}):`);

      // Process in batches of 10 to avoid overwhelming the classifier
      const batchSize = 10;
      for (let i = 0; i < sourceItems.length; i += batchSize) {
        const batch = sourceItems.slice(i, i + batchSize);
        const stats = await processBatch(batch);

        totalStats.classified += stats.classified;
        totalStats.autoActed += stats.autoActed;
        totalStats.queued += stats.queued;
        totalStats.stored += stats.stored;
        totalStats.errors += stats.errors;
      }
    }

    // Print summary
    console.log("\n--- Sort Summary ---");
    console.log(`  Classified: ${totalStats.classified}`);
    console.log(`  Auto-acted: ${totalStats.autoActed}`);
    console.log(`  Queued for review: ${totalStats.queued}`);
    console.log(`  Stored (low confidence): ${totalStats.stored}`);
    if (totalStats.errors > 0) {
      console.log(`  Errors: ${totalStats.errors}`);
    }

    // Print database status
    const counts = getStatusCounts();
    console.log("\n--- Database Status ---");
    console.log(`  New: ${counts.new}`);
    console.log(`  Processed: ${counts.processed}`);
    console.log(`  Queued: ${counts.queued}`);
    console.log(`  Acted: ${counts.acted}`);
    console.log(`  Ignored: ${counts.ignored}`);
    console.log(`  Error: ${counts.error}`);
  } finally {
    closeDb();
  }
}

main().catch((err) => {
  console.error("Sort failed:", err);
  closeDb();
  process.exit(1);
});
