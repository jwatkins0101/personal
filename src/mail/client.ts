import { spawn } from "child_process";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import type { EmailMessage } from "./types.js";
import { CATEGORY_FLAGS, FLAG_COLORS } from "./types.js";
import { logSuccess, logFailure } from "../storage/action-log.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const SCRIPTS_DIR = join(__dirname, "../../scripts");

const MAX_EMAILS = parseInt(process.env.MAX_EMAILS_PER_RUN || "20", 10);

async function runScript(
  scriptName: string,
  args: string[] = [],
  timeoutMs: number = 180000
): Promise<string> {
  const scriptPath = join(SCRIPTS_DIR, scriptName);

  return new Promise((resolve, reject) => {
    const proc = spawn("bash", [scriptPath, ...args], {
      stdio: ["ignore", "pipe", "pipe"],
    });

    // Manual timeout
    const timeoutId = setTimeout(() => {
      proc.kill("SIGTERM");
      reject(new Error(`Script timed out after ${timeoutMs / 1000} seconds`));
    }, timeoutMs);

    let stdout = "";
    let stderr = "";

    proc.stdout.on("data", (data) => {
      stdout += data.toString();
    });

    proc.stderr.on("data", (data) => {
      stderr += data.toString();
    });

    proc.on("close", (code, signal) => {
      if (code === 0) {
        resolve(stdout.trim());
      } else if (signal) {
        reject(new Error(`Script killed by signal: ${signal}`));
      } else {
        reject(new Error(`Script exited with code ${code}: ${stderr}`));
      }
    });

    proc.on("error", (err) => {
      reject(err);
    });
  });
}

function parseEmailAddress(sender: string): string {
  // Extract email from formats like "Name <email@example.com>" or just "email@example.com"
  const match = sender.match(/<([^>]+)>/) || sender.match(/([^\s<>]+@[^\s<>]+)/);
  return match ? match[1] : sender;
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
    const result = await runScript("get-mail-state.sh", [messageId]);

    if (!result || result.startsWith("ERROR:")) {
      console.warn(`Could not get mail state for ${messageId}: ${result}`);
      return null;
    }

    const [mailbox, account, flagIndexStr, isUnreadStr] = result.split("<|>");
    return {
      mailbox: mailbox || "INBOX",
      account: account || "",
      flagIndex: parseInt(flagIndexStr, 10) || 0,
      isUnread: isUnreadStr === "true",
    };
  } catch (err) {
    console.warn(`Failed to get mail state for ${messageId}:`, err);
    return null;
  }
}

export async function fetchUnreadEmails(): Promise<EmailMessage[]> {
  try {
    const result = await runScript("get-mail.sh", [String(MAX_EMAILS)]);

    if (!result || result === "") {
      return [];
    }

    const emails: EmailMessage[] = [];
    const emailStrings = result.split("<||>").filter(s => s.trim() !== "");

    for (const emailStr of emailStrings) {
      const parts = emailStr.split("<|>");
      if (parts.length >= 5) {
        const [id, subject, sender, date, snippet, account] = parts;
        emails.push({
          id: id || "",
          threadId: id || "", // Apple Mail doesn't have thread IDs in the same way
          from: parseEmailAddress(sender || ""),
          to: "", // Would need additional script to get recipients
          subject: subject || "(No subject)",
          snippet: snippet || "",
          date: date || "",
          labels: [],
          account: account || undefined,
        });
      }
    }

    return emails;
  } catch (err) {
    console.error("Failed to fetch emails:", err instanceof Error ? err.message : err);
    return [];
  }
}

export async function markAsRead(messageId: string): Promise<void> {
  const itemId = `email:${messageId}`;

  // Capture pre-state for undo
  const preState = await getMailState(messageId);

  try {
    await runScript("mark-mail-read.sh", [messageId]);
    logSuccess(itemId, "mark-read", {
      messageId,
      preState: preState ? { wasUnread: preState.isUnread } : null,
    });
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    logFailure(itemId, "mark-read", errorMsg, { messageId });
    console.error(`Failed to mark message ${messageId} as read:`, errorMsg);
  }
}

export async function archiveMessage(messageId: string): Promise<void> {
  const itemId = `email:${messageId}`;

  // Capture pre-state for undo
  const preState = await getMailState(messageId);

  try {
    await runScript("archive-mail.sh", [messageId]);
    logSuccess(itemId, "archive", {
      messageId,
      preState: preState ? {
        originalMailbox: preState.mailbox,
        originalAccount: preState.account,
      } : null,
    });
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    logFailure(itemId, "archive", errorMsg, { messageId });
    console.error(`Failed to archive message ${messageId}:`, errorMsg);
  }
}

export async function flagMessage(messageId: string, colorIndex: number): Promise<void> {
  const itemId = `email:${messageId}`;

  // Capture pre-state for undo
  const preState = await getMailState(messageId);

  try {
    await runScript("flag-mail.sh", [messageId, String(colorIndex)]);
    logSuccess(itemId, "flag", {
      messageId,
      colorIndex,
      preState: preState ? { previousFlagIndex: preState.flagIndex } : null,
    });
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
    const result = await runScript("unarchive-mail.sh", [messageId, accountName]);
    if (result.startsWith("ERROR:")) {
      throw new Error(result);
    }
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
    const result = await runScript("mark-mail-unread.sh", [messageId]);
    if (result.startsWith("ERROR:")) {
      throw new Error(result);
    }
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
  // Apply flag color based on category
  const flagColor = CATEGORY_FLAGS[category] ?? FLAG_COLORS.none;
  if (flagColor !== FLAG_COLORS.none) {
    await flagMessage(messageId, flagColor);
  }

  // Archive if needed
  if (shouldArchive) {
    await archiveMessage(messageId);
  }
}

// For compatibility with existing code
export async function loadLabels(): Promise<void> {
  // Apple Mail uses flags instead of labels - no loading needed
}

/**
 * Fetch recent emails for backfill (both read and unread).
 */
export async function fetchEmailsForBackfill(
  maxCount: number = 500,
  mailbox: "inbox" | "sent" | "all" = "all"
): Promise<EmailMessage[]> {
  try {
    // Use a longer timeout for backfill (5 minutes)
    const result = await runScript(
      "get-mail-backfill.sh",
      [String(maxCount), mailbox],
      300000
    );

    if (!result || result === "") {
      return [];
    }

    const emails: EmailMessage[] = [];
    const emailStrings = result.split("<||>").filter((s) => s.trim() !== "");

    for (const emailStr of emailStrings) {
      const parts = emailStr.split("<|>");
      if (parts.length >= 6) {
        const [id, subject, sender, date, snippet, account, mboxType] = parts;
        emails.push({
          id: id || "",
          threadId: id || "",
          from: parseEmailAddress(sender || ""),
          to: "",
          subject: subject || "(No subject)",
          snippet: snippet || "",
          date: date || "",
          labels: mboxType === "sent" ? ["sent"] : [],
          account: account || undefined,
        });
      }
    }

    return emails;
  } catch (err) {
    console.error(
      "Failed to fetch emails for backfill:",
      err instanceof Error ? err.message : err
    );
    return [];
  }
}
