/**
 * Task capture + GTD routing for Google Tasks.
 *
 * Sources: genuine email action items (from the Gmail inbox) and time-sensitive deadlines.
 * GTD rule: new captures land in 📥 Inbox by default; items with a detectable due date get
 * dated and routed to 🔥 Today (due today/overdue) or ⏭ Next (future). Dedupe is by a
 * `[gmid:<id>]` marker embedded in the task notes, so re-runs never create duplicates.
 */
import {
  ensureGtdLists,
  insertTask,
  listTasks,
  GTD_LISTS,
  type GtdKey,
  type GoogleTask,
} from "./google-tasks.js";
import { listMessageIds, getMessagesMeta, type GmailMeta } from "../mail/gmail-api.js";

const GMID_RE = /\[gmid:([^\]]+)\]/;

/** Gmail web deep-link to a message (opens it in All Mail). */
function gmailLink(id: string): string {
  return `https://mail.google.com/mail/u/0/#all/${id}`;
}

function domainOf(from: string): string {
  const at = from.lastIndexOf("@");
  return at === -1 ? "" : from.slice(at + 1).replace(/[>\s].*/, "").toLowerCase();
}

const USER_EMAIL = "jermainewatkins@gmail.com";

/**
 * High-precision: is this a genuine personal action item?
 * Hard-deadline / direct-ask language always qualifies (even from a billing no-reply).
 * Otherwise it must be addressed to the user directly, from a named human, and not
 * bulk/marketing/automated/digest/calendar-invite noise.
 */
