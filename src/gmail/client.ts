import { google, gmail_v1 } from "googleapis";
import { getAuthenticatedClient } from "./auth.js";
import type { EmailMessage, GmailLabel } from "./types.js";
import { MAX_EMAILS_PER_RUN, LABEL_PREFIX } from "../config.js";

let gmailClient: gmail_v1.Gmail | null = null;
let labelCache: Map<string, string> = new Map();

export async function getGmailClient(): Promise<gmail_v1.Gmail> {
  if (!gmailClient) {
    const auth = await getAuthenticatedClient();
    gmailClient = google.gmail({ version: "v1", auth });
  }
  return gmailClient;
}

function parseEmailAddress(header: string): string {
  // Extract email from formats like "Name <email@example.com>" or just "email@example.com"
  const match = header.match(/<([^>]+)>/) || header.match(/([^\s<>]+@[^\s<>]+)/);
  return match ? match[1] : header;
}

function getHeader(
  headers: gmail_v1.Schema$MessagePartHeader[] | undefined,
  name: string
): string {
  const header = headers?.find(
    (h) => h.name?.toLowerCase() === name.toLowerCase()
  );
  return header?.value || "";
}

export async function fetchUnreadEmails(): Promise<EmailMessage[]> {
  const gmail = await getGmailClient();

  // Fetch unread messages in inbox
  const response = await gmail.users.messages.list({
    userId: "me",
    q: "is:unread in:inbox",
    maxResults: MAX_EMAILS_PER_RUN,
  });

  const messages = response.data.messages || [];
  if (messages.length === 0) {
    return [];
  }

  // Fetch full details for each message
  const emails: EmailMessage[] = [];
  for (const msg of messages) {
    if (!msg.id) continue;

    const detail = await gmail.users.messages.get({
      userId: "me",
      id: msg.id,
      format: "metadata",
      metadataHeaders: ["From", "To", "Subject", "Date"],
    });

    const headers = detail.data.payload?.headers;
    emails.push({
      id: msg.id,
      threadId: msg.threadId || msg.id,
      from: parseEmailAddress(getHeader(headers, "From")),
      to: parseEmailAddress(getHeader(headers, "To")),
      subject: getHeader(headers, "Subject"),
      snippet: detail.data.snippet || "",
      date: getHeader(headers, "Date"),
      labels: detail.data.labelIds || [],
    });
  }

  return emails;
}

export async function loadLabels(): Promise<void> {
  const gmail = await getGmailClient();
  const response = await gmail.users.labels.list({ userId: "me" });
  const labels = response.data.labels || [];

  labelCache.clear();
  for (const label of labels) {
    if (label.id && label.name) {
      labelCache.set(label.name, label.id);
    }
  }
}

export async function ensureLabelExists(labelName: string): Promise<string> {
  // Check cache first
  if (labelCache.has(labelName)) {
    return labelCache.get(labelName)!;
  }

  // Refresh cache
  await loadLabels();
  if (labelCache.has(labelName)) {
    return labelCache.get(labelName)!;
  }

  // Create the label
  const gmail = await getGmailClient();
  const response = await gmail.users.labels.create({
    userId: "me",
    requestBody: {
      name: labelName,
      labelListVisibility: "labelShow",
      messageListVisibility: "show",
    },
  });

  const labelId = response.data.id!;
  labelCache.set(labelName, labelId);
  console.log(`Created label: ${labelName}`);
  return labelId;
}

export async function applyLabel(
  messageId: string,
  labelName: string
): Promise<void> {
  const gmail = await getGmailClient();
  const labelId = await ensureLabelExists(labelName);

  await gmail.users.messages.modify({
    userId: "me",
    id: messageId,
    requestBody: {
      addLabelIds: [labelId],
    },
  });
}

export async function archiveMessage(messageId: string): Promise<void> {
  const gmail = await getGmailClient();

  await gmail.users.messages.modify({
    userId: "me",
    id: messageId,
    requestBody: {
      removeLabelIds: ["INBOX"],
    },
  });
}

export async function processEmailAction(
  messageId: string,
  labelName: string,
  shouldArchive: boolean
): Promise<void> {
  const gmail = await getGmailClient();
  const labelId = await ensureLabelExists(labelName);

  const modifyRequest: gmail_v1.Schema$ModifyMessageRequest = {
    addLabelIds: [labelId],
  };

  if (shouldArchive) {
    modifyRequest.removeLabelIds = ["INBOX"];
  }

  await gmail.users.messages.modify({
    userId: "me",
    id: messageId,
    requestBody: modifyRequest,
  });
}

export async function markAsRead(messageId: string): Promise<void> {
  const gmail = await getGmailClient();

  await gmail.users.messages.modify({
    userId: "me",
    id: messageId,
    requestBody: {
      removeLabelIds: ["UNREAD"],
    },
  });
}
