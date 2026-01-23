// Bouncer: confidence-based gating logic

import type { BouncerDecision, BouncerThresholds, MemoryItem } from "./types.js";
import { BOUNCER_THRESHOLDS } from "../config.js";

/**
 * Determine routing based on confidence and priority.
 *
 * Rules:
 * - P0 items always go to inbox regardless of confidence
 * - Confidence >= autoAct threshold: auto-act (apply actions)
 * - Confidence >= queue threshold: queue for review
 * - Below queue threshold: store only (archive)
 */
export function getBouncerDecision(
  item: MemoryItem,
  thresholds: BouncerThresholds = BOUNCER_THRESHOLDS
): BouncerDecision {
  const confidence = item.confidence ?? 0;
  const priority = item.priority;
  const category = item.category;

  // P0 always goes to inbox, override everything
  if (priority === "P0") {
    return {
      shouldAutoAct: true,
      shouldQueue: false,
      storeOnly: false,
      route: "inbox",
      reason: "P0 (critical) items always require immediate attention",
    };
  }

  // High confidence: auto-act
  if (confidence >= thresholds.autoAct) {
    const route = getAutoRoute(item);
    return {
      shouldAutoAct: true,
      shouldQueue: false,
      storeOnly: false,
      route,
      reason: `Confidence ${(confidence * 100).toFixed(0)}% >= ${(thresholds.autoAct * 100).toFixed(0)}% threshold`,
    };
  }

  // Medium confidence: queue for review
  if (confidence >= thresholds.queue) {
    return {
      shouldAutoAct: false,
      shouldQueue: true,
      storeOnly: false,
      route: "review",
      reason: `Confidence ${(confidence * 100).toFixed(0)}% between ${(thresholds.queue * 100).toFixed(0)}%-${(thresholds.autoAct * 100).toFixed(0)}% - needs human review`,
    };
  }

  // Low confidence: store only
  return {
    shouldAutoAct: false,
    shouldQueue: false,
    storeOnly: true,
    route: "archive",
    reason: `Confidence ${(confidence * 100).toFixed(0)}% < ${(thresholds.queue * 100).toFixed(0)}% threshold - stored without action`,
  };
}

/**
 * Determine the automatic route based on category and priority.
 */
function getAutoRoute(item: MemoryItem): string {
  const category = item.category;
  const priority = item.priority;

  // P1 (high priority today) goes to inbox
  if (priority === "P1") {
    return "inbox";
  }

  // Archive categories go to archive
  if (category === "newsletter" || category === "reference") {
    return "archive";
  }

  // Actionable categories get routed to notes
  switch (category) {
    case "urgent":
    case "work":
      return "notes:inbox";
    case "personal":
      return "notes:personal";
    case "finance":
      return "notes:finance";
    case "health":
      return "notes:health";
    case "admin":
      return "notes:admin";
    case "idea":
      return "notes:ideas";
    case "waiting-on":
      return "notes:waiting";
    default:
      return "inbox";
  }
}

/**
 * Get a summary of bouncer decision for logging.
 */
export function formatBouncerDecision(decision: BouncerDecision): string {
  if (decision.shouldAutoAct) {
    return `AUTO-ACT → ${decision.route}`;
  } else if (decision.shouldQueue) {
    return `QUEUE → review`;
  } else {
    return `STORE → archive`;
  }
}

/**
 * Check if an item should trigger notifications.
 */
export function shouldNotify(item: MemoryItem): boolean {
  // Notify for P0 and P1 items
  if (item.priority === "P0" || item.priority === "P1") {
    return true;
  }

  // Notify for urgent category
  if (item.category === "urgent") {
    return true;
  }

  return false;
}
