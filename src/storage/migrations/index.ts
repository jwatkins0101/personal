// Migration registry

import type Database from "better-sqlite3";
import * as m001 from "./001_initial.js";
import * as m002 from "./002_people.js";

export interface Migration {
  version: number;
  up: (db: Database.Database) => void;
  down: (db: Database.Database) => void;
}

// Register all migrations in order
export const migrations: Migration[] = [
  m001,
  m002,
];
