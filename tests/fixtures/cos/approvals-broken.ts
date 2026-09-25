// Negative fixture for gate:approvals: sends without expiry, recipient or placeholder checks.
export * from "../../../src/cos/approvals.ts";
import type Database from "better-sqlite3";
import type { Executors } from "../../../src/cos/approvals.ts";
export async function send(db: Database.Database, ex: Executors, briefDate: string, n: number) {
  const r = db.prepare("SELECT * FROM cos_approvals WHERE brief_date=? AND day_index=?").get(briefDate, n) as { id: number; payload_json: string };
  const id = await ex.sendDraft(JSON.parse(r.payload_json).draft_id);
  db.prepare("UPDATE cos_approvals SET status='sent' WHERE id=?").run(r.id);
  return `sent ${id}`;
}
