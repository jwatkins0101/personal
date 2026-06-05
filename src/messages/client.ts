import { spawn } from "child_process";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import type {
  Message,
  Attachment,
  Conversation,
  Contact,
  MessageSearchOptions,
  ConversationSummary,
  MessagesConfig,
} from "./types.js";
import { DEFAULT_MESSAGES_CONFIG, APPLE_EPOCH_OFFSET } from "./types.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const SCRIPTS_DIR = join(__dirname, "../../scripts");

export class MessagesClient {
  private config: MessagesConfig;

  constructor(config: Partial<MessagesConfig> = {}) {
    this.config = { ...DEFAULT_MESSAGES_CONFIG, ...config };
  }

  private async query(sql: string): Promise<string> {
    return new Promise((resolve, reject) => {
      // -readonly: read even while Messages.app holds a write lock (avoids partial/empty reads).
      const proc = spawn("sqlite3", ["-readonly", this.config.dbPath], {
        stdio: ["pipe", "pipe", "pipe"],
      });

      let stdout = "";
      let stderr = "";

      proc.stdout.on("data", (data) => {
        stdout += data.toString();
      });

      proc.stderr.on("data", (data) => {
        stderr += data.toString();
      });

      proc.on("close", (code) => {
        if (code === 0) {
          resolve(stdout.trim());
        } else {
          reject(new Error(`SQLite error: ${stderr}`));
        }
      });

      proc.on("error", reject);

      proc.stdin.write(sql);
      proc.stdin.end();
    });
  }

  private async queryJson<T>(sql: string): Promise<T[]> {
    const result = await this.query(`.mode json\n${sql}`);
    if (!result) return [];
    try {
      return JSON.parse(result) as T[];
    } catch {
      return [];
    }
  }

  private appleTimestampToDate(timestamp: number): Date {
    // Apple stores timestamps in nanoseconds since Jan 1, 2001
    const seconds = timestamp / 1_000_000_000;
    return new Date((seconds + APPLE_EPOCH_OFFSET) * 1000);
  }

  private dateToAppleTimestamp(date: Date): number {
    const seconds = date.getTime() / 1000 - APPLE_EPOCH_OFFSET;
    return seconds * 1_000_000_000;
  }

  private parseMessageRow(row: Record<string, unknown>): Message {
    return {
      id: row.ROWID as number,
      guid: row.guid as string,
      text: (row.text as string) || "",
      date: this.appleTimestampToDate(row.date as number),
      isFromMe: row.is_from_me === 1,
      isRead: row.is_read === 1,
      handleId: (row.handle_id as string) || "",
      hasAttachments: row.cache_has_attachments === 1,
      replyToGuid: (row.reply_to_guid as string) || undefined,
      threadOriginatorGuid: (row.thread_originator_guid as string) || undefined,
    };
  }

  /**
   * Get recent messages across all conversations
   */
  async getRecentMessages(limit: number = 50): Promise<Message[]> {
    const sql = `
      SELECT
        m.ROWID,
        m.guid,
        m.text,
        m.date,
        m.is_from_me,
        m.is_read,
        m.cache_has_attachments,
        m.reply_to_guid,
        m.thread_originator_guid,
        h.id as handle_id
      FROM message m
      LEFT JOIN handle h ON m.handle_id = h.ROWID
      WHERE m.text IS NOT NULL AND m.text != ''
      ORDER BY m.date DESC
      LIMIT ${limit};
    `;

    const rows = await this.queryJson<Record<string, unknown>>(sql);
    return rows.map((row) => this.parseMessageRow(row));
  }

  /**
   * Search messages by text content
   */
  async searchMessages(options: MessageSearchOptions): Promise<Message[]> {
    const conditions: string[] = ["m.text IS NOT NULL", "m.text != ''"];

    if (options.query) {
      conditions.push(`m.text LIKE '%${options.query.replace(/'/g, "''")}%'`);
    }
    if (options.handleId) {
      conditions.push(`h.id = '${options.handleId.replace(/'/g, "''")}'`);
    }
    if (options.fromMe !== undefined) {
      conditions.push(`m.is_from_me = ${options.fromMe ? 1 : 0}`);
    }
    if (options.startDate) {
      conditions.push(`m.date >= ${this.dateToAppleTimestamp(options.startDate)}`);
    }
    if (options.endDate) {
      conditions.push(`m.date <= ${this.dateToAppleTimestamp(options.endDate)}`);
    }
    if (options.hasAttachments) {
      conditions.push(`m.cache_has_attachments = 1`);
    }

    const limit = options.limit || this.config.maxResults;
    const offset = options.offset || 0;

    const sql = `
      SELECT
        m.ROWID,
        m.guid,
        m.text,
        m.date,
        m.is_from_me,
        m.is_read,
        m.cache_has_attachments,
        m.reply_to_guid,
        m.thread_originator_guid,
        h.id as handle_id
      FROM message m
      LEFT JOIN handle h ON m.handle_id = h.ROWID
      WHERE ${conditions.join(" AND ")}
      ORDER BY m.date DESC
      LIMIT ${limit} OFFSET ${offset};
    `;

    const rows = await this.queryJson<Record<string, unknown>>(sql);
    return rows.map((row) => this.parseMessageRow(row));
  }

