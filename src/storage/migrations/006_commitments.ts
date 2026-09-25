// Chief of Staff commitment ledger (ai-chief-of-staff AC-18..AC-20)

import type Database from "better-sqlite3";

export const version = 6;

export function up(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS cos_commitments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      owner TEXT NOT NULL CHECK (owner IN ('me','them')),   -- me = Jermaine promised; them = someone promised him
      counterparty TEXT NOT NULL,
      what TEXT NOT NULL,
      due_quote TEXT,                                       -- verbatim words from the source
      due_at TEXT,                                          -- YYYY-MM-DD, only when due_quote names a specific day
      open_question TEXT,                                   -- set when the due date is vague or missing
      source_ref TEXT NOT NULL,                             -- gmail:<id> | sms:<rowid>
      source_refs TEXT NOT NULL DEFAULT '[]',               -- every source that reported it (after dedupe)
      source_date TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','closed')),
      closed_evidence TEXT,                                 -- gmail:<sent id> | cal:<ref> | task:<id>
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_cos_commitments_status ON cos_commitments(status, due_at);
  `);
}

export function down(db: Database.Database): void {
  db.exec(`DROP TABLE IF EXISTS cos_commitments;`);
}
