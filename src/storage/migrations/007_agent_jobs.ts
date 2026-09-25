// Chief of Staff "hand to agent" jobs (ai-chief-of-staff AC-27, AC-28)

import type Database from "better-sqlite3";

export const version = 7;

export function up(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS cos_agent_jobs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      brief_date TEXT NOT NULL,
      day_index INTEGER NOT NULL,
      note TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'queued' CHECK (status IN ('queued','running','ready','failed','cancelled')),
      pid INTEGER,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      started_at TEXT,
      finished_at TEXT,
      summary TEXT,
      result_json TEXT,          -- findings, needs_from_you, gaps, draft (as returned + validated)
      draft_id TEXT,             -- created by code, never by the agent
      cost_usd REAL,
      error TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_cos_agent_jobs_item ON cos_agent_jobs(brief_date, day_index);
  `);
}

export function down(db: Database.Database): void {
  db.exec(`DROP TABLE IF EXISTS cos_agent_jobs;`);
}
