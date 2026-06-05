export interface Message {
  id: number;
  guid: string;
  text: string;
  date: Date;
  isFromMe: boolean;
  isRead: boolean;
  handleId: string; // phone number or email
  chatId?: string;
  hasAttachments: boolean;
  attachments?: Attachment[];
  replyToGuid?: string;
  threadOriginatorGuid?: string;
}

export interface Attachment {
  id: number;
  guid: string;
  filename: string;
  mimeType: string;
  transferName: string;
  totalBytes: number;
}

export interface Conversation {
  chatId: string;
  displayName: string;
  participants: string[];
  isGroupChat: boolean;
  lastMessage?: Message;
  lastMessageDate?: Date;
  unreadCount: number;
  messageCount: number;
}

export interface Contact {
  handleId: string; // phone number or email
  service: "iMessage" | "SMS" | "RCS";
  messageCount: number;
  lastMessageDate?: Date;
}

export interface MessageSearchOptions {
  query?: string;
  handleId?: string;
  chatId?: string;
  fromMe?: boolean;
  startDate?: Date;
  endDate?: Date;
  hasAttachments?: boolean;
  limit?: number;
  offset?: number;
}

export interface ConversationSummary {
  chatId: string;
  displayName: string;
  participants: string[];
  isGroupChat: boolean;
  totalMessages: number;
  messagesFromMe: number;
  messagesFromOthers: number;
  firstMessageDate?: Date;
  lastMessageDate?: Date;
  averageResponseTime?: number; // in minutes
}

export interface MessagesConfig {
  dbPath: string;
  maxResults: number;
}

export const DEFAULT_MESSAGES_CONFIG: MessagesConfig = {
  // MESSAGES_DB override lets a scheduled job read a temp copy (made via a direct bash→sqlite3
  // call) instead of the TCC-protected original, which the npm→node→sqlite3 chain can't open.
  dbPath: process.env.MESSAGES_DB || `${process.env.HOME}/Library/Messages/chat.db`,
  maxResults: 100,
};

// Apple's Core Data timestamp epoch (Jan 1, 2001)
export const APPLE_EPOCH_OFFSET = 978307200;