  /**
   * Get conversation thread with a specific contact
   */
  async getConversation(handleId: string, limit: number = 100): Promise<Message[]> {
    return this.searchMessages({ handleId, limit });
  }

  /**
   * Get all conversations (chats)
   */
  async getConversations(limit: number = 50): Promise<Conversation[]> {
    const sql = `
      SELECT
        c.ROWID,
        c.chat_identifier,
        c.display_name,
        c.group_id,
        (SELECT COUNT(*) FROM chat_message_join cmj WHERE cmj.chat_id = c.ROWID) as msg_count,
        (SELECT COUNT(*) FROM chat_message_join cmj
         JOIN message m ON cmj.message_id = m.ROWID
         WHERE cmj.chat_id = c.ROWID AND m.is_read = 0 AND m.is_from_me = 0) as unread_count,
        (SELECT MAX(m.date) FROM chat_message_join cmj
         JOIN message m ON cmj.message_id = m.ROWID
         WHERE cmj.chat_id = c.ROWID) as last_date
      FROM chat c
      ORDER BY last_date DESC
      LIMIT ${limit};
    `;

    const rows = await this.queryJson<Record<string, unknown>>(sql);
    const conversations: Conversation[] = [];

    for (const row of rows) {
      const rowId = row.ROWID as number;
      const chatId = (row.chat_identifier as string) || "";
      const displayName = (row.display_name as string) || chatId;
      const groupId = row.group_id as string | null;
      const msgCount = (row.msg_count as number) || 0;
      const unreadCount = (row.unread_count as number) || 0;
      const lastDate = row.last_date as number | null;

      // Get participants for this chat
      const participantsRows = await this.queryJson<{ id: string }>(
        `SELECT h.id FROM handle h JOIN chat_handle_join chj ON h.ROWID = chj.handle_id WHERE chj.chat_id = ${rowId};`
      );
      const participants = participantsRows.map((p) => p.id);

      conversations.push({
        chatId,
        displayName,
        participants,
        isGroupChat: participants.length > 1 || !!groupId,
        unreadCount,
        messageCount: msgCount,
        lastMessageDate: lastDate ? this.appleTimestampToDate(lastDate) : undefined,
      });
    }

    return conversations;
  }

  /**
   * Get all contacts with message counts
   */
  async getContacts(): Promise<Contact[]> {
    const sql = `
      SELECT
        h.id,
        h.service,
        COUNT(m.ROWID) as msg_count,
        MAX(m.date) as last_date
      FROM handle h
      LEFT JOIN message m ON h.ROWID = m.handle_id
      GROUP BY h.id
      ORDER BY msg_count DESC;
    `;

    const rows = await this.queryJson<Record<string, unknown>>(sql);
    return rows.map((row) => ({
      handleId: row.id as string,
      service: (row.service as "iMessage" | "SMS" | "RCS") || "iMessage",
      messageCount: (row.msg_count as number) || 0,
      lastMessageDate: row.last_date
        ? this.appleTimestampToDate(row.last_date as number)
        : undefined,
    }));
  }

