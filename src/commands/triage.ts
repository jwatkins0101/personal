// Triage command: interactive queue review with single-keypress actions
//
// Presents queued items one at a time in a card-deck pattern.
// The user presses a single key to approve, ignore, reclassify, skip, or quit.
//
// Usage:
//   npm run triage                     # Interactive triage
//   npm run triage -- --auto-approve 0.80  # Bulk-approve items >= 80% confidence
//   npm run triage -- --route           # Route approved items after session

import * as readline from "readline";
import {
  getQueuedItems,
  getItem,
  getStatusCounts,
  getCommonCorrections,
  closeDb,
  type MemoryItem,
} from "../storage/index.js";
import {
  approveItem,
  ignoreItem,
  reclassifyCategory,
  reclassifyPriority,
  undoTriageAction,
  VALID_CATEGORIES,
  VALID_PRIORITIES,
  type TriageResult,
} from "../triage/actions.js";
import {
  renderItemCard,
  renderItemDetail,
  renderProgress,
  renderSessionSummary,
  renderLegend,
  renderCategoryPicker,
  renderPriorityPicker,
  type TriageProgress,
} from "../triage/display.js";
import type { StepResult } from "../pipeline/types.js";
import type { Category, Priority } from "../classifier/types.js";

// ---------------------------------------------------------------------------
// Sorting: priority DESC, then confidence ASC (uncertain first)
// ---------------------------------------------------------------------------

function sortQueuedItems(items: MemoryItem[]): MemoryItem[] {
  const priorityOrder: Record<string, number> = { P0: 0, P1: 1, P2: 2, P3: 3 };

  return [...items].sort((a, b) => {
    // Priority first (P0 before P1, etc.)
    const aPrio = priorityOrder[a.priority ?? ""] ?? 4;
    const bPrio = priorityOrder[b.priority ?? ""] ?? 4;
    if (aPrio !== bPrio) return aPrio - bPrio;

    // Within same priority, lowest confidence first (most uncertain = most valuable to triage)
    const aConf = a.confidence ?? 0;
    const bConf = b.confidence ?? 0;
    return aConf - bConf;
  });
}

// ---------------------------------------------------------------------------
// Undo stack entry
// ---------------------------------------------------------------------------

interface UndoEntry {
  itemId: string;
  action: TriageResult["action"];
  previousState: {
    status: string;
    route: string | null;
    category: string | null;
  };
}

// ---------------------------------------------------------------------------
// Interactive triage loop
// ---------------------------------------------------------------------------

