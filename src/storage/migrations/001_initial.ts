// Initial database schema migration

import type Database from "better-sqlite3";

export const version = 1;

export function up(db: Database.Database): void {
  // Main storage table for all ingested items
  db.exec(`
    CREATE TABLE IF NOT EXISTS memory_items (
      id TEXT PRIMARY KEY,
      source TEXT NOT NULL,
      source_ref TEXT NOT NULL,
      ingested_at TEXT NOT NULL,
      occurred_at TEXT NOT NULL,
      title TEXT NOT NULL,
      summary TEXT,
      snippet TEXT NOT NULL,
      raw_hash TEXT NOT NULL,
      category TEXT,
      priority TEXT,
      confidence REAL,
      reason TEXT,
      suggested_actions_json TEXT,
      status TEXT NOT NULL DEFAULT 'new',
      route TEXT,
      metadata_json TEXT,
      UNIQUE (source, source_ref)
    );

    CREATE INDEX IF NOT EXISTS idx_memory_items_status ON memory_items(status);
    CREATE INDEX IF NOT EXISTS idx_memory_items_source ON memory_items(source);
    CREATE INDEX IF NOT EXISTS idx_memory_items_category ON memory_items(category);
    CREATE INDEX IF NOT EXISTS idx_memory_items_priority ON memory_items(priority);
    CREATE INDEX IF NOT EXISTS idx_memory_items_raw_hash ON memory_items(raw_hash);
    CREATE INDEX IF NOT EXISTS idx_memory_items_occurred_at ON memory_items(occurred_at);
    CREATE INDEX IF NOT EXISTS idx_memory_items_route ON memory_items(route);
  `);

  // Action log table for audit trail / receipts
  db.exec(`
    CREATE TABLE IF NOT EXISTS action_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      item_id TEXT NOT NULL,
      action TEXT NOT NULL,
      performed_at TEXT NOT NULL,
      inputs_json TEXT,
      outputs_json TEXT,
      result TEXT NOT NULL,
      error_message TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_action_logs_item_id ON action_logs(item_id);
    CREATE INDEX IF NOT EXISTS idx_action_logs_action ON action_logs(action);
    CREATE INDEX IF NOT EXISTS idx_action_logs_performed_at ON action_logs(performed_at);
  `);

  // Feedback table for user corrections
  db.exec(`
    CREATE TABLE IF NOT EXISTS feedback (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      item_id TEXT NOT NULL,
      created_at TEXT NOT NULL,
      field TEXT NOT NULL,
      old_value TEXT,
      new_value TEXT NOT NULL,
      user_note TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_feedback_item_id ON feedback(item_id);
    CREATE INDEX IF NOT EXISTS idx_feedback_created_at ON feedback(created_at);
    CREATE INDEX IF NOT EXISTS idx_feedback_field ON feedback(field);
  `);

  // Schema version tracking
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_version (
      version INTEGER PRIMARY KEY
    );
  `);
}

export function down(db: Database.Database): void {
  db.exec(`
    DROP TABLE IF EXISTS feedback;
    DROP TABLE IF EXISTS action_logs;
    DROP TABLE IF EXISTS memory_items;
    DROP TABLE IF EXISTS schema_version;
  `);
}
