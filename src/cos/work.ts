/**
 * Work the /cos agent hands out (D30, AC-37). One row per task given to a sub-agent,
 * grouped by the goal it serves. The board shows open work and today's finished work.
 */
import type Database from "better-sqlite3";

export type WorkStatus = "queued" | "running" | "review" | "done" | "failed" | "cancelled";
export const WORK_STATUSES: WorkStatus[] = ["queued", "running", "review", "done", "failed", "cancelled"];
export interface Work { id: number; goal: string; title: string; agent: string; status: WorkStatus; result: string | null; created_at: string; updated_at: string }

export function addWork(db: Database.Database, goal: string, title: string, agent = "cos"): Work {
  if (!goal.trim() || !title.trim()) throw new Error("work needs a goal and a task title");
  const id = db.prepare("INSERT INTO cos_work (goal, title, agent) VALUES (?, ?, ?)").run(goal.trim(), title.trim(), agent.trim() || "cos").lastInsertRowid;
  return getWork(db, Number(id))!;
}

export function getWork(db: Database.Database, id: number): Work | undefined {
  return db.prepare("SELECT * FROM cos_work WHERE id=?").get(id) as Work | undefined;
}

export function updateWork(db: Database.Database, id: number, status: WorkStatus, result?: string): Work {
  if (!WORK_STATUSES.includes(status)) throw new Error(`status must be one of ${WORK_STATUSES.join(", ")}`);
  const w = getWork(db, id);
  if (!w) throw new Error(`No work item ${id}.`);
  if (["done", "failed", "cancelled"].includes(status) && !(result ?? "").trim()) throw new Error(`Closing work ${id} as ${status} needs a result (what happened, or where the output is).`);
  db.prepare("UPDATE cos_work SET status=?, result=COALESCE(?, result), updated_at=datetime('now') WHERE id=?").run(status, result?.trim() || null, id);
  return getWork(db, id)!;
}

/** Open work (anything not closed) plus work closed since `sinceIso`. */
export function listWork(db: Database.Database, sinceIso?: string): Work[] {
  const since = sinceIso ? new Date(sinceIso).toISOString().replace("T", " ").slice(0, 19) : "9999";
  return db.prepare(`SELECT * FROM cos_work WHERE status IN ('queued','running','review') OR julianday(updated_at) >= julianday(?) ORDER BY
    CASE status WHEN 'review' THEN 0 WHEN 'running' THEN 1 WHEN 'queued' THEN 2 ELSE 3 END, id`).all(since) as Work[];
}
