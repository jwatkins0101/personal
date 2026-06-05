/**
 * Mail client — Gmail API backend (via the `gws` CLI for auth).
 *
 * Replaces the previous Apple Mail / AppleScript implementation, which timed out on large
 * mailboxes (`AppleEvent timed out -1712`). All exported signatures are unchanged so callers
 * (index.ts, ingest.ts, digest, undo, backfill, deep-dive) keep working.
 *
 * Concepts map as: archive = remove INBOX label; mark read = remove UNREAD; flag/category =
 * add a Gmail label (or STARRED). See src/mail/gmail-api.ts for the low-level helper.
 */
import type { EmailMessage } from "./types.js";
import { CATEGORY_GMAIL_LABELS, FLAG_TO_GMAIL_LABEL } from "./types.js";
import { logSuccess, logFailure } from "../storage/action-log.js";
import {
  listMessageIds,
  getMessageMeta,
  getMessagesMeta,
  modifyMessage,
  type GmailMeta,
} from "./gmail-api.js";

const MAX_EMAILS = parseInt(process.env.MAX_EMAILS_PER_RUN || "20", 10);
const ACCOUNT = "jermainewatkins@gmail.com";

function parseEmailAddress(sender: string): string {
  const match = sender.match(/<([^>]+)>/) || sender.match(/([^\s<>]+@[^\s<>]+)/);
  return match ? match[1] : sender;
}

function toEmailMessage(m: GmailMeta): EmailMessage {
  return {
    id: m.id,
    threadId: m.threadId,
    from: parseEmailAddress(m.from),
    to: m.to,
    subject: m.subject || "(No subject)",
    snippet: m.snippet || "",
    date: m.date || "",
    labels: m.labelIds.includes("SENT") ? ["sent"] : [],
    account: ACCOUNT,
  };
}

/**
 * Pre-state snapshot for undo operations.
 */
export interface MailState {
  mailbox: string;
  account: string;
  flagIndex: number;
  isUnread: boolean;
}

/**
 * Get current state of a message for undo snapshots.
 */
export async function getMailState(messageId: string): Promise<MailState | null> {
  try {
    const m = await getMessageMeta(messageId);
    return {
      mailbox: m.labelIds.includes("INBOX") ? "INBOX" : "Archive",
      account: ACCOUNT,
      flagIndex: m.labelIds.includes("STARRED") ? 2 : 0,
      isUnread: m.labelIds.includes("UNREAD"),
    };
  } catch (err) {
    console.warn(`Failed to get mail state for ${messageId}:`, err);
    return null;
  }
}

export async function fetchUnreadEmails(): Promise<EmailMessage[]> {
  try {
    const ids = await listMessageIds("in:inbox is:unread", MAX_EMAILS);
    if (ids.length === 0) return [];
    const metas = await getMessagesMeta(ids);
    return metas.map(toEmailMessage);
  } catch (err) {
    console.error(
      "Failed to fetch emails:",
      err instanceof Error ? err.message : err
    );
    return [];
  }
}

export async function markAsRead(messageId: string): Promise<void> {
  const itemId = `email:${messageId}`;
  try {
    await modifyMessage(messageId, [], ["UNREAD"]);
    logSuccess(itemId, "mark-read", { messageId, preState: { wasUnread: true } });
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    logFailure(itemId, "mark-read", errorMsg, { messageId });
    console.error(`Failed to mark message ${messageId} as read:`, errorMsg);
  }
}

export async function archiveMessage(messageId: string): Promise<void> {
  const itemId = `email:${messageId}`;
  try {
    await modifyMessage(messageId, [], ["INBOX"]);
    logSuccess(itemId, "archive", { messageId, preState: { originalMailbox: "INBOX", originalAccount: ACCOUNT } });
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    logFailure(itemId, "archive", errorMsg, { messageId });
    console.error(`Failed to archive message ${messageId}:`, errorMsg);
  }
}

/**
 * Apply a "flag" — on Gmail this maps the old Apple flag-color index to a label (or STARRED).
 * Kept for undo compatibility; unknown colors are a no-op.
 */
export async function flagMessage(messageId: string, colorIndex: number): Promise<void> {
  const itemId = `email:${messageId}`;
  const label = FLAG_TO_GMAIL_LABEL[colorIndex];
  if (!label) return;
  try {
    await modifyMessage(messageId, [label], []);
    logSuccess(itemId, "flag", { messageId, colorIndex, label });
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    logFailure(itemId, "flag", errorMsg, { messageId, colorIndex });
    console.error(`Failed to flag message ${messageId}:`, errorMsg);
  }
}

/**
 * Move a message back from archive to inbox.
 */
export async function unarchiveMessage(messageId: string, accountName: string): Promise<void> {
  const itemId = `email:${messageId}`;
  try {
    await modifyMessage(messageId, ["INBOX"], []);
    logSuccess(itemId, "unarchive", { messageId, accountName });
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    logFailure(itemId, "unarchive", errorMsg, { messageId, accountName });
    throw new Error(`Failed to unarchive message ${messageId}: ${errorMsg}`);
  }
}

/**
 * Mark a message as unread.
 */
export async function markAsUnread(messageId: string): Promise<void> {
  const itemId = `email:${messageId}`;
  try {
    await modifyMessage(messageId, ["UNREAD"], []);
    logSuccess(itemId, "mark-unread", { messageId });
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    logFailure(itemId, "mark-unread", errorMsg, { messageId });
    throw new Error(`Failed to mark message ${messageId} as unread: ${errorMsg}`);
  }
}

export async function processEmailAction(
  messageId: string,
  category: string,
  shouldArchive: boolean
): Promise<void> {
  // Apply a Gmail label (or STARRED) based on category, if one is mapped.
  const label = CATEGORY_GMAIL_LABELS[category];
  const add = label ? [label] : [];
  const remove = shouldArchive ? ["INBOX"] : [];
  if (add.length || remove.length) {
    await modifyMessage(messageId, add, remove);
  }
}

/**
 * Fetch emails to/from a specific person across all mail (inbox + sent + archive).
 */
export async function fetchEmailsBySender(
  senderEmail: string,
  maxCount: number = 100
): Promise<EmailMessage[]> {
  try {
    const ids = await listMessageIds(
      `from:${senderEmail} OR to:${senderEmail}`,
      maxCount
    );
    if (ids.length === 0) return [];
    const metas = await getMessagesMeta(ids);
    return metas.map(toEmailMessage);
  } catch (err) {
    console.error(
      `Failed to fetch emails for sender ${senderEmail}:`,
      err instanceof Error ? err.message : err
    );
    return [];
  }
}

// For compatibility with existing code (Gmail labels need no preloading).
export async function loadLabels(): Promise<void> {
  // no-op
}

/**
 * Fetch recent emails for backfill (both read and unread).
 */
export async function fetchEmailsForBackfill(
  maxCount: number = 500,
  mailbox: "inbox" | "sent" | "all" = "all"
): Promise<EmailMessage[]> {
  try {
    const query =
      mailbox === "inbox" ? "in:inbox" : mailbox === "sent" ? "in:sent" : "in:anywhere";
    const ids = await listMessageIds(query, maxCount);
    if (ids.length === 0) return [];
    const metas = await getMessagesMeta(ids);
    return metas.map(toEmailMessage);
  } catch (err) {
    console.error(
      "Failed to fetch emails for backfill:",
      err instanceof Error ? err.message : err
    );
    return [];
  }
}
