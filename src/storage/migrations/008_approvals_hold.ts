// Chief of Staff: "held" approvals (on hold with a note) (ai-chief-of-staff AC-36)

import type Database from "better-sqlite3";

export const version = 8;

const COLS = "id, brief_date, day_index, kind, title, detail, risk_tier, source_ref, payload_json, status, created_at, expires_at, decided_at, result";

export function up(db: Database.Database): void {
  db.exec(`
    CREATE TABLE cos_approvals_new (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      brief_date TEXT NOT NULL,
      day_index INTEGER NOT NULL,
      kind TEXT NOT NULL CHECK (kind IN ('reply','decide','task')),
      title TEXT NOT NULL,
      detail TEXT NOT NULL DEFAULT '',
      risk_tier TEXT NOT NULL CHECK (risk_tier IN ('A1','A2','A3')),
      source_ref TEXT NOT NULL,
      payload_json TEXT NOT NULL DEFAULT '{}',
      status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','sent','skipped','expired','failed','held')),
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      expires_at TEXT NOT NULL,
      decided_at TEXT,
      result TEXT,
      hold_note TEXT,
      UNIQUE (brief_date, day_index)
    );
    INSERT INTO cos_approvals_new (${COLS}) SELECT ${COLS} FROM cos_approvals;
    DROP TABLE cos_approvals;
    ALTER TABLE cos_approvals_new RENAME TO cos_approvals;
    CREATE INDEX IF NOT EXISTS idx_cos_approvals_status ON cos_approvals(status, brief_date);
  `);
}

export function down(db: Database.Database): void {
  db.exec(`UPDATE cos_approvals SET status='skipped' WHERE status='held';`);
}
