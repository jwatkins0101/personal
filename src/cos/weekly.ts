/**
 * `npm run cos -- weekly` (Fri 15:00): the scorecard (AC-22). Deterministic: computed from the
 * database and lane ledgers, no model call. Lists autonomy-promotion candidates but never changes
 * autonomy; promotion is the principal's decision, recorded in DECISIONS.md.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import type Database from "better-sqlite3";
import { readRecords, type LaneConfig } from "../../cos/lib/ledger.mjs";
import { localDate } from "./approvals.js";
import { overdue, listCommitments } from "./commitments.js";

export const WEEKLY_DIR = process.env.COS_WEEKLY_DIR ?? join(homedir(), "Library/Application Support/assistance/weekly");
export const PROMOTION_MIN_CLEAN = 20;

export interface Scorecard {
  week: string; from: string; to: string; generated_at: string;
  dropped_balls: { count: number; items: string[] };
  caught_errors: { count: number; approvals_failed: number; corrections: number; refused_sends: number };
  approvals: { created: number; per_day: number; decided: number; unchanged_rate: number | null; by_status: Record<string, number> };
  decision_latency_hours: { median: number | null; count: number };
  cost_usd: number;
  lanes: { lane: string; runs: number; failed: number }[];
  commitments: { open: number; closed_this_week: number; undated: number };
  promotion_candidates: string[];
}

/** ISO week label, e.g. 2026-W39. */
export function isoWeek(d: Date): string {
  const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const day = t.getUTCDay() || 7;
  t.setUTCDate(t.getUTCDate() + 4 - day);
  const y = t.getUTCFullYear();
  const w = Math.ceil(((t.getTime() - Date.UTC(y, 0, 1)) / 86400000 + 1) / 7);
  return `${y}-W${String(w).padStart(2, "0")}`;
}

const median = (xs: number[]) => { if (!xs.length) return null; const s = [...xs].sort((a, b) => a - b); const m = Math.floor(s.length / 2); return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };

