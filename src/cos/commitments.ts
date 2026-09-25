/**
 * Commitment ledger (AC-18..AC-20).
 * - Due dates come only from resolveDue(); vague words leave due_at null plus an open question.
 * - The same promise seen in two places (email and SMS) is merged, not duplicated.
 * - A commitment closes only with evidence that the checker confirms exists.
 */
import type Database from "better-sqlite3";
import { resolveDue } from "./dates.js";

export interface CommitmentInput {
  owner: "me" | "them";
  counterparty: string;
  what: string;
  due_quote?: string | null;
  source_ref: string;
  source_date: Date;
}

export interface Commitment {
  id: number; owner: "me" | "them"; counterparty: string; what: string;
  due_quote: string | null; due_at: string | null; open_question: string | null;
  source_ref: string; source_refs: string[]; source_date: string;
  status: "open" | "closed"; closed_evidence: string | null; created_at: string; updated_at: string;
}

const STOP = new Set(["the", "a", "an", "to", "for", "of", "and", "on", "by", "my", "your", "his", "her", "their", "i", "you", "will", "send", "get", "it", "that", "this", "with", "about", "over", "back"]);
const tokens = (s: string) => new Set(s.toLowerCase().replace(/[^a-z0-9 ]/g, " ").split(/\s+/).filter((t) => t.length > 1 && !STOP.has(t)));
const jaccard = (a: Set<string>, b: Set<string>) => { const i = [...a].filter((x) => b.has(x)).length; const u = new Set([...a, ...b]).size; return u ? i / u : 0; };
/** First-name level match: "Jason N" ~ "jason@x.com" ~ "Jason Nguyen". */
const sameParty = (a: string, b: string) => {
  const first = (s: string) => s.toLowerCase().replace(/<.*?>|["']/g, "").split(/[\s@._<>,]+/).filter(Boolean)[0] ?? "";
  return first(a) !== "" && first(a) === first(b);
};

const row = (r: Record<string, unknown>): Commitment => ({ ...(r as unknown as Commitment), source_refs: JSON.parse(String(r.source_refs ?? "[]")) });

export function listCommitments(db: Database.Database, status?: "open" | "closed"): Commitment[] {
  const rows = status
    ? db.prepare("SELECT * FROM cos_commitments WHERE status = ? ORDER BY COALESCE(due_at,'9999'), id").all(status)
    : db.prepare("SELECT * FROM cos_commitments ORDER BY id").all();
  return (rows as Record<string, unknown>[]).map(row);
}

/** Finds an open commitment that is the same promise (same owner, same person, same due day, similar wording). */
export function findDuplicate(db: Database.Database, c: CommitmentInput, due_at: string | null): Commitment | null {
  const t = tokens(c.what);
  for (const o of listCommitments(db, "open")) {
    if (o.owner !== c.owner || !sameParty(o.counterparty, c.counterparty)) continue;
    if ((o.due_at ?? null) !== (due_at ?? null) && o.due_at && due_at) continue;
    // One message can hold several promises: a shared source only merges when the wording is also close.
    const sim = jaccard(t, tokens(o.what));
    if (o.source_refs.includes(c.source_ref) ? sim >= 0.3 : sim >= 0.5) return o;
  }
  return null;
}

export interface UpsertResult { action: "created" | "merged"; commitment: Commitment }

export function upsertCommitment(db: Database.Database, c: CommitmentInput): UpsertResult {
  const due = resolveDue(c.due_quote, c.source_date);
  const openQ = due.due_at ? null : `When is "${c.what}" due? (${due.reason})`;
  const dup = findDuplicate(db, c, due.due_at);
  if (dup) {
    const refs = [...new Set([...dup.source_refs, c.source_ref])];
    const dueAt = dup.due_at ?? due.due_at;
    db.prepare("UPDATE cos_commitments SET source_refs=?, due_at=?, due_quote=COALESCE(due_quote, ?), open_question=?, updated_at=datetime('now') WHERE id=?")
      .run(JSON.stringify(refs), dueAt, c.due_quote ?? null, dueAt ? null : dup.open_question, dup.id);
    return { action: "merged", commitment: listCommitments(db).find((x) => x.id === dup.id)! };
  }
  const info = db.prepare(`INSERT INTO cos_commitments (owner, counterparty, what, due_quote, due_at, open_question, source_ref, source_refs, source_date)
    VALUES (?,?,?,?,?,?,?,?,?)`).run(c.owner, c.counterparty, c.what, c.due_quote ?? null, due.due_at, openQ, c.source_ref, JSON.stringify([c.source_ref]), c.source_date.toISOString());
  return { action: "created", commitment: listCommitments(db).find((x) => x.id === Number(info.lastInsertRowid))! };
}

export type EvidenceChecker = (evidence: string) => Promise<boolean>;
export const EVIDENCE_REF = /^(gmail|cal|task|sms):\S+$/;

/** Closes only when the evidence is a well-formed reference the checker confirms (sent mail, event, completed task). */
export async function closeCommitment(db: Database.Database, id: number, evidence: string, exists: EvidenceChecker): Promise<Commitment> {
  const c = listCommitments(db).find((x) => x.id === id);
  if (!c) throw new Error(`No commitment ${id}.`);
  if (c.status === "closed") throw new Error(`Commitment ${id} is already closed.`);
  if (!EVIDENCE_REF.test(evidence ?? "")) throw new Error(`Refused: closing needs evidence (gmail:<sent id>, sms:<sent id>, cal:<event>, task:<id>), got "${evidence}".`);
  if (!(await exists(evidence))) throw new Error(`Refused: evidence ${evidence} could not be confirmed.`);
  db.prepare("UPDATE cos_commitments SET status='closed', closed_evidence=?, updated_at=datetime('now') WHERE id=?").run(evidence, id);
  return listCommitments(db).find((x) => x.id === id)!;
}

/** Open commitments past their due date (dropped balls). */
export function overdue(db: Database.Database, today: string): Commitment[] {
  return listCommitments(db, "open").filter((c) => c.due_at !== null && c.due_at < today);
}
