/**
 * Reads upcoming events from Calendar.app's local cache (all calendars, recurring occurrences
 * pre-expanded) through /usr/bin/sqlite3, which holds Full Disk Access. Sub-second, versus the
 * AppleScript path that times out on large iCloud calendars. Throws on failure; callers surface it.
 */
import { spawnSync } from "node:child_process";
import { homedir } from "node:os";
import { join } from "node:path";

export const CALENDAR_DB = process.env.COS_CALENDAR_DB ?? join(homedir(), "Library/Group Containers/group.com.apple.calendar/Calendar.sqlitedb");
const APPLE_EPOCH = 978307200; // 2001-01-01 in Unix seconds

export interface CachedEvent { calendar: string; title: string; start: string; end: string; all_day: boolean; location: string }

/** Events for `days` days starting at local midnight of today + startOffset (e.g. -1 = from yesterday). */
export function getCachedEvents(days = 2, now = new Date(), startOffset = 0): CachedEvent[] {
  const midnight = new Date(now.getFullYear(), now.getMonth(), now.getDate() + startOffset).getTime() / 1000 - APPLE_EPOCH;
  const until = midnight + days * 86400;
  const sql = `SELECT c.title AS calendar, ci.summary AS title,
      datetime(COALESCE(oc.occurrence_start_date, oc.occurrence_date) + ${APPLE_EPOCH}, 'unixepoch', 'localtime') AS start,
      datetime(COALESCE(oc.occurrence_end_date, oc.occurrence_date) + ${APPLE_EPOCH}, 'unixepoch', 'localtime') AS end,
      ci.all_day AS all_day, COALESCE(l.title, '') AS location
    FROM OccurrenceCache oc
    JOIN CalendarItem ci ON ci.ROWID = oc.event_id
    JOIN Calendar c ON c.ROWID = oc.calendar_id
    LEFT JOIN Location l ON l.ROWID = ci.location_id
    WHERE COALESCE(oc.occurrence_start_date, oc.occurrence_date) >= ${midnight}
      AND COALESCE(oc.occurrence_start_date, oc.occurrence_date) < ${until}
      AND ci.entity_type = 2 AND COALESCE(ci.hidden, 0) = 0
    ORDER BY start`;
  const r = spawnSync("/usr/bin/sqlite3", ["-readonly", "-json", CALENDAR_DB, sql], { encoding: "utf8", timeout: 20_000 });
  if (r.error) throw new Error(`calendar cache: ${r.error.message}`);
  if (r.status !== 0) throw new Error(`calendar cache: ${(r.stderr || `exit ${r.status}`).trim().slice(0, 200)}`);
  const rows = (r.stdout.trim() ? JSON.parse(r.stdout) : []) as { calendar: string; title: string; start: string; end: string; all_day: number; location: string }[];
  const seen = new Set<string>();
  const out: CachedEvent[] = [];
  for (const e of rows) {
    const key = `${e.title}|${e.start}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ calendar: e.calendar, title: (e.title ?? "").trim() || "Untitled", start: e.start, end: e.end, all_day: e.all_day === 1, location: e.location });
  }
  return out;
}