export function buildScorecard(db: Database.Database, lanes: LaneConfig[], now = new Date(), ledgerDir?: string): Scorecard {
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 6);
  const from = localDate(start), to = localDate(now);
  type A = { kind: string; status: string; created_at: string; decided_at: string | null; result: string | null; brief_date: string };
  const approvals = db.prepare("SELECT kind, status, created_at, decided_at, result, brief_date FROM cos_approvals WHERE brief_date BETWEEN ? AND ?").all(from, to) as A[];
  const by_status: Record<string, number> = {};
  for (const a of approvals) by_status[a.status] = (by_status[a.status] ?? 0) + 1;
  const decided = approvals.filter((a) => ["approved", "sent", "skipped"].includes(a.status));
  const unchanged = approvals.filter((a) => a.status === "approved" || (a.status === "sent" && !(a.result ?? "").includes(";edited")));
  const acted = approvals.filter((a) => a.status === "approved" || a.status === "sent");
  const latencies = decided.filter((a) => a.decided_at).map((a) => (new Date(a.decided_at!).getTime() - new Date(a.created_at.replace(" ", "T") + "Z").getTime()) / 3600_000);
  const corrections = (db.prepare("SELECT COUNT(*) n FROM feedback WHERE created_at >= ?").get(from) as { n: number }).n;
  const failed = by_status["failed"] ?? 0;
  const refused = approvals.filter((a) => a.status === "failed" && /recipient changed/.test(a.result ?? "")).length;

  let cost = 0;
  const laneRows = lanes.map((l) => {
    const recs = readRecords(l.lane, ledgerDir).filter((r) => r.started_at >= start.toISOString());
    for (const r of recs) cost += r.cost_usd ?? 0;
    return { lane: l.lane, runs: recs.length, failed: recs.filter((r) => r.status === "failed").length };
  });

  const drops = overdue(db, to);
  const allCommitments = listCommitments(db);
  // Promotion: an action kind with >= 20 clean (approved/sent unedited) and zero failed or edited in the last 30 days.
  const monthFrom = localDate(new Date(now.getFullYear(), now.getMonth(), now.getDate() - 29));
  const month = db.prepare("SELECT kind, status, result FROM cos_approvals WHERE brief_date BETWEEN ? AND ?").all(monthFrom, to) as A[];
  const candidates: string[] = [];
  for (const kind of ["reply", "decide", "task"]) {
    const ks = month.filter((a) => a.kind === kind);
    const clean = ks.filter((a) => a.status === "approved" || (a.status === "sent" && !(a.result ?? "").includes(";edited"))).length;
    const bad = ks.filter((a) => a.status === "failed" || (a.result ?? "").includes(";edited")).length;
    if (clean >= PROMOTION_MIN_CLEAN && bad === 0) candidates.push(`${kind}: ${clean} approved unchanged in 30 days, 0 corrections. Candidate to move up one autonomy level (your decision).`);
  }

  return {
    week: isoWeek(now), from, to, generated_at: now.toISOString(),
    dropped_balls: { count: drops.length, items: drops.map((c) => `#${c.id} ${c.owner === "me" ? "you owe" : `${c.counterparty} owes you`}: ${c.what} (due ${c.due_at})`) },
    caught_errors: { count: failed + corrections, approvals_failed: failed, corrections, refused_sends: refused },
    approvals: { created: approvals.length, per_day: Math.round((approvals.length / 5) * 10) / 10, decided: decided.length, unchanged_rate: acted.length ? Math.round((unchanged.length / acted.length) * 100) / 100 : null, by_status },
    decision_latency_hours: { median: latencies.length ? Math.round(median(latencies)! * 10) / 10 : null, count: latencies.length },
    cost_usd: Math.round(cost * 100) / 100,
    lanes: laneRows,
    commitments: { open: allCommitments.filter((c) => c.status === "open").length, closed_this_week: allCommitments.filter((c) => c.status === "closed" && c.updated_at >= from).length, undated: allCommitments.filter((c) => c.status === "open" && !c.due_at).length },
    promotion_candidates: candidates,
  };
}

export function scorecardMarkdown(s: Scorecard): string {
  const pct = (x: number | null) => (x === null ? "n/a" : `${Math.round(x * 100)}%`);
  return `# Weekly review: ${s.week} (${s.from} to ${s.to})

## Scorecard

| Metric | This week |
|---|---|
| Dropped balls (open commitments past due) | ${s.dropped_balls.count} |
| Caught errors (failed approvals + your corrections) | ${s.caught_errors.count} |
| Approvals per day | ${s.approvals.per_day} (${s.approvals.created} total) |
| Approved unchanged | ${pct(s.approvals.unchanged_rate)} |
| Decision latency (median hours) | ${s.decision_latency_hours.median ?? "n/a"} |
| Cost | $${s.cost_usd.toFixed(2)} |

## Dropped balls

${s.dropped_balls.items.length ? s.dropped_balls.items.map((x) => `- ${x}`).join("\n") : "None."}

## Commitments

${s.commitments.open} open (${s.commitments.undated} with no date), ${s.commitments.closed_this_week} closed this week.

## Lanes

${s.lanes.map((l) => `- ${l.lane}: ${l.runs} runs, ${l.failed} failed`).join("\n")}

## Autonomy promotion candidates

${s.promotion_candidates.length ? s.promotion_candidates.map((x) => `- ${x}`).join("\n") : "None yet (needs 20 clean approvals of one kind in 30 days)."}

Autonomy never changes automatically. To promote, record the decision in DECISIONS.md.
`;
}

export function writeScorecard(s: Scorecard): { md: string; json: string } {
  mkdirSync(WEEKLY_DIR, { recursive: true });
  const md = join(WEEKLY_DIR, `${s.week}.md`), json = join(WEEKLY_DIR, `${s.week}.json`);
  writeFileSync(md, scorecardMarkdown(s));
  writeFileSync(json, JSON.stringify(s, null, 2));
  return { md, json };
}