async function runInteractiveTriage(items: MemoryItem[]): Promise<TriageProgress> {
  const sorted = sortQueuedItems(items);
  const progress: TriageProgress = {
    reviewed: 0,
    total: sorted.length,
    approved: 0,
    ignored: 0,
    reclassified: 0,
    skipped: 0,
  };

  const undoStack: UndoEntry[] = [];
  let cursor = 0;

  // Enable raw mode for single-keypress input
  if (!process.stdin.isTTY) {
    console.error("Error: triage requires an interactive terminal (TTY).");
    return progress;
  }

  readline.emitKeypressEvents(process.stdin);
  process.stdin.setRawMode(true);
  process.stdin.resume();

  // State machine for sub-prompts
  type Mode = "triage" | "category" | "priority" | "detail";
  let mode: Mode = "triage";

  function clearAndRender() {
    // Clear screen
    process.stdout.write("\x1b[2J\x1b[H");

    if (cursor >= sorted.length) {
      // All items reviewed
      return;
    }

    const item = sorted[cursor];

    if (mode === "detail") {
      console.log(renderItemDetail(item));
      console.log("\n  Press any key to return...");
      return;
    }

    if (mode === "category") {
      console.log(renderItemCard(item, cursor, sorted.length));
      console.log(renderCategoryPicker());
      return;
    }

    if (mode === "priority") {
      console.log(renderItemCard(item, cursor, sorted.length));
      console.log(renderPriorityPicker());
      return;
    }

    // Normal triage mode
    console.log(renderItemCard(item, cursor, sorted.length));
    console.log(renderProgress(progress));
    console.log(renderLegend());
  }

  // Show correction hints for the current item's category
  function showCorrectionHints(item: MemoryItem) {
    if (!item.category) return;
    const corrections = getCommonCorrections("category");
    const relevant = corrections.filter(c => c.old_value === item.category && c.count >= 2);
    if (relevant.length > 0) {
      const hint = relevant[0];
      console.log(`  HINT: You've changed ${hint.old_value} -> ${hint.new_value} ${hint.count} times before`);
    }
  }

  // Initial render
  clearAndRender();
  if (sorted.length > 0) {
    showCorrectionHints(sorted[cursor]);
  }

  return new Promise<TriageProgress>((resolve) => {
    function advance() {
      cursor++;
      progress.reviewed++;
      if (cursor >= sorted.length) {
        finish();
      } else {
        mode = "triage";
        clearAndRender();
        showCorrectionHints(sorted[cursor]);
      }
    }

    function finish() {
      process.stdin.setRawMode(false);
      process.stdin.pause();
      process.stdin.removeAllListeners("keypress");
      resolve(progress);
    }

    process.stdin.on("keypress", (_str: string | undefined, key: readline.Key) => {
      // Handle Ctrl+C everywhere
      if (key.ctrl && key.name === "c") {
        finish();
        return;
      }

      const currentItem = sorted[cursor];
      if (!currentItem) {
        finish();
        return;
      }

      // --- Detail mode: any key returns ---
      if (mode === "detail") {
        mode = "triage";
        clearAndRender();
        showCorrectionHints(currentItem);
        return;
      }

      // --- Category picker mode ---
      if (mode === "category") {
        if (key.name === "escape") {
          mode = "triage";
          clearAndRender();
          return;
        }

        const idx = parseInt(_str ?? "", 10);
        if (!isNaN(idx) && idx >= 0 && idx < VALID_CATEGORIES.length) {
          const newCategory = VALID_CATEGORIES[idx];

          // Save state for undo
          undoStack.push({
            itemId: currentItem.id,
            action: "reclassify",
            previousState: {
              status: currentItem.status,
              route: currentItem.route,
              category: currentItem.category,
            },
          });

          const result = reclassifyCategory(currentItem.id, newCategory);
          if (result.success) {
            progress.reclassified++;
            advance();
          } else {
            console.log(`  ERROR: ${result.error}`);
            undoStack.pop();
          }
        }
        return;
      }

      // --- Priority picker mode ---
      if (mode === "priority") {
        if (key.name === "escape") {
          mode = "triage";
          clearAndRender();
          return;
        }

        const idx = parseInt(_str ?? "", 10);
        if (!isNaN(idx) && idx >= 0 && idx < VALID_PRIORITIES.length) {
          const newPriority = VALID_PRIORITIES[idx];

          undoStack.push({
            itemId: currentItem.id,
            action: "reclassify",
            previousState: {
              status: currentItem.status,
              route: currentItem.route,
              category: currentItem.category,
            },
          });

          const result = reclassifyPriority(currentItem.id, newPriority);
          if (result.success) {
            progress.reclassified++;
            advance();
          } else {
            console.log(`  ERROR: ${result.error}`);
            undoStack.pop();
          }
        }
        return;
      }

      // --- Normal triage mode ---
      switch (key.name ?? _str) {
        case "a": {
          // Approve
          undoStack.push({
            itemId: currentItem.id,
            action: "approve",
            previousState: {
              status: currentItem.status,
              route: currentItem.route,
              category: currentItem.category,
            },
          });

          const result = approveItem(currentItem.id);
          if (result.success) {
            progress.approved++;
            advance();
          } else {
            console.log(`  ERROR: ${result.error}`);
            undoStack.pop();
          }
          break;
        }

        case "i": {
          // Ignore
          undoStack.push({
            itemId: currentItem.id,
            action: "ignore",
            previousState: {
              status: currentItem.status,
              route: currentItem.route,
              category: currentItem.category,
            },
          });

          const result = ignoreItem(currentItem.id);
          if (result.success) {
            progress.ignored++;
            advance();
          } else {
            console.log(`  ERROR: ${result.error}`);
            undoStack.pop();
          }
          break;
        }

        case "s": {
          // Skip
          progress.skipped++;
          advance();
          break;
        }

        case "c": {
          // Category picker
          mode = "category";
          clearAndRender();
          break;
        }

        case "p": {
          // Priority picker
          mode = "priority";
          clearAndRender();
          break;
        }

        case "v": {
          // View detail
          mode = "detail";
          clearAndRender();
          break;
        }

        case "u": {
          // Undo last action
          if (undoStack.length === 0) {
            console.log("  Nothing to undo.");
            break;
          }

          const last = undoStack.pop()!;
          const undone = undoTriageAction(last.itemId, last.previousState);

          if (undone) {
            // Revert progress counters
            if (last.action === "approve") progress.approved--;
            else if (last.action === "ignore") progress.ignored--;
            else if (last.action === "reclassify") progress.reclassified--;

            progress.reviewed--;
            cursor--;

            console.log(`  Undone: ${last.action} on ${last.itemId}`);
            setTimeout(() => {
              clearAndRender();
              showCorrectionHints(sorted[cursor]);
            }, 500);
          } else {
            console.log("  Undo failed.");
          }
          break;
        }

        case "q":
        case "escape": {
          finish();
          break;
        }
      }
    });
  });
}

