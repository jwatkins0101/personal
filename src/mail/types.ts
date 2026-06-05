export interface EmailMessage {
  id: string;
  threadId: string;
  from: string;
  to: string;
  subject: string;
  snippet: string;
  date: string;
  labels: string[];
  account?: string;
}

export interface EmailClassification {
  id: string;
  category: string;
  action: "archive" | "keep";
  flagColor?: number;
  reason?: string;
  // Extended fields from unified classifier
  priority?: "P0" | "P1" | "P2" | "P3";
  confidence?: number;
  suggestedAction?: string;
}

export interface ClaudeResponse {
  classifications: EmailClassification[];
}

// Flag colors in Apple Mail
export const FLAG_COLORS = {
  none: 0,
  orange: 1,
  red: 2,
  yellow: 3,
  blue: 4,
  purple: 5,
  green: 6,
  gray: 7,
} as const;

// Category to flag color mapping
export const CATEGORY_FLAGS: Record<string, number> = {
  urgent: FLAG_COLORS.red,
  important: FLAG_COLORS.orange,
  work: FLAG_COLORS.blue,
  teaching: FLAG_COLORS.purple,
  personal: FLAG_COLORS.green,
  newsletter: FLAG_COLORS.gray,
  receipt: FLAG_COLORS.yellow,
  social: FLAG_COLORS.gray,
  spam: FLAG_COLORS.none,
  uncategorized: FLAG_COLORS.none,
};

// Categories that should be archived
export const ARCHIVE_CATEGORIES = [
  "newsletter",
  "receipt",
  "social",
  "spam",
  "promotional",
];

// ---- Gmail backend (gws / Gmail API) ----

// Real Gmail label IDs (created in the user's account; see prompts/gmail-triage.md)
export const GMAIL_LABEL_IDS = {
  receipts: "Label_96", // 📥 Receipts
  shipping: "Label_97", // 📦 Shipping
  finance: "Label_93", // 💰 Finance
  newsletters: "Label_94", // 📰 Newsletters
  notifications: "Label_95", // 🔔 Notifications
} as const;

// Classifier category -> Gmail label to apply. Categories not listed get no label
// (they stay in the inbox untouched). `urgent` is starred rather than labeled.
export const CATEGORY_GMAIL_LABELS: Record<string, string> = {
  newsletter: GMAIL_LABEL_IDS.newsletters,
  receipt: GMAIL_LABEL_IDS.receipts,
  shipping: GMAIL_LABEL_IDS.shipping,
  finance: GMAIL_LABEL_IDS.finance,
  social: GMAIL_LABEL_IDS.notifications,
  notification: GMAIL_LABEL_IDS.notifications,
  admin: GMAIL_LABEL_IDS.notifications,
  urgent: "STARRED",
};

// Back-compat: map the old Apple flag-color index to a Gmail label, so undo (which stored
// a numeric flag) can re-apply something sensible.
export const FLAG_TO_GMAIL_LABEL: Record<number, string> = {
  [FLAG_COLORS.red]: "STARRED",
  [FLAG_COLORS.orange]: "IMPORTANT",
  [FLAG_COLORS.yellow]: GMAIL_LABEL_IDS.finance,
  [FLAG_COLORS.gray]: GMAIL_LABEL_IDS.newsletters,
};
