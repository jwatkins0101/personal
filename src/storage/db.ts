// Database connection singleton and initialization

import Database from "better-sqlite3";
import { mkdirSync, existsSync } from "fs";
import { dirname } from "path";
import { DB_PATH } from "../config.js";
import { runMigrations } from "./schema.js";

let db: Database.Database | null = null;

/**
 * Get the database connection singleton.
 * Creates the database and runs migrations if needed.
 */
export function getDb(): Database.Database {
  if (db) {
    return db;
  }

  // Ensure the directory exists
  const dbDir = dirname(DB_PATH);
  if (!existsSync(dbDir)) {
    mkdirSync(dbDir, { recursive: true });
  }

  // Open database
  db = new Database(DB_PATH);

  // Enable WAL mode for better concurrent access
  db.pragma("journal_mode = WAL");

  // Enable foreign keys
  db.pragma("foreign_keys = ON");

  // Run migrations
  runMigrations(db);

  return db;
}

/**
 * Close the database connection.
 * Call this on shutdown for clean exit.
 */
export function closeDb(): void {
  if (db) {
    db.close();
    db = null;
  }
}

/**
 * Execute a transaction with automatic rollback on error.
 */
export function transaction<T>(fn: () => T): T {
  const database = getDb();
  return database.transaction(fn)();
}
