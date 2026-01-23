// Unified classification types for all item types

export type ItemType = "email" | "message" | "note" | "calendar";

export type Category =
  | "urgent"
  | "work"
  | "personal"
  | "newsletter"
  | "finance"
  | "health"
  | "admin"
  | "idea"
  | "waiting-on"
  | "reference";

export type Priority = "P0" | "P1" | "P2" | "P3";

export interface ClassificationResult {
  id: string;
  type: ItemType;
  category: Category;
  priority: Priority;
  confidence: number; // 0-1
  reason: string;
  suggested_next_action: string;
}

// Input item for classification
export interface ClassifiableItem {
  id: string;
  type: ItemType;
  from?: string;
  to?: string;
  subject?: string;
  content: string;
  date: string;
  metadata?: Record<string, unknown>;
}

// Batch classification request
export interface ClassificationRequest {
  items: ClassifiableItem[];
}

// Batch classification response
export interface ClassificationResponse {
  classifications: ClassificationResult[];
}

// Legacy email classification (for backwards compatibility)
export interface LegacyEmailClassification {
  id: string;
  category: string;
  action: "archive" | "keep";
  flagColor?: number;
  reason?: string;
}

// Map new categories to legacy archive behavior
export const ARCHIVE_CATEGORIES: Category[] = [
  "newsletter",
  "reference",
];

// Map new categories to Apple Mail flag colors
export const CATEGORY_FLAG_COLORS: Record<Category, number> = {
  urgent: 2,      // red
  work: 4,        // blue
  personal: 6,    // green
  newsletter: 7,  // gray
  finance: 3,     // yellow
  health: 5,      // purple
  admin: 7,       // gray
  idea: 1,        // orange
  "waiting-on": 3, // yellow
  reference: 0,   // none
};

// Priority to urgency mapping
export const PRIORITY_WEIGHT: Record<Priority, number> = {
  P0: 4, // Critical, immediate action
  P1: 3, // High, today
  P2: 2, // Medium, this week
  P3: 1, // Low, when time permits
};
