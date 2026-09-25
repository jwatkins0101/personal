// Chief of Staff approvals queue (ai-chief-of-staff AC-14)

import type Database from "better-sqlite3";

export const version = 5;

export function up(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS cos_approvals (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      brief_date TEXT NOT NULL,            -- YYYY-MM-DD (local) of the brief that proposed it
      day_index INTEGER NOT NULL,          -- the N in approve N / send N / skip N
      kind TEXT NOT NULL CHECK (kind IN ('reply','decide','task')),
      title TEXT NOT NULL,
      detail TEXT NOT NULL DEFAULT '',
      risk_tier TEXT NOT NULL CHECK (risk_tier IN ('A1','A2','A3')),
      source_ref TEXT NOT NULL,
      payload_json TEXT NOT NULL DEFAULT '{}',
      status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','sent','skipped','expired','failed')),
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      expires_at TEXT NOT NULL,            -- ISO; after this nothing may act on it (fail closed)
      decided_at TEXT,
      result TEXT,
      UNIQUE (brief_date, day_index)
    );
    CREATE INDEX IF NOT EXISTS idx_cos_approvals_status ON cos_approvals(status, brief_date);
  `);
}

export function down(db: Database.Database): void {
  db.exec(`DROP TABLE IF EXISTS cos_approvals;`);
}