function isActionable(m: GmailMeta): boolean {
  const from = m.from.toLowerCase();
  const s = m.subject.toLowerCase();

  if (from.includes(USER_EMAIL)) return false; // self-sent

  // calendar invites / responses / auto-updated events / auto-replies
  if (/^(re:\s*)?(invitation|accepted|declined|tentative|updated invitation|canceled|cancelled|new event|automatic reply|auto-reply|out of office)\b/.test(s)) return false;
  if (s.includes("video conference") || s.includes("has been updated")) return false;

  // bulk / marketing / list mail — checked BEFORE deadline keywords, because spam baits with
  // "expiring"/"overdue"/"action required". Transactional billing has no List-Unsubscribe, so it survives.
  if (m.listUnsub) return false;
  if (m.labelIds.includes("CATEGORY_PROMOTIONS") || m.labelIds.includes("CATEGORY_SOCIAL") || m.labelIds.includes("CATEGORY_FORUMS")) return false;
  if (/\b(newsletter|news|info|updates|alerts|marketing|digest)@/.test(from)) return false;
  if (/(digest|daily notifications|weekly newsletter|roundup|% off|sale ends|your promo)/.test(s)) return false;

  // deadline / direct request — keep (now only transactional/personal deadlines remain)
  const hardAction = /(action required|past due|payment failed|unable to process|payment for your|overdue|final notice|please (reply|respond|confirm|review|complete|sign|approve)|rsvp|due (by|date|on|:)|deadline|verify your|expir(es|ation) (soon|on|reminder)|domain expir)/.test(s);
  if (hardAction) return true;

  // automated/no-reply (non-transactional) → reject
  if (/(no-?reply|do-?not-?reply|donotreply|notification|notify|mailer|bounce)/.test(from)) return false;

  // must be addressed to the user directly (filters list/blast mail) and from a named human
  if (!m.to.toLowerCase().includes(USER_EMAIL)) return false;
  const name = m.from.replace(/<.*/, "").replace(/"/g, "").trim();
  const hasHumanName = /[a-z]+[\s,]+[a-z]+/i.test(name) && !name.includes("@");
  return hasHumanName;
}

/** Detect a due date (YYYY-MM-DD) from the SUBJECT only, and only with explicit deadline wording. */
function detectDue(m: GmailMeta, today: Date): string | undefined {
  const s = m.subject.toLowerCase();
  if (!/(expire|expiration|due|deadline|renew|rsvp|by\s)/.test(s)) return undefined;
  const mon = m.subject.match(/\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s+(\d{1,2})\b/i);
  if (!mon) return undefined;
  const months = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
  const mi = months.indexOf(mon[1].slice(0, 3).toLowerCase());
  const day = parseInt(mon[2], 10);
  if (mi < 0 || day < 1 || day > 31) return undefined;
  let year = today.getFullYear();
  if (mi < today.getMonth()) year += 1; // month already passed → next year
  return `${year}-${String(mi + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function routeKey(due: string | undefined, todayISO: string): GtdKey {
  if (!due) return "inbox";
  if (due <= todayISO) return "today";
  return "next";
}

export interface CaptureResult {
  scanned: number;
  actionable: number;
  created: number;
  skipped: number;
  byList: Partial<Record<GtdKey, number>>;
}

/**
 * Capture genuine action items from recent unread inbox into the GTD lists.
 * @param days how far back to scan (default 21)
 */
export async function captureFromInbox(days = 21): Promise<CaptureResult> {
  const listIds = await ensureGtdLists();

  // Build the set of already-captured Gmail ids (dedupe) from existing open tasks.
  const seen = new Set<string>();
  for (const key of Object.keys(GTD_LISTS) as GtdKey[]) {
    for (const t of await listTasks(listIds[key], true)) {
      const mtch = (t.notes || "").match(GMID_RE);
      if (mtch) seen.add(mtch[1]);
    }
  }

  const ids = await listMessageIds(`in:inbox is:unread newer_than:${days}d`);
  const metas = await getMessagesMeta(ids);
  const today = new Date();
  const todayISO = today.toISOString().slice(0, 10);

  const result: CaptureResult = { scanned: metas.length, actionable: 0, created: 0, skipped: 0, byList: {} };

  for (const m of metas) {
    if (!isActionable(m)) continue;
    result.actionable++;
    if (seen.has(m.id)) {
      result.skipped++;
      continue;
    }
    const who = m.from.replace(/<.*/, "").replace(/"/g, "").trim() || m.from || domainOf(m.from);
    const due = detectDue(m, today);
    const key = routeKey(due, todayISO);
    const notes = `From: ${who}\n${gmailLink(m.id)}\n[gmid:${m.id}]`;
    await insertTask(listIds[key], { title: m.subject || "(no subject)", notes, due });
    result.created++;
    result.byList[key] = (result.byList[key] || 0) + 1;
    seen.add(m.id);
  }
  return result;
}

/** A task to capture, with a stable dedupe marker like "[smsid:123]" or "[gmid:abc]". */
export interface TaskSpec {
  marker: string;
  title: string;
  notes: string;
  due?: string;
}

const ANY_MARKER_RE = /\[[a-z]+:[^\]]+\]/g;

/**
 * Create tasks from arbitrary sources (email, SMS, …) with cross-source dedupe.
 * Each spec carries a `marker`; if that marker already appears in any existing task's notes,
 * it's skipped. The marker is appended to the task notes on creation.
 */
export async function captureTaskSpecs(specs: TaskSpec[]): Promise<CaptureResult> {
  const listIds = await ensureGtdLists();

  const seen = new Set<string>();
  for (const key of Object.keys(GTD_LISTS) as GtdKey[]) {
    for (const t of await listTasks(listIds[key], true)) {
      for (const mk of (t.notes || "").match(ANY_MARKER_RE) || []) seen.add(mk);
    }
  }

  const todayISO = new Date().toISOString().slice(0, 10);
  const result: CaptureResult = { scanned: specs.length, actionable: specs.length, created: 0, skipped: 0, byList: {} };

  for (const spec of specs) {
    if (seen.has(spec.marker)) {
      result.skipped++;
      continue;
    }
    const key = routeKey(spec.due, todayISO);
    await insertTask(listIds[key], { title: spec.title, notes: `${spec.notes}\n${spec.marker}`, due: spec.due });
    result.created++;
    result.byList[key] = (result.byList[key] || 0) + 1;
    seen.add(spec.marker);
  }
  return result;
}

/** Group open GTD tasks by list, for the briefing / board view. */
export function groupByList(tasks: GoogleTask[]): Record<string, GoogleTask[]> {
  const out: Record<string, GoogleTask[]> = {};
  for (const t of tasks) {
    const k = t.list || "(unknown)";
    (out[k] ||= []).push(t);
  }
  return out;
}
