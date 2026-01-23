import { spawn } from "child_process";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import type { EmailMessage } from "./types.js";
import { CATEGORY_FLAGS, FLAG_COLORS } from "./types.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const SCRIPTS_DIR = join(__dirname, "../../scripts");

const MAX_EMAILS = parseInt(process.env.MAX_EMAILS_PER_RUN || "20", 10);

async function runScript(scriptName: string, args: string[] = []): Promise<string> {
  const scriptPath = join(SCRIPTS_DIR, scriptName);

  return new Promise((resolve, reject) => {
    const proc = spawn("bash", [scriptPath, ...args], {
      stdio: ["ignore", "pipe", "pipe"],
    });

    // Manual timeout - AppleScript has its own 120s timeout
    const timeoutId = setTimeout(() => {
      proc.kill("SIGTERM");
      reject(new Error("Script timed out after 180 seconds"));
    }, 180000);

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
  try {
    await runScript("mark-mail-read.sh", [messageId]);
  } catch (err) {
    console.error(`Failed to mark message ${messageId} as read:`, err instanceof Error ? err.message : err);
  }
}

export async function archiveMessage(messageId: string): Promise<void> {
  try {
    await runScript("archive-mail.sh", [messageId]);
  } catch (err) {
    console.error(`Failed to archive message ${messageId}:`, err instanceof Error ? err.message : err);
  }
}

export async function flagMessage(messageId: string, colorIndex: number): Promise<void> {
  try {
    await runScript("flag-mail.sh", [messageId, String(colorIndex)]);
  } catch (err) {
    console.error(`Failed to flag message ${messageId}:`, err instanceof Error ? err.message : err);
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
    const result = await runScript("get-mail-backfill.sh", [
      String(maxCount),
      mailbox,
    ]);

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
