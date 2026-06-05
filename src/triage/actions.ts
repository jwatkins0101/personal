// Triage actions: shared approve/ignore/reclassify logic
//
// Extracted from fix.ts so both the fix CLI and the interactive triage agent
// can use the same domain functions.

import {
  getItem,
  applyCorrection,
  updateStatus,
  updateRoute,
  getBouncerDecision,
  logSuccess,
  type MemoryItem,
} from "../storage/index.js";
import type { Category, Priority } from "../classifier/types.js";

export const VALID_CATEGORIES: Category[] = [
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

export const VALID_PRIORITIES: Priority[] = ["P0", "P1", "P2", "P3"];

export interface TriageResult {
  success: boolean;
  action: "approve" | "ignore" | "reclassify" | "skip";
  itemId: string;
  route?: string;
  error?: string;
}

/**
 * Approve an item: boost confidence to 1.0, let the bouncer decide the route,
 * mark as acted, and record the action.
 */
export function approveItem(itemId: string): TriageResult {
  const item = getItem(itemId);
  if (!item) {
    return { success: false, action: "approve", itemId, error: `Item not found: ${itemId}` };
  }

  // Re-run bouncer with confidence boost
  const boostedItem: MemoryItem = { ...item, confidence: 1.0 };
  const decision = getBouncerDecision(boostedItem);

  updateStatus(itemId, "acted");
  updateRoute(itemId, decision.route);

  logSuccess(itemId, "triage:approve", { originalStatus: item.status }, {
    newStatus: "acted",
    route: decision.route,
  });

  return { success: true, action: "approve", itemId, route: decision.route };
}

/**
 * Ignore an item: mark as ignored, record the action.
 */
export function ignoreItem(itemId: string, note?: string): TriageResult {
  const item = getItem(itemId);
  if (!item) {
    return { success: false, action: "ignore", itemId, error: `Item not found: ${itemId}` };
  }

  applyCorrection(itemId, "status", "ignored", note);

  logSuccess(itemId, "triage:ignore", { originalStatus: item.status }, {
    newStatus: "ignored",
  });

  return { success: true, action: "ignore", itemId };
}

/**
 * Reclassify an item's category and auto-approve it.
 *
 * Changes the category, boosts confidence to 1.0, re-runs the bouncer for
 * the new route, and marks as acted.
 */
export function reclassifyCategory(itemId: string, newCategory: Category): TriageResult {
  const item = getItem(itemId);
  if (!item) {
    return { success: false, action: "reclassify", itemId, error: `Item not found: ${itemId}` };
  }

  if (!VALID_CATEGORIES.includes(newCategory)) {
    return { success: false, action: "reclassify", itemId, error: `Invalid category: ${newCategory}` };
  }

  // Record the category correction
  applyCorrection(itemId, "category", newCategory, "triage reclassification");

  // Re-run bouncer with new category and boosted confidence
  const reclassifiedItem: MemoryItem = { ...item, category: newCategory, confidence: 1.0 };
  const decision = getBouncerDecision(reclassifiedItem);

  updateStatus(itemId, "acted");
  updateRoute(itemId, decision.route);

  logSuccess(itemId, "triage:reclassify", {
    originalCategory: item.category,
    originalStatus: item.status,
  }, {
    newCategory,
    newStatus: "acted",
    route: decision.route,
  });

  return { success: true, action: "reclassify", itemId, route: decision.route };
}

/**
 * Change an item's priority and auto-approve it.
 */
export function reclassifyPriority(itemId: string, newPriority: Priority): TriageResult {
  const item = getItem(itemId);
  if (!item) {
    return { success: false, action: "reclassify", itemId, error: `Item not found: ${itemId}` };
  }

  if (!VALID_PRIORITIES.includes(newPriority)) {
    return { success: false, action: "reclassify", itemId, error: `Invalid priority: ${newPriority}` };
  }

  // Record the priority correction
  applyCorrection(itemId, "priority", newPriority, "triage reclassification");

  // Re-run bouncer with new priority and boosted confidence
  const reclassifiedItem: MemoryItem = { ...item, priority: newPriority, confidence: 1.0 };
  const decision = getBouncerDecision(reclassifiedItem);

  updateStatus(itemId, "acted");
  updateRoute(itemId, decision.route);

  logSuccess(itemId, "triage:reclassify-priority", {
    originalPriority: item.priority,
    originalStatus: item.status,
  }, {
    newPriority,
    newStatus: "acted",
    route: decision.route,
  });

  return { success: true, action: "reclassify", itemId, route: decision.route };
}

/**
 * Undo the last triage action by reverting an item to queued status.
 */
export function undoTriageAction(
  itemId: string,
  previousState: { status: string; route: string | null; category: string | null },
): boolean {
  const item = getItem(itemId);
  if (!item) return false;

  updateStatus(itemId, "queued");
  updateRoute(itemId, "review");

  // If the category was changed, revert it
  if (previousState.category && item.category !== previousState.category) {
    applyCorrection(itemId, "category", previousState.category, "triage undo");
  }

  logSuccess(itemId, "triage:undo", { revertedFrom: item.status }, {
    newStatus: "queued",
    route: "review",
  });

  return true;
}
