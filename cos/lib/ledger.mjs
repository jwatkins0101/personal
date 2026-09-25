// @ts-check
/**
 * Lane run ledger (ai-chief-of-staff AC-07..AC-10). Plain Node, no dependencies, so the
 * launchd lane wrapper can call it without the repo's node_modules.
 *
 * One JSONL file per lane: <ledgerDir>/<lane>.jsonl, one run record per line.
 */
import { appendFileSync, existsSync, mkdirSync, readFileSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

export const DEFAULT_LEDGER_DIR =
  process.env.COS_LEDGER_DIR ?? join(homedir(), "Library/Application Support/assistance/ledger");

const STATUSES = ["ok", "partial", "failed"];
const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/;

/**
 * Returns a list of schema problems (empty = valid).
 * @param {any} r
 * @returns {string[]}
 */
export function validateRecord(r) {
  const p = [];
  if (!r || typeof r !== "object" || Array.isArray(r)) return ["record is not an object"];
  if (typeof r.lane !== "string" || !/^[a-z][a-z0-9-]*$/.test(r.lane)) p.push("lane must be a kebab-case string");
  if (typeof r.run_id !== "string" || !r.run_id) p.push("run_id missing");
  if (!STATUSES.includes(r.status)) p.push(`status must be one of ${STATUSES.join("|")}`);
  for (const k of ["started_at", "finished_at"]) if (typeof r[k] !== "string" || !ISO.test(r[k])) p.push(`${k} must be ISO-8601`);
  if (r.items_in !== null && !(Number.isInteger(r.items_in) && r.items_in >= 0)) p.push("items_in must be a non-negative integer or null");
  if (r.items_out !== null) {
    if (!r.items_out || typeof r.items_out !== "object" || Array.isArray(r.items_out)) p.push("items_out must be an object or null");
    else for (const [k, v] of Object.entries(r.items_out)) if (!(Number.isInteger(v) && v >= 0)) p.push(`items_out.${k} must be a non-negative integer`);
  }
  if ((r.items_in === null) !== (r.items_out === null)) p.push("items_in and items_out must both be set or both be null");
  for (const k of ["artifacts", "findings", "proposed_actions", "open_questions", "gaps"]) if (!Array.isArray(r[k])) p.push(`${k} must be an array`);
  if (Array.isArray(r.artifacts) && r.artifacts.some((a) => typeof a !== "string" || !a.startsWith("/"))) p.push("artifacts must be absolute paths");
  if (Array.isArray(r.findings) && r.findings.some((f) => !f || typeof f.claim !== "string" || typeof f.source_ref !== "string")) p.push("each finding needs claim + source_ref");
  if (Array.isArray(r.proposed_actions) && r.proposed_actions.some((a) => !a || typeof a.id !== "string" || typeof a.action !== "string" || !["A1", "A2", "A3"].includes(a.risk_tier) || typeof a.source_ref !== "string"))
    p.push("each proposed_action needs id, action, risk_tier A1|A2|A3, source_ref");
  if (r.cost_usd !== null && !(typeof r.cost_usd === "number" && r.cost_usd >= 0)) p.push("cost_usd must be a non-negative number or null");
  return p;
}

/**
 * Applies the invariants a lane cannot waive: reconciliation (AC-08) and claimed artifacts (AC-09).
 * A violation downgrades the run to failed and records the gap. Returns a new record.
 * @param {any} r
 */
export function enforceInvariants(r) {
  const out = { ...r, gaps: [...(r.gaps ?? [])] };
  if (out.items_in !== null && out.items_out) {
    const sum = Object.values(out.items_out).reduce((a, b) => a + Number(b), 0);
    if (sum !== out.items_in) {
      out.status = "failed";
      out.gaps.push(`reconciliation: in=${out.items_in} out=${sum}`);
    }
  }
  for (const path of out.artifacts ?? []) {
    let ok = false;
    try { ok = existsSync(path) && statSync(path).isFile() && statSync(path).size > 0; } catch { ok = false; }
    if (!ok) {
      out.status = "failed";
      out.gaps.push(`missing_artifact: ${path}`);
    }
  }
  return out;
}

/**
 * Validates, enforces invariants and appends. Invalid records are still logged, as failed/invalid_record,
 * so a broken lane is visible rather than silent.
 * @param {any} r
 * @param {string} [dir]
 */
export function appendRecord(r, dir = DEFAULT_LEDGER_DIR) {
  const problems = validateRecord(r);
  let rec;
  if (problems.length) {
    const now = new Date().toISOString();
    rec = {
      lane: typeof r?.lane === "string" && /^[a-z][a-z0-9-]*$/.test(r.lane) ? r.lane : "unknown",
      run_id: typeof r?.run_id === "string" && r.run_id ? r.run_id : `invalid-${Date.now()}`,
      status: "failed",
      started_at: typeof r?.started_at === "string" && ISO.test(r.started_at) ? r.started_at : now,
      finished_at: now,
      items_in: null, items_out: null, artifacts: [], findings: [], proposed_actions: [], open_questions: [],
      gaps: [`invalid_record: ${problems.join("; ")}`], cost_usd: null,
    };
  } else {
    rec = enforceInvariants(r);
  }
  mkdirSync(dir, { recursive: true });
  appendFileSync(join(dir, `${rec.lane}.jsonl`), JSON.stringify(rec) + "\n");
  return rec;
}

/**
 * @param {string} lane
 * @param {string} [dir]
 * @returns {any[]}
 */
export function readRecords(lane, dir = DEFAULT_LEDGER_DIR) {
  const f = join(dir, `${lane}.jsonl`);
  if (!existsSync(f)) return [];
  return readFileSync(f, "utf8").split("\n").filter(Boolean).flatMap((l) => {
    try { return [JSON.parse(l)]; } catch { return []; }
  });
}

/**
 * Most recent scheduled time at or before `now` for a lane schedule.
 * schedule: { days: [1..7] (ISO weekday, 1=Mon), times: ["HH:MM", ...] } in local time.
 * @param {{days:number[], times:string[]}} schedule
 * @param {Date} now
 * @returns {Date|null}
 */
export function lastScheduledAt(schedule, now) {
  for (let back = 0; back <= 8; back++) {
    const day = new Date(now.getFullYear(), now.getMonth(), now.getDate() - back);
    const iso = ((day.getDay() + 6) % 7) + 1;
    if (!schedule.days.includes(iso)) continue;
    const times = [...schedule.times].sort().reverse();
    for (const t of times) {
      const [h, m] = t.split(":").map(Number);
      const at = new Date(day.getFullYear(), day.getMonth(), day.getDate(), h, m);
      if (at <= now) return at;
    }
  }
  return null;
}

/**
 * Heartbeat (AC-10). A lane is stale when its latest record started before the most recent
 * scheduled time that is already past its grace period; failing when its latest record failed.
 * @param {{lanes: {lane:string, schedule:{days:number[], times:string[]}, grace_minutes:number}[]}} config
 * @param {Date} [now]
 * @param {string} [dir]
 */
export function laneHealth(config, now = new Date(), dir = DEFAULT_LEDGER_DIR) {
  return config.lanes.map((l) => {
    const recs = readRecords(l.lane, dir);
    const last = recs.at(-1) ?? null;
    const due = lastScheduledAt(l.schedule, new Date(now.getTime() - l.grace_minutes * 60_000));
    let state = "ok";
    if (due && (!last || new Date(last.started_at) < due)) state = "stale";
    else if (last && last.status === "failed") state = "failing";
    else if (last && last.status === "partial") state = "partial";
    return { lane: l.lane, state, last_started_at: last?.started_at ?? null, last_status: last?.status ?? null, expected_since: due?.toISOString() ?? null, gaps: last?.gaps ?? [] };
  });
}
