// Migration registry

import type Database from "better-sqlite3";
import * as m001 from "./001_initial.js";
import * as m002 from "./002_people.js";
import * as m003 from "./003_pipeline.js";
import * as m004 from "./004_flights.js";
import * as m005 from "./005_cos.js";
import * as m006 from "./006_commitments.js";
import * as m007 from "./007_agent_jobs.js";

export interface Migration {
  version: number;
  up: (db: Database.Database) => void;
  down: (db: Database.Database) => void;
}

// Register all migrations in order
export const migrations: Migration[] = [
  m001,
  m002,
  m003,
  m004,
  m005,
  m006,
  m007,
];
