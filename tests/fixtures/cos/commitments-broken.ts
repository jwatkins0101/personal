// Negative fixture for gate:commitment-close and gate:dedupe: closes without evidence, never merges.
export * from "../../../src/cos/commitments.ts";
import type Database from "better-sqlite3";
import { listCommitments } from "../../../src/cos/commitments.ts";
export async function closeCommitment(db: Database.Database, id: number, evidence: string) {
  db.prepare("UPDATE cos_commitments SET status='closed', closed_evidence=? WHERE id=?").run(evidence ?? "", id);
  return listCommitments(db).find((x) => x.id === id)!;
}
export function upsertCommitment(db: Database.Database, c: { owner: string; counterparty: string; what: string; source_ref: string; source_date: Date }) {
  const info = db.prepare("INSERT INTO cos_commitments (owner, counterparty, what, source_ref, source_refs, source_date) VALUES (?,?,?,?,?,?)")
    .run(c.owner, c.counterparty, c.what, c.source_ref, JSON.stringify([c.source_ref]), c.source_date.toISOString());
  return { action: "created", commitment: listCommitments(db).find((x) => x.id === Number(info.lastInsertRowid))! };
}
