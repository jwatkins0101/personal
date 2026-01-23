// Action logging for audit trail / receipts

import { getDb } from "./db.js";
import type { ActionLog, ActionLogRow } from "./types.js";

/**
 * Log an action taken on an item.
 */
export function logAction(log: Omit<ActionLog, "id">): number {
  const db = getDb();
  const result = db
    .prepare(`
      INSERT INTO action_logs (
        item_id, action, performed_at, inputs_json, outputs_json, result, error_message
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
    `)
    .run(
      log.item_id,
      log.action,
      log.performed_at,
      log.inputs_json,
      log.outputs_json,
      log.result,
      log.error_message
    );

  return result.lastInsertRowid as number;
}

/**
 * Log a successful action.
 */
export function logSuccess(
  itemId: string,
  action: string,
  inputs?: Record<string, unknown>,
  outputs?: Record<string, unknown>
): number {
  return logAction({
    item_id: itemId,
    action,
    performed_at: new Date().toISOString(),
    inputs_json: inputs ? JSON.stringify(inputs) : null,
    outputs_json: outputs ? JSON.stringify(outputs) : null,
    result: "success",
    error_message: null,
  });
}

/**
 * Log a failed action.
 */
export function logFailure(
  itemId: string,
  action: string,
  errorMessage: string,
  inputs?: Record<string, unknown>
): number {
  return logAction({
    item_id: itemId,
    action,
    performed_at: new Date().toISOString(),
    inputs_json: inputs ? JSON.stringify(inputs) : null,
    outputs_json: null,
    result: "failure",
    error_message: errorMessage,
  });
}

/**
 * Convert a database row to an ActionLog.
 */
function rowToActionLog(row: ActionLogRow): ActionLog {
  return {
    id: row.id,
    item_id: row.item_id,
    action: row.action,
    performed_at: row.performed_at,
    inputs_json: row.inputs_json,
    outputs_json: row.outputs_json,
    result: row.result as "success" | "failure",
    error_message: row.error_message,
  };
}

/**
 * Get all action logs for an item.
 */
export function getLogsForItem(itemId: string): ActionLog[] {
  const db = getDb();
  const rows = db
    .prepare(
      "SELECT * FROM action_logs WHERE item_id = ? ORDER BY performed_at DESC"
    )
    .all(itemId) as ActionLogRow[];

  return rows.map(rowToActionLog);
}

/**
 * Get recent action logs.
 */
export function getRecentLogs(limit = 100): ActionLog[] {
  const db = getDb();
  const rows = db
    .prepare("SELECT * FROM action_logs ORDER BY performed_at DESC LIMIT ?")
    .all(limit) as ActionLogRow[];

  return rows.map(rowToActionLog);
}

/**
 * Get logs by action type.
 */
export function getLogsByAction(action: string, limit = 100): ActionLog[] {
  const db = getDb();
  const rows = db
    .prepare(
      "SELECT * FROM action_logs WHERE action = ? ORDER BY performed_at DESC LIMIT ?"
    )
    .all(action, limit) as ActionLogRow[];

  return rows.map(rowToActionLog);
}

/**
 * Get logs for a time range.
 */
export function getLogsInRange(startDate: string, endDate: string): ActionLog[] {
  const db = getDb();
  const rows = db
    .prepare(`
      SELECT * FROM action_logs
      WHERE performed_at >= ? AND performed_at < ?
      ORDER BY performed_at DESC
    `)
    .all(startDate, endDate) as ActionLogRow[];

  return rows.map(rowToActionLog);
}

/**
 * Get failure logs for debugging.
 */
export function getFailureLogs(limit = 50): ActionLog[] {
  const db = getDb();
  const rows = db
    .prepare(
      "SELECT * FROM action_logs WHERE result = 'failure' ORDER BY performed_at DESC LIMIT ?"
    )
    .all(limit) as ActionLogRow[];

  return rows.map(rowToActionLog);
}

/**
 * Count actions by type.
 */
export function getActionCounts(): Record<string, number> {
  const db = getDb();
  const rows = db
    .prepare("SELECT action, COUNT(*) as count FROM action_logs GROUP BY action")
    .all() as { action: string; count: number }[];

  const counts: Record<string, number> = {};
  for (const row of rows) {
    counts[row.action] = row.count;
  }

  return counts;
}

/**
 * Get success rate for an action type.
 */
export function getSuccessRate(action: string): { total: number; success: number; rate: number } {
  const db = getDb();
  const row = db
    .prepare(`
      SELECT
        COUNT(*) as total,
        SUM(CASE WHEN result = 'success' THEN 1 ELSE 0 END) as success
      FROM action_logs
      WHERE action = ?
    `)
    .get(action) as { total: number; success: number };

  return {
    total: row.total,
    success: row.success,
    rate: row.total > 0 ? row.success / row.total : 0,
  };
}
