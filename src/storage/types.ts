// Storage types for the Second Brain SQLite layer

import type { Category, Priority } from "../classifier/types.js";

export type ItemSource = "email" | "message" | "calendar" | "note";

export type ItemStatus =
  | "new"
  | "processed"
  | "queued"
  | "acted"
  | "ignored"
  | "error";

export interface MemoryItem {
  id: string; // Format: {source}:{source_ref} e.g., "email:12345"
  source: ItemSource;
  source_ref: string; // Native ID from the source system
  ingested_at: string; // ISO timestamp
  occurred_at: string; // When the item originally occurred
  title: string;
  summary: string | null;
  snippet: string; // First ~500 chars of content
  raw_hash: string; // SHA256 for deduplication
  category: Category | null;
  priority: Priority | null;
  confidence: number | null; // 0-1 from classifier
  reason: string | null; // Classification reason
  suggested_actions_json: string | null; // JSON array of actions
  status: ItemStatus;
  route: string | null; // inbox, review, archive, notes:folder
  metadata_json: string | null; // Additional source-specific data
}

export interface MemoryItemRow {
  id: string;
  source: string;
  source_ref: string;
  ingested_at: string;
  occurred_at: string;
  title: string;
  summary: string | null;
  snippet: string;
  raw_hash: string;
  category: string | null;
  priority: string | null;
  confidence: number | null;
  reason: string | null;
  suggested_actions_json: string | null;
  status: string;
  route: string | null;
  metadata_json: string | null;
}

export interface ActionLog {
  id?: number;
  item_id: string;
  action: string; // archive, flag, create_note, route, etc.
  performed_at: string; // ISO timestamp
  inputs_json: string | null; // Input parameters
  outputs_json: string | null; // Results/output data
  result: "success" | "failure";
  error_message: string | null;
}

export interface ActionLogRow {
  id: number;
  item_id: string;
  action: string;
  performed_at: string;
  inputs_json: string | null;
  outputs_json: string | null;
  result: string;
  error_message: string | null;
}

export interface Feedback {
  id?: number;
  item_id: string;
  created_at: string; // ISO timestamp
  field: string; // category, priority, route, etc.
  old_value: string | null;
  new_value: string;
  user_note: string | null;
}

export interface FeedbackRow {
  id: number;
  item_id: string;
  created_at: string;
  field: string;
  old_value: string | null;
  new_value: string;
  user_note: string | null;
}

// For creating new items
export interface NewMemoryItem {
  source: ItemSource;
  source_ref: string;
  occurred_at: string;
  title: string;
  summary?: string | null;
  snippet: string;
  raw_hash: string;
  metadata_json?: string | null;
}

// Bouncer decision types
export interface BouncerDecision {
  shouldAutoAct: boolean;
  shouldQueue: boolean;
  storeOnly: boolean;
  route: string;
  reason: string;
}

export interface BouncerThresholds {
  autoAct: number; // >= this confidence = auto-act
  queue: number; // >= this confidence = queue for review
  // < queue confidence = store only
}

export const DEFAULT_BOUNCER_THRESHOLDS: BouncerThresholds = {
  autoAct: 0.85,
  queue: 0.6,
};
