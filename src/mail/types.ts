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
