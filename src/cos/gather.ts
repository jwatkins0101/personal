/**
 * Collects the morning brief's inputs. Every source is wrapped: a failure becomes a gap
 * (shown under Escalations), never a crash and never a silent omission.
 */
import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { laneHealth, readRecords, type LaneConfig, type LaneHealth, type RunRecord } from "../../cos/lib/ledger.mjs";
import { listMessageIds, getMessagesMeta } from "../mail/gmail-api.js";
import { listOpenGtdTasks } from "../tasks/google-tasks.js";
import { getCachedEvents } from "../calendar/cache.js";
import { localDate } from "./approvals.js";

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const CODE = join(homedir(), "Code");

export interface BriefInputs {
  date: string;
  generated_at: string;
  inbox: { id: string; from: string; subject: string; snippet: string; date: string; starred: boolean }[];
  tasks: { id: string; title: string; due?: string; list?: string; notes?: string }[];
  calendar: { day: "today" | "tomorrow"; title: string; start: string; end: string; location?: string; all_day: boolean; ref: string }[];
  lanes: LaneHealth[];
  lane_gaps: { lane: string; started_at: string; status: string; gaps: string[] }[];
  fyi_sources: { yt_brief?: string; deals_brief?: string };
  gaps: string[];
}

async function attempt<T>(label: string, gaps: string[], f: () => Promise<T>, fallback: T): Promise<T> {
  try { return await f(); } catch (e) { gaps.push(`${label} unavailable: ${(e as Error).message.slice(0, 160)}`); return fallback; }
}

export async function gatherInputs(now = new Date()): Promise<BriefInputs> {
  const gaps: string[] = [];
  const date = localDate(now);

  // Inbox: what triage left in the inbox over the last 3 days (triage archives the rest).
  const inbox = await attempt("Gmail inbox", gaps, async () => {
    const ids = await listMessageIds("in:inbox newer_than:3d", 40);
    const metas = await getMessagesMeta(ids);
    return metas.filter((m) => !m.listUnsub).map((m) => ({
      id: m.id, from: m.from, subject: m.subject, snippet: m.snippet, date: m.date, starred: m.labelIds.includes("STARRED"),
    }));
  }, []);

  const tasks = await attempt("Google Tasks", gaps, async () =>
    (await listOpenGtdTasks()).map((t) => ({ id: t.id, title: t.title, due: t.due, list: t.list, notes: (t.notes ?? "").slice(0, 200) })), []);

  const calendar = await attempt("Apple Calendar", gaps, async () => {
    const today = localDate(now);
    return getCachedEvents(2, now).map((e) => ({
      day: (e.start.slice(0, 10) === today ? "today" : "tomorrow") as "today" | "tomorrow",
      title: `${e.title}${e.calendar ? ` (${e.calendar})` : ""}`, start: e.start, end: e.end,
      location: e.location || undefined, all_day: e.all_day, ref: `cal:${e.title}@${e.start}`,
    }));
  }, []);

  const config = JSON.parse(readFileSync(process.env.COS_LANES_PATH ?? resolve(REPO_ROOT, "cos/lanes.json"), "utf8")) as { lanes: LaneConfig[] };
  const lanesToWatch = { lanes: config.lanes.filter((l) => !l.lane.startsWith("cos-")) };
  const lanes = laneHealth(lanesToWatch, now);
  const since = new Date(now.getTime() - 24 * 3600_000).toISOString();
  const lane_gaps = lanesToWatch.lanes.flatMap((l) =>
    readRecords(l.lane).filter((r: RunRecord) => r.started_at >= since && (r.status !== "ok" || r.gaps.length))
      .map((r: RunRecord) => ({ lane: r.lane, started_at: r.started_at, status: r.status, gaps: r.gaps })));

  const fyi_sources: BriefInputs["fyi_sources"] = {};
  const yt = join(CODE, "youtube-knowledge/briefs", `${date}.md`);
  if (existsSync(yt)) fyi_sources.yt_brief = readFileSync(yt, "utf8").slice(0, 2500);
  const deals = join(CODE, "deal-watch/briefs", `brief-${date}.html`);
  if (existsSync(deals)) fyi_sources.deals_brief = readFileSync(deals, "utf8").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").slice(0, 2000);

  return { date, generated_at: now.toISOString(), inbox, tasks, calendar, lanes, lane_gaps, fyi_sources, gaps };
}