  /**
   * Get conversation summary/statistics
   */
  async getConversationSummary(handleId: string): Promise<ConversationSummary | null> {
    const sql = `
      SELECT
        COUNT(*) as total,
        SUM(CASE WHEN m.is_from_me = 1 THEN 1 ELSE 0 END) as from_me,
        SUM(CASE WHEN m.is_from_me = 0 THEN 1 ELSE 0 END) as from_them,
        MIN(m.date) as first_date,
        MAX(m.date) as last_date
      FROM message m
      JOIN handle h ON m.handle_id = h.ROWID
      WHERE h.id = '${handleId.replace(/'/g, "''")}';
    `;

    const rows = await this.queryJson<Record<string, unknown>>(sql);
    if (!rows.length) return null;

    const row = rows[0];
    return {
      chatId: handleId,
      displayName: handleId,
      participants: [handleId],
      isGroupChat: false,
      totalMessages: (row.total as number) || 0,
      messagesFromMe: (row.from_me as number) || 0,
      messagesFromOthers: (row.from_them as number) || 0,
      firstMessageDate: row.first_date
        ? this.appleTimestampToDate(row.first_date as number)
        : undefined,
      lastMessageDate: row.last_date
        ? this.appleTimestampToDate(row.last_date as number)
        : undefined,
    };
  }

  /**
   * Get unread messages
   */
  async getUnreadMessages(): Promise<Message[]> {
    const sql = `
      SELECT
        m.ROWID,
        m.guid,
        m.text,
        m.date,
        m.is_from_me,
        m.is_read,
        m.cache_has_attachments,
        m.reply_to_guid,
        m.thread_originator_guid,
        h.id as handle_id
      FROM message m
      LEFT JOIN handle h ON m.handle_id = h.ROWID
      WHERE m.is_read = 0 AND m.is_from_me = 0 AND m.text IS NOT NULL AND m.text != ''
      ORDER BY m.date DESC;
    `;

    const rows = await this.queryJson<Record<string, unknown>>(sql);
    return rows.map((row) => this.parseMessageRow(row));
  }

  /**
   * Get messages from today
   */
  async getTodaysMessages(): Promise<Message[]> {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return this.searchMessages({ startDate: today });
  }

  /**
   * Get attachments for a message
   */
  async getAttachments(messageId: number): Promise<Attachment[]> {
    const sql = `
      SELECT
        a.ROWID,
        a.guid,
        a.filename,
        a.mime_type,
        a.transfer_name,
        a.total_bytes
      FROM attachment a
      JOIN message_attachment_join maj ON a.ROWID = maj.attachment_id
      WHERE maj.message_id = ${messageId};
    `;

    const rows = await this.queryJson<Record<string, unknown>>(sql);
    return rows.map((row) => ({
      id: row.ROWID as number,
      guid: row.guid as string,
      filename: (row.filename as string) || "",
      mimeType: (row.mime_type as string) || "",
      transferName: (row.transfer_name as string) || "",
      totalBytes: (row.total_bytes as number) || 0,
    }));
  }

