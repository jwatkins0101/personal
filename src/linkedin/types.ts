// Types for LinkedIn data import

export interface LinkedInConnectionRow {
  firstName: string;
  lastName: string;
  url: string;
  emailAddress: string | null;
  company: string | null;
  position: string | null;
  connectedOn: string | null;
}

export interface LinkedInMessageRow {
  conversationId: string;
  conversationTitle: string | null;
  from: string;
  senderProfileUrl: string;
  to: string;
  recipientProfileUrls: string;
  date: string;
  subject: string | null;
  content: string | null;
  folder: string | null;
  attachments: string | null;
}

export interface ImportStats {
  file: string;
  rowsParsed: number;
  peopleCreated: number;
  peopleUpdated: number;
  connectionsCreated: number;
  connectionsSkipped: number;
  messagesCreated: number;
  messagesSkipped: number;
  errors: number;
}

export interface ParseResult<T> {
  rows: T[];
  errors: string[];
}

// CSV column mappings for Connections.csv
export const CONNECTIONS_COLUMNS = {
  "First Name": "firstName",
  "Last Name": "lastName",
  URL: "url",
  "Email Address": "emailAddress",
  Company: "company",
  Position: "position",
  "Connected On": "connectedOn",
} as const;

// CSV column mappings for messages.csv
export const MESSAGES_COLUMNS = {
  "CONVERSATION ID": "conversationId",
  "CONVERSATION TITLE": "conversationTitle",
  FROM: "from",
  "SENDER PROFILE URL": "senderProfileUrl",
  TO: "to",
  "RECIPIENT PROFILE URLS": "recipientProfileUrls",
  DATE: "date",
  SUBJECT: "subject",
  CONTENT: "content",
  FOLDER: "folder",
  ATTACHMENTS: "attachments",
} as const;
