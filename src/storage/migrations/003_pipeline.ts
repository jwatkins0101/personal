// Pipeline run tracking database schema migration

import type Database from "better-sqlite3";

export const version = 3;

export function up(db: Database.Database): void {
  // Pipeline runs table
  db.exec(`
    CREATE TABLE IF NOT EXISTS pipeline_runs (
      id TEXT PRIMARY KEY,
      profile TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'running',
      steps_json TEXT,
      options_json TEXT,
      started_at TEXT NOT NULL,
      finished_at TEXT,
      wall_clock_ms INTEGER,
      error_message TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_pipeline_runs_status ON pipeline_runs(status);
    CREATE INDEX IF NOT EXISTS idx_pipeline_runs_started_at ON pipeline_runs(started_at);
  `);

  // Pipeline steps table
  db.exec(`
    CREATE TABLE IF NOT EXISTS pipeline_steps (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      run_id TEXT NOT NULL,
      step_name TEXT NOT NULL,
      status TEXT NOT NULL,
      attempt INTEGER NOT NULL DEFAULT 1,
      counts_json TEXT,
      artifacts_json TEXT,
      error_code TEXT,
      error_message TEXT,
      started_at TEXT NOT NULL,
      finished_at TEXT,
      FOREIGN KEY (run_id) REFERENCES pipeline_runs(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_pipeline_steps_run_id ON pipeline_steps(run_id);
    CREATE INDEX IF NOT EXISTS idx_pipeline_steps_step_name ON pipeline_steps(step_name);
  `);
}

export function down(db: Database.Database): void {
  db.exec(`
    DROP TABLE IF EXISTS pipeline_steps;
    DROP TABLE IF EXISTS pipeline_runs;
  `);
}