  /**
   * Send a message via AppleScript
   */
  async sendMessage(recipient: string, text: string): Promise<boolean> {
    const escapedText = text.replace(/"/g, '\\"').replace(/\n/g, "\\n");
    const escapedRecipient = recipient.replace(/"/g, '\\"');

    const script = `
      tell application "Messages"
        set targetService to 1st account whose service type = iMessage
        set targetBuddy to participant "${escapedRecipient}" of targetService
        send "${escapedText}" to targetBuddy
      end tell
    `;

    return new Promise((resolve) => {
      const proc = spawn("osascript", ["-e", script], {
        stdio: ["ignore", "pipe", "pipe"],
      });

      proc.on("close", (code) => {
        resolve(code === 0);
      });

      proc.on("error", () => {
        resolve(false);
      });
    });
  }

  /**
   * Get message count statistics
   */
  async getStats(): Promise<{
    totalMessages: number;
    totalConversations: number;
    totalContacts: number;
    messagesFromMe: number;
    messagesFromOthers: number;
  }> {
    const sql = `
      SELECT
        (SELECT COUNT(*) FROM message) as total_messages,
        (SELECT COUNT(*) FROM chat) as total_conversations,
        (SELECT COUNT(*) FROM handle) as total_contacts,
        (SELECT COUNT(*) FROM message WHERE is_from_me = 1) as from_me,
        (SELECT COUNT(*) FROM message WHERE is_from_me = 0) as from_others;
    `;

    const rows = await this.queryJson<Record<string, unknown>>(sql);
    if (!rows.length) {
      return {
        totalMessages: 0,
        totalConversations: 0,
        totalContacts: 0,
        messagesFromMe: 0,
        messagesFromOthers: 0,
      };
    }

    const row = rows[0];
    return {
      totalMessages: (row.total_messages as number) || 0,
      totalConversations: (row.total_conversations as number) || 0,
      totalContacts: (row.total_contacts as number) || 0,
      messagesFromMe: (row.from_me as number) || 0,
      messagesFromOthers: (row.from_others as number) || 0,
    };
  }
  /**
   * Extract messages that only have text in the attributedBody column.
   * Uses a Python script to parse NSKeyedArchiver binary blobs.
   */
  async extractAttributedBodyMessages(
    handleId: string,
    limit: number = 10000
  ): Promise<Message[]> {
    const scriptPath = join(SCRIPTS_DIR, "extract-attributed-body.py");

    return new Promise((resolve, reject) => {
      const proc = spawn("python3", [scriptPath, handleId, String(limit)], {
        stdio: ["ignore", "pipe", "pipe"],
      });

      let stdout = "";
      let stderr = "";

      proc.stdout.on("data", (data) => {
        stdout += data.toString();
      });

      proc.stderr.on("data", (data) => {
        stderr += data.toString();
      });

      proc.on("close", (code) => {
        if (stderr) {
          // Python script writes stats to stderr, not errors
          console.log(`  attributedBody extraction: ${stderr.trim()}`);
        }

        if (code !== 0) {
          reject(new Error(`Python extractor failed (code ${code}): ${stderr}`));
          return;
        }

        try {
          const rows = JSON.parse(stdout || "[]") as Record<string, unknown>[];
          const messages = rows.map((row) => this.parseMessageRow(row));
          resolve(messages);
        } catch (err) {
          reject(new Error(`Failed to parse extractor output: ${(err as Error).message}`));
        }
      });

      proc.on("error", reject);
    });
  }

  /**
   * Extract recent incoming attributedBody-only messages across ALL handles (last `days`).
   * Most modern iMessages keep their text in attributedBody, not the text column, so this is
   * essential for a complete read in triage.
   */
  async extractRecentAttributedBodyMessages(
    days: number = 7,
    limit: number = 5000
  ): Promise<Message[]> {
    const scriptPath = join(SCRIPTS_DIR, "extract-attributed-body.py");
    return new Promise((resolve, reject) => {
      const proc = spawn("python3", [scriptPath, "--recent", String(days), String(limit)], {
        stdio: ["ignore", "pipe", "pipe"],
        env: { ...process.env, MESSAGES_DB: this.config.dbPath },
      });
      let stdout = "";
      let stderr = "";
      proc.stdout.on("data", (d) => (stdout += d.toString()));
      proc.stderr.on("data", (d) => (stderr += d.toString()));
      proc.on("close", (code) => {
        if (code !== 0) {
          reject(new Error(`Python extractor failed (code ${code}): ${stderr}`));
          return;
        }
        try {
          const rows = JSON.parse(stdout || "[]") as Record<string, unknown>[];
          resolve(rows.map((row) => this.parseMessageRow(row)));
        } catch (err) {
          reject(new Error(`Failed to parse extractor output: ${(err as Error).message}`));
        }
      });
      proc.on("error", reject);
    });
  }

  /**
   * Get all messages for a handle, including those with text only in attributedBody.
   * Merges and deduplicates by ROWID.
   */
  async getAllMessagesForHandle(
    handleId: string,
    limit: number = 10000
  ): Promise<Message[]> {
    // Fetch both text-column and attributedBody messages in parallel
    const [textMessages, attributedMessages] = await Promise.all([
      this.searchMessages({ handleId, limit }),
      this.extractAttributedBodyMessages(handleId, limit),
    ]);

    // Merge and deduplicate by ROWID
    const messageMap = new Map<number, Message>();
    for (const msg of textMessages) {
      messageMap.set(msg.id, msg);
    }
    for (const msg of attributedMessages) {
      if (!messageMap.has(msg.id)) {
        messageMap.set(msg.id, msg);
      }
    }

    // Sort by date descending
    const all = Array.from(messageMap.values());
    all.sort((a, b) => b.date.getTime() - a.date.getTime());

    return all.slice(0, limit);
  }

  /**
   * Get total message count for a handle, including attributedBody-only messages.
   */
  async getTotalMessageCount(handleId: string): Promise<number> {
    const escapedHandle = handleId.replace(/'/g, "''");
    const sql = `
      SELECT COUNT(*) as total
      FROM message m
      JOIN handle h ON m.handle_id = h.ROWID
      WHERE h.id = '${escapedHandle}'
        AND (m.text IS NOT NULL OR m.attributedBody IS NOT NULL);
    `;

    const rows = await this.queryJson<{ total: number }>(sql);
    return rows.length > 0 ? rows[0].total : 0;
  }
}

export const messagesClient = new MessagesClient();
