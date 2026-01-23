// Undo command: reverse a previous mail action using stored pre-state

import { getDb } from "../storage/db.js";
import { logSuccess, logFailure, getRecentLogs } from "../storage/action-log.js";
import { closeDb } from "../storage/index.js";
import {
  unarchiveMessage,
  markAsUnread,
  flagMessage,
} from "../mail/client.js";
import type { ActionLog } from "../storage/types.js";

// Actions that can be undone
const UNDOABLE_ACTIONS = ["archive", "mark-read", "flag"];

interface PreState {
  // For archive
  originalMailbox?: string;
  originalAccount?: string;
  // For mark-read
  wasUnread?: boolean;
  // For flag
  previousFlagIndex?: number;
}

interface UndoableLog extends ActionLog {
  inputs: {
    messageId: string;
    colorIndex?: number;
    preState?: PreState | null;
  };
}

function parseInputs(log: ActionLog): UndoableLog["inputs"] | null {
  if (!log.inputs_json) return null;
  try {
    return JSON.parse(log.inputs_json);
  } catch {
    return null;
  }
}

function getActionLog(actionLogId: number): ActionLog | null {
  const db = getDb();
  const row = db
    .prepare("SELECT * FROM action_logs WHERE id = ?")
    .get(actionLogId);

  if (!row) return null;

  return row as ActionLog;
}

async function undoArchive(log: UndoableLog): Promise<void> {
  const { messageId, preState } = log.inputs;

  if (!preState?.originalAccount) {
    throw new Error("Cannot undo: missing original account in pre-state snapshot");
  }

  console.log(`  Unarchiving message ${messageId}...`);
  console.log(`  Moving back to inbox of account: ${preState.originalAccount}`);

  await unarchiveMessage(messageId, preState.originalAccount);
}

async function undoMarkRead(log: UndoableLog): Promise<void> {
  const { messageId, preState } = log.inputs;

  if (!preState?.wasUnread) {
    console.log("  Message was already read before action - nothing to undo");
    return;
  }

  console.log(`  Marking message ${messageId} as unread...`);
  await markAsUnread(messageId);
}

async function undoFlag(log: UndoableLog): Promise<void> {
  const { messageId, preState } = log.inputs;

  const previousFlagIndex = preState?.previousFlagIndex ?? 0;

  console.log(`  Restoring flag to index ${previousFlagIndex}...`);
  await flagMessage(messageId, previousFlagIndex);
}

async function performUndo(actionLogId: number): Promise<void> {
  const log = getActionLog(actionLogId);

  if (!log) {
    throw new Error(`Action log ${actionLogId} not found`);
  }

  if (log.result !== "success") {
    throw new Error(`Cannot undo failed action (result: ${log.result})`);
  }

  if (!UNDOABLE_ACTIONS.includes(log.action)) {
    throw new Error(
      `Action "${log.action}" is not undoable. Undoable actions: ${UNDOABLE_ACTIONS.join(", ")}`
    );
  }

  const inputs = parseInputs(log);
  if (!inputs || !inputs.messageId) {
    throw new Error("Cannot undo: missing messageId in action log inputs");
  }

  const undoableLog: UndoableLog = {
    ...log,
    inputs,
  };

  console.log(`\nUndoing action #${actionLogId}:`);
  console.log(`  Action: ${log.action}`);
  console.log(`  Item: ${log.item_id}`);
  console.log(`  Performed at: ${log.performed_at}`);

  switch (log.action) {
    case "archive":
      await undoArchive(undoableLog);
      break;
    case "mark-read":
      await undoMarkRead(undoableLog);
      break;
    case "flag":
      await undoFlag(undoableLog);
      break;
    default:
      throw new Error(`Unknown action: ${log.action}`);
  }

  // Log the undo action
  logSuccess(log.item_id, "undo", {
    originalActionLogId: actionLogId,
    originalAction: log.action,
    messageId: inputs.messageId,
  });

  console.log(`\n✓ Undo successful`);
}

function listRecentUndoable(limit: number = 25): void {
  const logs = getRecentLogs(100);

  const undoable = logs
    .filter(
      (log) =>
        log.result === "success" &&
        UNDOABLE_ACTIONS.includes(log.action)
    )
    .slice(0, limit);

  if (undoable.length === 0) {
    console.log("\nNo undoable actions found.");
    return;
  }

  console.log(`\nRecent undoable actions (last ${undoable.length}):\n`);
  console.log("  ID    | Action      | Item                          | Time");
  console.log("  " + "-".repeat(70));

  for (const log of undoable) {
    const id = String(log.id).padStart(5);
    const action = log.action.padEnd(11);
    const item = log.item_id.slice(0, 29).padEnd(29);
    const time = new Date(log.performed_at).toLocaleString();
    console.log(`  ${id} | ${action} | ${item} | ${time}`);
  }

  console.log("\n  Usage: npm run undo -- <id>");
}

function printUsage(): void {
  console.log(`
Usage: npm run undo -- <action_log_id>
       npm run undo -- --list

Undo a previous mail action using stored pre-state snapshot.

Undoable actions:
  archive     Move message back to inbox
  mark-read   Mark message as unread (if it was unread before)
  flag        Restore previous flag color

Options:
  --list      Show recent undoable actions (last 25)

Examples:
  npm run undo -- 42        Undo action log #42
  npm run undo -- --list    Show recent undoable actions
`);
}

async function main() {
  const args = process.argv.slice(2);

  if (args.length === 0) {
    printUsage();
    closeDb();
    return;
  }

  try {
    if (args[0] === "--list") {
      listRecentUndoable();
      return;
    }

    const actionLogId = parseInt(args[0], 10);
    if (isNaN(actionLogId)) {
      console.error(`Error: Invalid action log ID: ${args[0]}`);
      printUsage();
      process.exit(1);
    }

    await performUndo(actionLogId);
  } catch (err) {
    console.error(`\n✗ Undo failed: ${err instanceof Error ? err.message : err}`);
    process.exit(1);
  } finally {
    closeDb();
  }
}

main().catch((err) => {
  console.error("Undo failed:", err);
  closeDb();
  process.exit(1);
});
