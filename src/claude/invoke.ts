import type { EmailMessage, EmailClassification } from "../mail/types.js";
import { CATEGORY_FLAGS } from "../mail/types.js";
import {
  classifyItems,
  emailsToClassifiable,
  type ClassificationResult,
  ARCHIVE_CATEGORIES,
  CATEGORY_FLAG_COLORS,
} from "../classifier/index.js";

// Map new categories to legacy categories for backwards compatibility
const CATEGORY_MAP: Record<string, string> = {
  urgent: "urgent",
  work: "work",
  personal: "important",
  newsletter: "newsletter",
  finance: "receipt",
  health: "important",
  admin: "uncategorized",
  idea: "uncategorized",
  "waiting-on": "work",
  reference: "newsletter",
};

// Map new categories to archive behavior
const LEGACY_ARCHIVE_CATEGORIES = [
  "newsletter",
  "receipt",
  "social",
  "spam",
  "promotional",
];

/**
 * Classify emails using the unified classifier
 * Returns legacy EmailClassification format for backwards compatibility
 */
export async function invokeClaudeForClassification(
  emails: EmailMessage[]
): Promise<EmailClassification[]> {
  if (emails.length === 0) {
    return [];
  }

  // Convert emails to classifiable items
  const items = emailsToClassifiable(emails);

  // Classify using unified classifier
  const results = await classifyItems(items);

  // Convert to legacy format
  return results.map((result) => {
    const legacyCategory = CATEGORY_MAP[result.category] || "uncategorized";
    const shouldArchive =
      ARCHIVE_CATEGORIES.includes(result.category) ||
      result.priority === "P3";

    return {
      id: result.id,
      category: legacyCategory,
      action: shouldArchive ? "archive" : "keep",
      flagColor:
        CATEGORY_FLAG_COLORS[result.category] ??
        CATEGORY_FLAGS[legacyCategory] ??
        0,
      reason: result.reason,
      // Extended fields from unified classifier
      priority: result.priority,
      confidence: result.confidence,
      suggestedAction: result.suggested_next_action,
    } as EmailClassification;
  });
}

/**
 * Classify emails and return full classification results
 */
export async function classifyEmails(
  emails: EmailMessage[]
): Promise<ClassificationResult[]> {
  const items = emailsToClassifiable(emails);
  return classifyItems(items);
}

// Re-export classifier functions for direct use
export { classifyItems, classifyItem } from "../classifier/index.js";
