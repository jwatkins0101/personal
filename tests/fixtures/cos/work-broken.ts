// Negative fixture for gate:work: closes work without a result and lists everything ever.
export * from "../../../src/cos/work.ts";
import type Database from "better-sqlite3";
export function updateWork(db: Database.Database, id: number, status: string, result?: string) {
  db.prepare("UPDATE cos_work SET status=?, result=? WHERE id=?").run(status, result ?? null, id);
  return db.prepare("SELECT * FROM cos_work WHERE id=?").get(id);
}
export function listWork(db: Database.Database) { return db.prepare("SELECT * FROM cos_work ORDER BY id").all(); }
