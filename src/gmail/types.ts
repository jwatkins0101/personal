export interface EmailMessage {
  id: string;
  threadId: string;
  from: string;
  to: string;
  subject: string;
  snippet: string;
  date: string;
  labels: string[];
}

export interface EmailClassification {
  id: string;
  category: string;
  action: "archive" | "keep";
  label: string;
  reason?: string;
}

export interface ClaudeResponse {
  classifications: EmailClassification[];
}

export interface GmailLabel {
  id: string;
  name: string;
  type: string;
}

export interface TokenData {
  access_token: string;
  refresh_token: string;
  scope: string;
  token_type: string;
  expiry_date: number;
}
