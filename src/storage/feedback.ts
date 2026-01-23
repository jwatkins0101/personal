// Feedback module for user corrections

import { getDb } from "./db.js";
import type { Feedback, FeedbackRow, MemoryItem } from "./types.js";
import { getItem, updateField } from "./repository.js";

/**
 * Record a user correction/feedback.
 */
export function recordFeedback(feedback: Omit<Feedback, "id">): number {
  const db = getDb();
  const result = db
    .prepare(`
      INSERT INTO feedback (item_id, created_at, field, old_value, new_value, user_note)
      VALUES (?, ?, ?, ?, ?, ?)
    `)
    .run(
      feedback.item_id,
      feedback.created_at,
      feedback.field,
      feedback.old_value,
      feedback.new_value,
      feedback.user_note
    );

  return result.lastInsertRowid as number;
}

/**
 * Apply a correction to an item and record the feedback.
 */
export function applyCorrection(
  itemId: string,
  field: keyof MemoryItem,
  newValue: string,
  userNote?: string
): { success: boolean; feedbackId?: number; error?: string } {
  const item = getItem(itemId);
  if (!item) {
    return { success: false, error: `Item not found: ${itemId}` };
  }

  const oldValue = String(item[field] ?? "");

  try {
    // Update the item
    updateField(itemId, field, newValue);

    // Record the feedback
    const feedbackId = recordFeedback({
      item_id: itemId,
      created_at: new Date().toISOString(),
      field,
      old_value: oldValue,
      new_value: newValue,
      user_note: userNote ?? null,
    });

    return { success: true, feedbackId };
  } catch (err) {
    return { success: false, error: (err as Error).message };
  }
}

/**
 * Convert a database row to Feedback.
 */
function rowToFeedback(row: FeedbackRow): Feedback {
  return {
    id: row.id,
    item_id: row.item_id,
    created_at: row.created_at,
    field: row.field,
    old_value: row.old_value,
    new_value: row.new_value,
    user_note: row.user_note,
  };
}

/**
 * Get all feedback for an item.
 */
export function getFeedbackForItem(itemId: string): Feedback[] {
  const db = getDb();
  const rows = db
    .prepare("SELECT * FROM feedback WHERE item_id = ? ORDER BY created_at DESC")
    .all(itemId) as FeedbackRow[];

  return rows.map(rowToFeedback);
}

/**
 * Get recent feedback entries.
 */
export function getRecentFeedback(limit = 50): Feedback[] {
  const db = getDb();
  const rows = db
    .prepare("SELECT * FROM feedback ORDER BY created_at DESC LIMIT ?")
    .all(limit) as FeedbackRow[];

  return rows.map(rowToFeedback);
}

/**
 * Get feedback statistics by field.
 */
export function getFeedbackStats(): Record<string, number> {
  const db = getDb();
  const rows = db
    .prepare("SELECT field, COUNT(*) as count FROM feedback GROUP BY field")
    .all() as { field: string; count: number }[];

  const stats: Record<string, number> = {};
  for (const row of rows) {
    stats[row.field] = row.count;
  }

  return stats;
}

/**
 * Get common corrections for a field (to identify patterns).
 */
export function getCommonCorrections(
  field: string
): { old_value: string; new_value: string; count: number }[] {
  const db = getDb();
  const rows = db
    .prepare(`
      SELECT old_value, new_value, COUNT(*) as count
      FROM feedback
      WHERE field = ?
      GROUP BY old_value, new_value
      ORDER BY count DESC
      LIMIT 20
    `)
    .all(field) as { old_value: string; new_value: string; count: number }[];

  return rows;
}
