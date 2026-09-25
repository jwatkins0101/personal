// Chief of Staff: work the /cos agent hands to sub-agents (ai-chief-of-staff AC-37)

import type Database from "better-sqlite3";

export const version = 9;

export function up(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS cos_work (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      goal TEXT NOT NULL,
      title TEXT NOT NULL,
      agent TEXT NOT NULL DEFAULT 'cos',
      status TEXT NOT NULL DEFAULT 'queued' CHECK (status IN ('queued','running','review','done','failed','cancelled')),
      result TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_cos_work_status ON cos_work(status, updated_at);
  `);
}

export function down(db: Database.Database): void {
  db.exec(`DROP TABLE IF EXISTS cos_work;`);
}
