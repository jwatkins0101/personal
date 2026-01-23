// Migration runner

import type Database from "better-sqlite3";
import { migrations } from "./migrations/index.js";

/**
 * Get the current schema version from the database.
 * Returns 0 if no migrations have been run.
 */
function getCurrentVersion(db: Database.Database): number {
  try {
    const row = db
      .prepare("SELECT MAX(version) as version FROM schema_version")
      .get() as { version: number | null } | undefined;
    return row?.version ?? 0;
  } catch {
    // Table doesn't exist yet
    return 0;
  }
}

/**
 * Run all pending migrations.
 */
export function runMigrations(db: Database.Database): void {
  const currentVersion = getCurrentVersion(db);

  // Sort migrations by version
  const sortedMigrations = [...migrations].sort(
    (a, b) => a.version - b.version
  );

  // Run pending migrations
  for (const migration of sortedMigrations) {
    if (migration.version > currentVersion) {
      console.log(`Running migration ${migration.version}...`);

      db.transaction(() => {
        migration.up(db);
        db.prepare("INSERT INTO schema_version (version) VALUES (?)").run(
          migration.version
        );
      })();

      console.log(`Migration ${migration.version} complete.`);
    }
  }
}

/**
 * Rollback to a specific version.
 * WARNING: This will drop data!
 */
export function rollbackTo(db: Database.Database, targetVersion: number): void {
  const currentVersion = getCurrentVersion(db);

  if (targetVersion >= currentVersion) {
    console.log("Nothing to rollback.");
    return;
  }

  // Sort migrations by version descending
  const sortedMigrations = [...migrations].sort(
    (a, b) => b.version - a.version
  );

  // Run down migrations
  for (const migration of sortedMigrations) {
    if (migration.version > targetVersion && migration.version <= currentVersion) {
      console.log(`Rolling back migration ${migration.version}...`);

      db.transaction(() => {
        migration.down(db);
        db.prepare("DELETE FROM schema_version WHERE version = ?").run(
          migration.version
        );
      })();

      console.log(`Rollback ${migration.version} complete.`);
    }
  }
}
