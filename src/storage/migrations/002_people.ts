// People graph database schema migration

import type Database from "better-sqlite3";

export const version = 2;

export function up(db: Database.Database): void {
  // Core people table
  db.exec(`
    CREATE TABLE IF NOT EXISTS people (
      id TEXT PRIMARY KEY,
      display_name TEXT NOT NULL,
      primary_email TEXT,
      primary_phone TEXT,
      linkedin_profile_url TEXT,
      company TEXT,
      title TEXT,
      location TEXT,
      notes TEXT,
      starred INTEGER DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_people_display_name ON people(display_name);
    CREATE INDEX IF NOT EXISTS idx_people_primary_email ON people(primary_email);
    CREATE INDEX IF NOT EXISTS idx_people_primary_phone ON people(primary_phone);
    CREATE INDEX IF NOT EXISTS idx_people_linkedin_url ON people(linkedin_profile_url);
    CREATE INDEX IF NOT EXISTS idx_people_company ON people(company);
  `);

  // Person identities (multiple emails, phones, etc. per person)
  db.exec(`
    CREATE TABLE IF NOT EXISTS person_identities (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      person_id TEXT NOT NULL,
      identity_type TEXT NOT NULL,
      identity_value TEXT NOT NULL,
      confidence REAL NOT NULL DEFAULT 1.0,
      source TEXT NOT NULL,
      created_at TEXT NOT NULL,
      UNIQUE (identity_type, identity_value),
      FOREIGN KEY (person_id) REFERENCES people(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_person_identities_person_id ON person_identities(person_id);
    CREATE INDEX IF NOT EXISTS idx_person_identities_type_value ON person_identities(identity_type, identity_value);
  `);

  // Map memory items to people
  db.exec(`
    CREATE TABLE IF NOT EXISTS item_people_map (
      item_id TEXT NOT NULL,
      person_id TEXT NOT NULL,
      match_confidence REAL NOT NULL DEFAULT 1.0,
      match_reason TEXT NOT NULL,
      created_at TEXT NOT NULL,
      PRIMARY KEY (item_id, person_id),
      FOREIGN KEY (person_id) REFERENCES people(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_item_people_map_person_id ON item_people_map(person_id);
    CREATE INDEX IF NOT EXISTS idx_item_people_map_item_id ON item_people_map(item_id);
  `);

  // LinkedIn connections
  db.exec(`
    CREATE TABLE IF NOT EXISTS linkedin_connections (
      id TEXT PRIMARY KEY,
      person_id TEXT NOT NULL,
      connected_on TEXT,
      import_batch_id TEXT NOT NULL,
      raw_data_json TEXT,
      created_at TEXT NOT NULL,
      FOREIGN KEY (person_id) REFERENCES people(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_linkedin_connections_person_id ON linkedin_connections(person_id);
    CREATE INDEX IF NOT EXISTS idx_linkedin_connections_batch ON linkedin_connections(import_batch_id);
    CREATE INDEX IF NOT EXISTS idx_linkedin_connections_date ON linkedin_connections(connected_on);
  `);

  // LinkedIn messages (imported from export)
  db.exec(`
    CREATE TABLE IF NOT EXISTS linkedin_messages (
      id TEXT PRIMARY KEY,
      conversation_id TEXT NOT NULL,
      from_person_id TEXT,
      to_person_id TEXT,
      from_name TEXT,
      to_name TEXT,
      from_profile_url TEXT,
      to_profile_url TEXT,
      message_date TEXT NOT NULL,
      subject TEXT,
      content TEXT,
      folder TEXT,
      import_batch_id TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_linkedin_messages_conversation ON linkedin_messages(conversation_id);
    CREATE INDEX IF NOT EXISTS idx_linkedin_messages_from ON linkedin_messages(from_person_id);
    CREATE INDEX IF NOT EXISTS idx_linkedin_messages_to ON linkedin_messages(to_person_id);
    CREATE INDEX IF NOT EXISTS idx_linkedin_messages_date ON linkedin_messages(message_date);
  `);

  // Import batches for tracking
  db.exec(`
    CREATE TABLE IF NOT EXISTS import_batches (
      id TEXT PRIMARY KEY,
      source TEXT NOT NULL,
      file_path TEXT,
      file_hash TEXT,
      started_at TEXT NOT NULL,
      completed_at TEXT,
      status TEXT NOT NULL DEFAULT 'running',
      stats_json TEXT,
      error_message TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_import_batches_source ON import_batches(source);
    CREATE INDEX IF NOT EXISTS idx_import_batches_file_hash ON import_batches(file_hash);
  `);

  // Match candidates for review (low-confidence matches)
  db.exec(`
    CREATE TABLE IF NOT EXISTS match_candidates (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      person_id TEXT NOT NULL,
      candidate_person_id TEXT NOT NULL,
      match_type TEXT NOT NULL,
      match_value TEXT NOT NULL,
      confidence REAL NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      resolved_at TEXT,
      resolution TEXT,
      created_at TEXT NOT NULL,
      FOREIGN KEY (person_id) REFERENCES people(id) ON DELETE CASCADE,
      FOREIGN KEY (candidate_person_id) REFERENCES people(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_match_candidates_status ON match_candidates(status);
    CREATE INDEX IF NOT EXISTS idx_match_candidates_person ON match_candidates(person_id);
  `);
}

export function down(db: Database.Database): void {
  db.exec(`
    DROP TABLE IF EXISTS match_candidates;
    DROP TABLE IF EXISTS import_batches;
    DROP TABLE IF EXISTS linkedin_messages;
    DROP TABLE IF EXISTS linkedin_connections;
    DROP TABLE IF EXISTS item_people_map;
    DROP TABLE IF EXISTS person_identities;
    DROP TABLE IF EXISTS people;
  `);
}
