/**
 * Approvals queue (AC-14). Every consequential action waits here for the principal's
 * `approve N` / `send N` / `skip N`. Items expire at 23:59 local on their brief date with
 * no side effect (fail closed). Side effects go through injected executors so they can be stubbed.
 */
import type Database from "better-sqlite3";

export type ApprovalKind = "reply" | "decide" | "task";
export type ApprovalStatus = "pending" | "approved" | "sent" | "skipped" | "expired" | "failed";

export interface Approval {
  id: number;
  brief_date: string;
  day_index: number;
  kind: ApprovalKind;
  title: string;
  detail: string;
  risk_tier: "A1" | "A2" | "A3";
  source_ref: string;
  payload: Record<string, unknown>;
  status: ApprovalStatus;
  expires_at: string;
  decided_at: string | null;
  result: string | null;
}

export interface NewApproval {
  kind: ApprovalKind;
  title: string;
  detail?: string;
  risk_tier: "A1" | "A2" | "A3";
  source_ref: string;
  payload?: Record<string, unknown>;
}

export interface Executors {
  /** Sends an existing Gmail draft; returns the sent message id. */
  sendDraft(draftId: string): Promise<string>;
  /** Reads a draft's final recipients and body for the pre-send preview. */
  readDraft(draftId: string): Promise<{ to: string; subject: string; body: string }>;
  /** Creates a task; returns its id. */
  createTask(title: string, notes: string): Promise<string>;
}

/** Local end of day for a YYYY-MM-DD date, as ISO. */
/** Placeholder text that must never be sent: [link], [SA/PA], TODO, XXX, <name>. */
export const PLACEHOLDER = /\[[^\]\n]{1,40}\]|\bTODO\b|\bXX+\b|<[a-z][a-z _-]{1,30}>/i;

export function endOfDay(date: string): string {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(y, m - 1, d, 23, 59, 59).toISOString();
}

export function localDate(now = new Date()): string {
  const off = now.getTimezoneOffset() * 60_000;
  return new Date(now.getTime() - off).toISOString().slice(0, 10);
}

const row = (r: Record<string, unknown>): Approval => ({ ...(r as unknown as Approval), payload: JSON.parse(String(r.payload_json ?? "{}")) });

export function addApprovals(db: Database.Database, briefDate: string, items: NewApproval[]): Approval[] {
  const max = db.prepare("SELECT COALESCE(MAX(day_index),0) AS m FROM cos_approvals WHERE brief_date = ?").get(briefDate) as { m: number };
  const ins = db.prepare(`INSERT INTO cos_approvals (brief_date, day_index, kind, title, detail, risk_tier, source_ref, payload_json, expires_at)
                          VALUES (?,?,?,?,?,?,?,?,?)`);
  let n = max.m;
  const tx = db.transaction(() => {
    for (const it of items) {
      n++;
      ins.run(briefDate, n, it.kind, it.title, it.detail ?? "", it.risk_tier, it.source_ref, JSON.stringify(it.payload ?? {}), endOfDay(briefDate));
    }
  });
  tx();
  return listApprovals(db, briefDate).filter((a) => a.day_index > max.m);
}

export function listApprovals(db: Database.Database, briefDate: string): Approval[] {
  return (db.prepare("SELECT * FROM cos_approvals WHERE brief_date = ? ORDER BY day_index").all(briefDate) as Record<string, unknown>[]).map(row);
}

/** Marks every pending item past its expiry as expired. Returns how many. */
export function expireApprovals(db: Database.Database, now = new Date()): number {
  return db.prepare("UPDATE cos_approvals SET status='expired', decided_at=? WHERE status='pending' AND expires_at < ?")
    .run(now.toISOString(), now.toISOString()).changes;
}

function getPending(db: Database.Database, briefDate: string, n: number, now: Date): Approval {
  expireApprovals(db, now);
  const r = db.prepare("SELECT * FROM cos_approvals WHERE brief_date = ? AND day_index = ?").get(briefDate, n) as Record<string, unknown> | undefined;
  if (!r) throw new Error(`No item ${n} in the ${briefDate} brief.`);
  const a = row(r);
  if (a.status !== "pending") throw new Error(`Item ${n} is ${a.status}; nothing done.`);
  return a;
}

function finish(db: Database.Database, id: number, status: ApprovalStatus, result: string, now: Date): void {
  db.prepare("UPDATE cos_approvals SET status=?, decided_at=?, result=? WHERE id=?").run(status, now.toISOString(), result, id);
}

export async function approve(db: Database.Database, ex: Executors, briefDate: string, n: number, now = new Date()): Promise<string> {
  const a = getPending(db, briefDate, n, now);
  if (a.kind === "reply") throw new Error(`Item ${n} is a reply draft: use "send ${n}" to send it or "skip ${n}".`);
  if (a.kind === "task") {
    const id = await ex.createTask(a.title, `${a.detail}\n[${a.source_ref}]`);
    finish(db, a.id, "approved", `task:${id}`, now);
    return `Task created: ${a.title}`;
  }
  finish(db, a.id, "approved", "decision recorded", now);
  return `Recorded: ${a.title}`;
}

/** Shows the exact recipients and body, then sends only that draft. */
export async function send(db: Database.Database, ex: Executors, briefDate: string, n: number, now = new Date(),
  print: (s: string) => void = console.log): Promise<string> {
  const a = getPending(db, briefDate, n, now);
  if (a.kind !== "reply") throw new Error(`Item ${n} is not an email draft; use approve ${n} or skip ${n}.`);
  const draftId = String(a.payload.draft_id ?? "");
  const expectTo = String(a.payload.to ?? "").toLowerCase();
  if (!draftId) throw new Error(`Item ${n} has no draft id; nothing sent.`);
  const d = await ex.readDraft(draftId);
  print(`To: ${d.to}\nSubject: ${d.subject}\n\n${d.body}\n`);
  if (!expectTo || !d.to.toLowerCase().includes(expectTo)) {
    finish(db, a.id, "failed", `recipient changed: expected ${expectTo}, draft has ${d.to}`, now);
    throw new Error(`Refused: the draft's recipient (${d.to}) is not the original sender (${expectTo}).`);
  }
  if (PLACEHOLDER.test(d.body) || PLACEHOLDER.test(d.subject)) {
    throw new Error(`Refused: the draft still contains placeholder text (${(d.body.match(PLACEHOLDER) ?? d.subject.match(PLACEHOLDER))?.[0]}). Edit it in Gmail, then run send ${n} again.`);
  }
  const sentId = await ex.sendDraft(draftId);
  const flat = (x: string) => x.replace(/\s+/g, " ").trim();
  const edited = typeof a.payload.draft_body === "string" && flat(String(a.payload.draft_body)) !== flat(d.body);
  finish(db, a.id, "sent", `gmail:${sentId}${edited ? ";edited" : ""}`, now);
  return `Sent to ${d.to} (message ${sentId}).`;
}

/** Records an item as already done outside the system (no side effect). evidence: gmail:<sent id> or "by you". */
export function markDone(db: Database.Database, briefDate: string, n: number, evidence: string, now = new Date()): string {
  const a = getPending(db, briefDate, n, now);
  finish(db, a.id, "approved", `done:${evidence}`, now);
  return `Done: ${a.title}`;
}

export function skip(db: Database.Database, briefDate: string, n: number, now = new Date()): string {
  const a = getPending(db, briefDate, n, now);
  finish(db, a.id, "skipped", "skipped by principal", now);
  return `Skipped: ${a.title}`;
}