// ---------------------------------------------------------------------------
// Bulk auto-approve (non-interactive)
// ---------------------------------------------------------------------------

function runAutoApprove(items: MemoryItem[], threshold: number): TriageProgress {
  const progress: TriageProgress = {
    reviewed: 0,
    total: items.length,
    approved: 0,
    ignored: 0,
    reclassified: 0,
    skipped: 0,
  };

  const eligible = items.filter(item => (item.confidence ?? 0) >= threshold);
  console.log(`Auto-approving ${eligible.length} items with confidence >= ${Math.round(threshold * 100)}%...\n`);

  for (const item of eligible) {
    const result = approveItem(item.id);
    progress.reviewed++;
    if (result.success) {
      progress.approved++;
      console.log(`  A ${item.id}  ${item.title.slice(0, 50)}  -> ${result.route}`);
    } else {
      progress.skipped++;
      console.log(`  SKIP ${item.id}: ${result.error}`);
    }
  }

  // Items below threshold are untouched
  progress.skipped += items.length - eligible.length;
  progress.reviewed = items.length;

  return progress;
}

// ---------------------------------------------------------------------------
// Exportable core logic for pipeline integration
// ---------------------------------------------------------------------------

export interface RunTriageOptions {
  /** Non-interactive: auto-approve all items at or above this confidence. */
  autoApproveThreshold?: number;
  /** After triage, run routing on approved items. */
  routeAfter?: boolean;
  verbose?: boolean;
}

