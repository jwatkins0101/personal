/**
 * Deterministic due-date resolution for commitments (AC-18). The model only quotes the words;
 * this code decides whether they name a specific day. Anything vague ("soon", "next week",
 * "next next week", "early next week") resolves to null, and the caller records an open question.
 * Relative words are anchored to the SOURCE message's date, never to today.
 */
const WEEKDAYS = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
const MONTHS = ["january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december"];

export interface DueResolution { due_at: string | null; reason: string }

const ymd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const addDays = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);

/** Picks the year that puts month/day on or after the source date (a date just before it rolls to next year only if >60 days back). */
function withYear(month: number, day: number, source: Date): Date {
  let d = new Date(source.getFullYear(), month, day);
  if (d.getTime() < addDays(source, -60).getTime()) d = new Date(source.getFullYear() + 1, month, day);
  return d;
}

export function resolveDue(quote: string | null | undefined, sourceDate: Date): DueResolution {
  if (!quote || !quote.trim()) return { due_at: null, reason: "no date given" };
  const q = quote.toLowerCase().replace(/[.,!]/g, " ").replace(/\s+/g, " ").trim();
  const src = new Date(sourceDate.getFullYear(), sourceDate.getMonth(), sourceDate.getDate());

  // Vague or ambiguous: never resolved.
  if (/\bnext next\b|\bsoon\b|\blater\b|\bsometime\b|\bshortly\b|\bin a (few|couple)\b|\bnext week\b|\bthis week\b|\bearly\b|\bmid\b|\bend of (the )?(week|month)\b|\basap\b|\bwhen i can\b/.test(q)) {
    return { due_at: null, reason: `vague: "${quote}"` };
  }
  // "next friday" is ambiguous (this coming one or the one after), so it is vague too.
  if (/\bnext (sun|mon|tues|wednes|thurs|fri|satur)day\b/.test(q)) return { due_at: null, reason: `ambiguous: "${quote}"` };

  // ISO date.
  let m = q.match(/\b(20\d\d)-(\d{1,2})-(\d{1,2})\b/);
  if (m) return { due_at: ymd(new Date(+m[1], +m[2] - 1, +m[3])), reason: "explicit date" };
  // Numeric month/day(/year).
  m = q.match(/\b(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?\b/);
  if (m) {
    const mo = +m[1] - 1, da = +m[2];
    if (mo >= 0 && mo < 12 && da >= 1 && da <= 31) {
      const d = m[3] ? new Date(m[3].length === 2 ? 2000 + +m[3] : +m[3], mo, da) : withYear(mo, da, src);
      return { due_at: ymd(d), reason: "explicit date" };
    }
  }
  // Month name + day ("oct 2", "october 2nd").
  m = q.match(/\b(jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\.? (\d{1,2})(?:st|nd|rd|th)?\b/);
  if (m) {
    const mo = MONTHS.findIndex((x) => x.startsWith(m![1].slice(0, 3)));
    return { due_at: ymd(withYear(mo, +m[2], src)), reason: "explicit date" };
  }
  if (/\b(today|tonight|end of day|eod|by close of business|cob)\b/.test(q)) return { due_at: ymd(src), reason: "same day as source" };
  if (/\btomorrow\b/.test(q)) return { due_at: ymd(addDays(src, 1)), reason: "day after source" };
  // Bare or "this" weekday: the next occurrence on or after the source date.
  m = q.match(/\b(?:by |on |this )?(sun|mon|tues|wednes|thurs|fri|satur)day\b/);
  if (m) {
    const target = WEEKDAYS.findIndex((w) => w.startsWith(m![1]));
    const delta = (target - src.getDay() + 7) % 7;
    return { due_at: ymd(addDays(src, delta)), reason: "weekday after source" };
  }
  return { due_at: null, reason: `no specific day in "${quote}"` };
}
