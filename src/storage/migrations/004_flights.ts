// Flight price tracking database schema migration

import type Database from "better-sqlite3";

export const version = 4;

export function up(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS flight_watches (
      id TEXT PRIMARY KEY,
      origin TEXT NOT NULL,
      destination TEXT NOT NULL,
      depart_date TEXT NOT NULL,
      return_date TEXT NOT NULL,
      cabin_class TEXT NOT NULL DEFAULT 'BUSINESS',
      passengers INTEGER NOT NULL DEFAULT 1,
      notify_emails TEXT NOT NULL,
      active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      notes TEXT
    );

    CREATE TABLE IF NOT EXISTS flight_prices (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      watch_id TEXT NOT NULL,
      checked_at TEXT NOT NULL DEFAULT (datetime('now')),
      airline TEXT,
      price REAL NOT NULL,
      currency TEXT NOT NULL DEFAULT 'USD',
      cabin_class TEXT NOT NULL,
      stops INTEGER NOT NULL DEFAULT 0,
      duration_minutes INTEGER,
      outbound_departure TEXT,
      outbound_arrival TEXT,
      return_departure TEXT,
      return_arrival TEXT,
      booking_url TEXT,
      raw_json TEXT,
      FOREIGN KEY (watch_id) REFERENCES flight_watches(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_flight_prices_watch_id ON flight_prices(watch_id);
    CREATE INDEX IF NOT EXISTS idx_flight_prices_checked_at ON flight_prices(checked_at);
    CREATE INDEX IF NOT EXISTS idx_flight_prices_price ON flight_prices(price);

    CREATE TABLE IF NOT EXISTS flight_alerts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      watch_id TEXT NOT NULL,
      alert_type TEXT NOT NULL,
      message TEXT NOT NULL,
      price REAL,
      sent_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (watch_id) REFERENCES flight_watches(id) ON DELETE CASCADE
    );
  `);
}

export function down(db: Database.Database): void {
  db.exec(`
    DROP TABLE IF EXISTS flight_alerts;
    DROP TABLE IF EXISTS flight_prices;
    DROP TABLE IF EXISTS flight_watches;
  `);
}