export async function runTriage(options?: RunTriageOptions): Promise<StepResult> {
  const startedAt = new Date();
  const items = getQueuedItems();

  if (items.length === 0) {
    console.log("\nQueue is empty. Nothing to triage.\n");
    return {
      status: "skipped",
      counts: { total: 0, approved: 0, ignored: 0, reclassified: 0, skipped: 0 },
      startedAt,
      finishedAt: new Date(),
    };
  }

  let progress: TriageProgress;

  if (options?.autoApproveThreshold !== undefined) {
    progress = runAutoApprove(items, options.autoApproveThreshold);
  } else {
    // Show briefing banner
    const counts = getStatusCounts();
    console.log(`\n  TRIAGE: ${items.length} items queued for review`);
    console.log(`  Database: ${counts.new} new, ${counts.processed} processed, ${counts.queued} queued, ${counts.acted} acted`);
    console.log(`  Press any key to begin...\n`);

    // Wait for a keypress to start
    await waitForKeypress();

    progress = await runInteractiveTriage(items);
  }

  const finishedAt = new Date();
  const durationMs = finishedAt.getTime() - startedAt.getTime();

  // Print session summary
  console.log(renderSessionSummary(progress, durationMs));

  // Route after if requested
  if (options?.routeAfter) {
    console.log("  Running route for approved items...\n");
    try {
      const { runRoute } = await import("./route.js");
      const routeResult = await runRoute({ verbose: options?.verbose ?? false });
      console.log(`  Routed: ${routeResult.counts.totalRouted ?? 0} items`);
    } catch (err) {
      console.error(`  Route failed: ${(err as Error).message}`);
    }
  }

  return {
    status: progress.approved + progress.ignored + progress.reclassified > 0 ? "success" : "skipped",
    counts: {
      total: progress.total,
      reviewed: progress.reviewed,
      approved: progress.approved,
      ignored: progress.ignored,
      reclassified: progress.reclassified,
      skipped: progress.skipped,
    },
    startedAt,
    finishedAt,
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function waitForKeypress(): Promise<void> {
  return new Promise((resolve) => {
    if (!process.stdin.isTTY) {
      resolve();
      return;
    }
    readline.emitKeypressEvents(process.stdin);
    process.stdin.setRawMode(true);
    process.stdin.resume();

    const handler = (_str: string | undefined, key: readline.Key) => {
      process.stdin.setRawMode(false);
      process.stdin.pause();
      process.stdin.removeListener("keypress", handler);
      // Allow Ctrl+C to exit
      if (key.ctrl && key.name === "c") {
        process.exit(0);
      }
      resolve();
    };
    process.stdin.on("keypress", handler);
  });
}

// ---------------------------------------------------------------------------
// CLI entry point
// ---------------------------------------------------------------------------

async function main() {
  const args = process.argv.slice(2);

  // Parse flags
  const autoApproveIdx = args.indexOf("--auto-approve");
  let autoApproveThreshold: number | undefined;
  if (autoApproveIdx !== -1 && args[autoApproveIdx + 1]) {
    autoApproveThreshold = parseFloat(args[autoApproveIdx + 1]);
    if (isNaN(autoApproveThreshold) || autoApproveThreshold < 0 || autoApproveThreshold > 1) {
      console.error("Error: --auto-approve requires a threshold between 0 and 1 (e.g., 0.80)");
      process.exit(1);
    }
  }

  const routeAfter = args.includes("--route");

  if (args.includes("--help") || args.includes("-h")) {
    console.log(`
Usage: npm run triage [options]

Interactive triage for queued items. Presents each item as a card
and accepts single-keypress decisions.

Hotkeys:
  a   Approve (accept classification, route it)
  i   Ignore (dismiss permanently)
  s   Skip (leave queued for later)
  c   Reclassify category (opens picker)
  p   Change priority (opens picker)
  v   View full item detail
  u   Undo last action
  q   Quit

Options:
  --auto-approve <threshold>  Non-interactive: approve all >= threshold
  --route                     Route approved items after session
  --help, -h                  Show this help
`);
    process.exit(0);
  }

  try {
    await runTriage({
      autoApproveThreshold,
      routeAfter,
    });
  } finally {
    closeDb();
  }
}

// Only run when executed directly
const isDirectRun =
  process.argv[1] &&
  import.meta.url.endsWith(process.argv[1].replace(/.*\//, ""));
if (isDirectRun) {
  main().catch((err) => {
    console.error("Triage failed:", err);
    closeDb();
    process.exit(1);
  });
}
