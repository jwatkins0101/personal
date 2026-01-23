// Fix command: apply user corrections to items

import {
  getItem,
  applyCorrection,
  updateStatus,
  updateRoute,
  getBouncerDecision,
  logSuccess,
  closeDb,
  getFeedbackStats,
  type MemoryItem,
} from "../storage/index.js";
import type { Category, Priority } from "../classifier/types.js";

const VALID_CATEGORIES: Category[] = [
  "urgent",
  "work",
  "personal",
  "newsletter",
  "finance",
  "health",
  "admin",
  "idea",
  "waiting-on",
  "reference",
];

const VALID_PRIORITIES: Priority[] = ["P0", "P1", "P2", "P3"];

const VALID_FIELDS = [
  "category",
  "priority",
  "status",
  "route",
];

function printUsage(): void {
  console.log(`
Usage: npm run fix -- <item_id> <field> <value> [note]

Fields:
  category   Change the category (${VALID_CATEGORIES.join(", ")})
  priority   Change the priority (${VALID_PRIORITIES.join(", ")})
  status     Change the status (processed, queued, acted, ignored)
  route      Change the route (inbox, review, archive, notes:work, etc.)

Examples:
  npm run fix -- email:123 category work
  npm run fix -- message:456 priority P1
  npm run fix -- email:789 status ignored "Not relevant"
  npm run fix -- email:123 route notes:personal

Special commands:
  npm run fix -- --stats    Show correction statistics
  npm run fix -- --approve <item_id>   Approve and act on an item
  npm run fix -- --ignore <item_id>    Mark item as ignored
`);
}

function validateCategory(value: string): boolean {
  return VALID_CATEGORIES.includes(value as Category);
}

function validatePriority(value: string): boolean {
  return VALID_PRIORITIES.includes(value as Priority);
}

function validateStatus(value: string): boolean {
  return ["new", "processed", "queued", "acted", "ignored", "error"].includes(value);
}

async function showStats(): Promise<void> {
  const stats = getFeedbackStats();

  console.log("\n" + "=".repeat(50));
  console.log("CORRECTION STATISTICS");
  console.log("=".repeat(50));

  if (Object.keys(stats).length === 0) {
    console.log("\nNo corrections recorded yet.\n");
  } else {
    console.log("\nCorrections by field:");
    for (const [field, count] of Object.entries(stats)) {
      console.log(`  ${field}: ${count}`);
    }
    console.log();
  }
}

async function approveItem(itemId: string): Promise<void> {
  const item = getItem(itemId);
  if (!item) {
    console.error(`Item not found: ${itemId}`);
    process.exit(1);
  }

  // Re-run bouncer with confidence boost
  const boostedItem: MemoryItem = {
    ...item,
    confidence: 1.0, // Override confidence to force auto-act
  };

  const decision = getBouncerDecision(boostedItem);

  updateStatus(itemId, "acted");
  updateRoute(itemId, decision.route);

  logSuccess(itemId, "approve", { originalStatus: item.status }, {
    newStatus: "acted",
    route: decision.route,
  });

  console.log(`\n✓ Approved: ${itemId}`);
  console.log(`  Route: ${decision.route}`);
  console.log(`  Status: acted`);
}

async function ignoreItem(itemId: string, note?: string): Promise<void> {
  const item = getItem(itemId);
  if (!item) {
    console.error(`Item not found: ${itemId}`);
    process.exit(1);
  }

  applyCorrection(itemId, "status", "ignored", note);

  logSuccess(itemId, "ignore", { originalStatus: item.status }, {
    newStatus: "ignored",
  });

  console.log(`\n✓ Ignored: ${itemId}`);
  if (note) {
    console.log(`  Note: ${note}`);
  }
}

async function main() {
  const args = process.argv.slice(2);

  if (args.length === 0) {
    printUsage();
    closeDb();
    return;
  }

  try {
    // Handle special commands
    if (args[0] === "--stats") {
      await showStats();
      closeDb();
      return;
    }

    if (args[0] === "--approve") {
      if (!args[1]) {
        console.error("Error: item_id required");
        printUsage();
        process.exit(1);
      }
      await approveItem(args[1]);
      closeDb();
      return;
    }

    if (args[0] === "--ignore") {
      if (!args[1]) {
        console.error("Error: item_id required");
        printUsage();
        process.exit(1);
      }
      await ignoreItem(args[1], args[2]);
      closeDb();
      return;
    }

    // Parse regular fix command
    const [itemId, field, value, ...noteParts] = args;
    const note = noteParts.join(" ") || undefined;

    if (!itemId || !field || !value) {
      console.error("Error: item_id, field, and value are required");
      printUsage();
      process.exit(1);
    }

    // Validate field
    if (!VALID_FIELDS.includes(field)) {
      console.error(`Error: Invalid field "${field}". Valid fields: ${VALID_FIELDS.join(", ")}`);
      process.exit(1);
    }

    // Validate value based on field
    if (field === "category" && !validateCategory(value)) {
      console.error(`Error: Invalid category "${value}". Valid categories: ${VALID_CATEGORIES.join(", ")}`);
      process.exit(1);
    }

    if (field === "priority" && !validatePriority(value)) {
      console.error(`Error: Invalid priority "${value}". Valid priorities: ${VALID_PRIORITIES.join(", ")}`);
      process.exit(1);
    }

    if (field === "status" && !validateStatus(value)) {
      console.error(`Error: Invalid status "${value}". Valid statuses: new, processed, queued, acted, ignored, error`);
      process.exit(1);
    }

    // Get the item first
    const item = getItem(itemId);
    if (!item) {
      console.error(`Error: Item not found: ${itemId}`);
      process.exit(1);
    }

    // Apply the correction
    const result = applyCorrection(
      itemId,
      field as keyof MemoryItem,
      value,
      note
    );

    if (result.success) {
      console.log(`\n✓ Correction applied`);
      console.log(`  Item: ${itemId}`);
      console.log(`  Field: ${field}`);
      const oldValue = item[field as keyof MemoryItem];
      console.log(`  Old value: ${oldValue ?? "(none)"}`);
      console.log(`  New value: ${value}`);
      if (note) {
        console.log(`  Note: ${note}`);
      }
      console.log(`  Feedback ID: ${result.feedbackId}`);
    } else {
      console.error(`\n✗ Failed to apply correction: ${result.error}`);
      process.exit(1);
    }
  } finally {
    closeDb();
  }
}

main().catch((err) => {
  console.error("Fix failed:", err);
  closeDb();
  process.exit(1);
});
