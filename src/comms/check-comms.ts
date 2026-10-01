/**
 * check-comms: a style linter for drafts sent under Jermaine's name (Task #206).
 *   npm run -s check-comms -- [file|-] [--channel email|linkedin|text|client] [--json]
 * Loads the tested tells in docs/research/ai-writing-tells.json (Task #204) and adds cheap heuristics
 * (burstiness, em-dash rate, markdown in short messages, triplet density, specifics, ask, length).
 * It is a reader-trust linter, not an AI detector: findings say "reads as templated", never "AI-written".
 * Output: a 0-100 "sounds human" score, findings with severity, line, excerpt and fix.
 * Exit 1 when any finding is high severity (fix before showing/sending), else 0.
 * COMMS_TELLS_PATH overrides the tells file (gate negative validation).
 */
import { readFileSync } from "node:fs";
import { dirname, isAbsolute, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
export const TELLS_PATH = process.env.COMMS_TELLS_PATH ?? resolve(REPO_ROOT, "docs/research/ai-writing-tells.json");

export type Channel = "email" | "linkedin" | "text" | "client";
export const CHANNELS: Channel[] = ["email", "linkedin", "text", "client"];
export type Severity = "info" | "low" | "med" | "high";
const POINTS: Record<Severity, number> = { info: 0, low: 1, med: 2, high: 3 };
const RAISE: Record<Severity, Severity> = { info: "info", low: "med", med: "high", high: "high" };

export interface Tell { id: string; category: string; pattern: string | null; heuristic: string; severity: Severity; fix: string }
export interface Finding { id: string; category: string; severity: Severity; count: number; line: number; excerpt: string; note: string; fix: string }
export interface Report {
  score: number; verdict: "pass" | "edit" | "rewrite"; channel: Channel; words: number; sentences: number;
  em_dash_per_100: number; burstiness_cv: number | null; specifics: number; relational: boolean; blocked: boolean;
  high: number; findings: Finding[];
}

/** Convert a Python `re` pattern with a leading inline-flag group to a JS RegExp (global). */
export function toJsRegex(pattern: string): RegExp {
  let src = pattern, flags = "g";
  const m = /^\(\?([a-zA-Z]+)\)/.exec(src);
  if (m) {
    src = src.slice(m[0].length);
    for (const f of m[1]) {
      if (f === "i" || f === "m" || f === "s") flags += f;
      else throw new Error(`unsupported inline flag (?${f}) in ${pattern}`);
    }
  }
  if (/\(\?[a-zA-Z]+\)/.test(src) || /\(\?P/.test(src)) throw new Error(`unsupported Python-only syntax in ${pattern}`);
  if (/\\U[0-9A-Fa-f]{8}/.test(src)) {
    src = src.replace(/\\U([0-9A-Fa-f]{8})/g, (_, h: string) => `\\u{${h.replace(/^0+/, "")}}`);
    flags += "u";
  }
  return new RegExp(src, flags);
}

export function loadTells(path = TELLS_PATH): Tell[] {
  return JSON.parse(readFileSync(path, "utf8")) as Tell[];
}

// chan-* rules apply only to their channel (checklist rule 3). chan-09/10 are cover-letter rules: not used here.
const CHANNEL_ONLY: Record<string, Channel[]> = {
  "chan-02": ["email", "client"], "chan-05": ["linkedin"], "chan-06": ["linkedin"],
  "chan-07": ["text"], "chan-08": ["text"], "chan-09": [], "chan-10": [],
};

const wordsOf = (s: string) => (s.match(/[A-Za-z0-9][A-Za-z0-9'’-]*/g) ?? []).length;
const lineAt = (text: string, idx: number) => text.slice(0, idx).split("\n").length;
const excerptAt = (text: string, idx: number, len: number) => {
  const start = text.lastIndexOf("\n", idx) + 1;
  const endNl = text.indexOf("\n", idx + len);
  const lineText = text.slice(start, endNl < 0 ? undefined : endNl);
  if (lineText.trim().length <= 110) return lineText.trim();
  const a = Math.max(0, idx - start - 30), b = Math.min(lineText.length, idx - start + len + 30);
  return `${a > 0 ? "..." : ""}${lineText.slice(a, b).trim()}${b < lineText.length ? "..." : ""}`;
};
const shortFix = (fix: string) => fix.split(/\s+Before:/)[0].trim();
const cv = (xs: number[]) => {
  const mean = xs.reduce((a, b) => a + b, 0) / xs.length;
  if (!mean) return 0;
  return Math.sqrt(xs.reduce((a, b) => a + (b - mean) ** 2, 0) / xs.length) / mean;
};

/** Message body without the greeting line and a short sign-off, for sentence and specifics heuristics. */
function bodyLines(text: string): string[] {
  const lines = text.split("\n");
  let a = 0, b = lines.length;
  while (a < b && !lines[a].trim()) a++;
  if (a < b && /^\s*(hi|hey|hello|dear|good (morning|afternoon|evening))\b[^.!?\n]{0,40}[,!:]?\s*$/i.test(lines[a])) a++;
  while (b > a && !lines[b - 1].trim()) b--;
  // sign-off: up to 3 trailing short lines (name, "Thanks,", title)
  for (let k = 0; k < 3 && b > a && wordsOf(lines[b - 1]) <= 4 && !/[.?]\s*$/.test(lines[b - 1].trim()); k++) b--;
  return lines.slice(a, b);
}

export function splitSentences(text: string): string[] {
  return bodyLines(text).join("\n")
    .split(/(?<=[.!?])\s+|\n+/)
    .map((s) => s.replace(/^\s*(?:[-*•]|\d+[.)])\s+/, "").trim())
    .filter((s) => wordsOf(s) >= 2);
}

const NOT_ENTITY = new Set(["I", "I'm", "I’m", "I'll", "I’ll", "I've", "I’ve", "I'd", "I’d", "OK", "Ok"]);
export function countSpecifics(text: string): number {
  const found = new Set<string>();
  for (const s of splitSentences(text)) {
    for (const d of s.match(/\d[\d,.:/%$-]*/g) ?? []) found.add(`n:${d}`);
    for (const q of s.match(/["“][^"”]{2,80}["”]/g) ?? []) found.add(`q:${q}`);
    const toks = s.split(/\s+/).slice(1);
    for (const t of toks) {
      const w = t.replace(/^[^A-Za-z]+|[^A-Za-z'’-]+$/g, "");
      if (/^[A-Z][A-Za-z'’-]+$/.test(w) && !NOT_ENTITY.has(w)) found.add(`e:${w}`);
      else if (/^[A-Z]{2,}$/.test(w)) found.add(`e:${w}`);
    }
  }
  return found.size;
}

const ASK = /\?|\b(please|can you|could you|would you|will you|let me know|let's|tell me|send me|reply|confirm|sign|approve|call me|text me|by (?:mon|tue|wed|thu|fri|sat|sun|tomorrow|today|tonight|end of|eod|noon|\d))/i;
const LENGTH: Record<Channel, [number, number]> = { text: [40, 60], linkedin: [200, 400], email: [250, 400], client: [250, 400] };

export function checkComms(text: string, opts: { channel?: Channel; tells?: Tell[] } = {}): Report {
  const channel = opts.channel ?? "email";
  const tells = opts.tells ?? loadTells();
  const words = wordsOf(text);
  const raw: Finding[] = [];
  const add = (f: Omit<Finding, "category"> & { category?: string }) => raw.push({ category: f.category ?? f.id.split("-")[0], ...f });

  // --- regex tells -------------------------------------------------------------------------------
  const hits = new Map<string, { tell: Tell; matches: RegExpMatchArray[] }>();
  for (const t of tells) {
    if (!t.pattern) continue;
    const only = CHANNEL_ONLY[t.id];
    if (only && !only.includes(channel)) continue;
    const ms = [...text.matchAll(toJsRegex(t.pattern))].filter((m) => m[0].length > 0);
    if (ms.length) hits.set(t.id, { tell: t, matches: ms });
  }
  const has = (id: string) => hits.has(id);
  const distinct = (id: string) => new Set(hits.get(id)!.matches.map((m) => m[0].toLowerCase())).size;
  const per100 = (n: number) => (words ? (n * 100) / words : 0);
  const msg = channel !== "text";

  for (const [id, { tell, matches }] of hits) {
    let sev: Severity = tell.severity;
    let note = "";
    const n = matches.length;
    let use = matches;
    switch (id) {
      case "lex-01": { const d = distinct(id); sev = d >= 3 ? "high" : d === 2 || (n >= 2 && per100(n) > 1.33) ? "med" : "info"; note = `${d} distinct`; break; }
      case "lex-02": sev = distinct(id) >= 2 || has("lex-01") || has("lex-03") ? "low" : "info"; break;
      case "lex-03": sev = n >= 2 ? "high" : "med"; break;
      case "lex-05": sev = n >= 2 || channel === "client" ? "med" : "low"; break;
      case "lex-07": sev = (n >= 2 && words < 200) || channel === "text" ? "low" : "info"; break;
      case "lex-08": sev = per100(n) >= 3 || (channel === "text" && n >= 2) ? "low" : "info"; break;
      case "str-01": sev = n >= 2 && words < 150 ? "high" : "med"; break;
      case "str-02": { const limit = 2 * Math.max(1, words / 150); sev = n >= limit ? "low" : "info"; note = `${n} triplet(s)`; break; }
      case "str-03": {
        const rate = per100(n);
        sev = channel === "text" ? "low" : n >= 3 && rate > 2 ? "med" : rate > 1 || (n >= 2 && words < 150) ? "low" : "info";
        note = `${n} em dash(es), ${rate.toFixed(1)} per 100 words; keep it to one`;
        break;
      }
      case "str-05": sev = words < 300 ? "high" : "med"; break;
      case "str-08": sev = words < 300 ? "med" : "low"; break;
      case "str-10": sev = n >= 2 ? "high" : "med"; break;
      case "str-11": sev = n >= 2 ? "low" : "info"; break;
      case "str-12": sev = channel === "email" || channel === "client" ? "high" : "med"; break;
      case "str-13": {
        const lines = text.split("\n");
        use = matches.filter((m) => { const l = lineAt(text, m.index!); return l < lines.length - 3 && (lines[l] ?? "").trim().length > 0; });
        if (use.length < 2) continue;
        break;
      }
      case "str-14": if (channel === "text" || (channel === "linkedin" && n < 3)) continue; sev = "med"; break;
      case "str-17": sev = per100(n) > 2 ? "low" : "info"; break;
      case "tone-01": sev = has("tone-02") ? "high" : "med"; break;
      case "tone-03": sev = n >= 2 ? "low" : "info"; break;
      case "tone-06": sev = n >= 2 || matches.some((m) => /^(?:may|might|could|potentially|possibly) (?:potentially|possibly|perhaps|could|may|might)$/i.test(m[0])) ? "low" : "info"; break;
      case "spec-01": {
        const s = excerptAt(text, matches[0].index!, matches[0][0].length);
        const specific = /\d|["“]/.test(s);
        sev = specific ? "low" : "high";
        note = specific ? "has a specific nearby; check it is real" : "no specific in the same sentence";
        break;
      }
      case "spec-04": sev = words < 300 ? "med" : "info"; break;
      case "spec-05": sev = "info"; note = "verify before sending: every number, link and source must be checked"; break;
      case "spec-06": sev = has("tone-01") ? "med" : "low"; break;
      case "chan-02": sev = n >= 2 ? "low" : "info"; break;
      case "chan-04": sev = "info"; note = "relational message: every other finding is raised one level; Jermaine should write or approve this one closely"; break;
      case "chan-05": sev = n >= 2 ? (has("spec-01") ? "high" : "med") : "low"; break;
    }
    const first = use[0];
    add({ id, category: tell.category, severity: sev, count: use.length, line: lineAt(text, first.index!), excerpt: excerptAt(text, first.index!, first[0].length), note, fix: shortFix(tell.fix) });
  }

  // --- heuristics that the regexes can't express -------------------------------------------------
  const sentences = splitSentences(text);
  const relationalHit = has("chan-04");
  const lens = sentences.map(wordsOf);
  const burst = lens.length >= 5 ? cv(lens) : null;
  if (burst !== null && burst < 0.35) add({ id: "str-04", category: "structural", severity: "low", count: 1, line: 1, excerpt: `sentence lengths ${lens.join(",")}`, note: `coefficient of variation ${burst.toFixed(2)} (< 0.35)`, fix: "Mix short and long sentences: one short line for the key point, a longer one for the reason." });

  const lines = text.split("\n");
  let run: string[] = [], runStart = 0;
  const flushList = () => {
    if (run.length >= 3) {
      const c = cv(run.map(wordsOf));
      if (c < 0.25) add({ id: "str-07", category: "structural", severity: "low", count: run.length, line: runStart + 1, excerpt: run[0].trim().slice(0, 100), note: `${run.length} items of near-equal length (cv ${c.toFixed(2)})`, fix: "Use prose, or let list items differ: put the important one first and give it the detail." });
    }
    run = [];
  };
  lines.forEach((l, i) => { if (/^\s*(?:[-*•]|\d+[.)])\s+\S/.test(l)) { if (!run.length) runStart = i; run.push(l); } else flushList(); });
  flushList();

  if (/'/.test(text) && /’/.test(text)) add({ id: "str-16", category: "structural", severity: "low", count: 1, line: 1, excerpt: "both ' and ’ appear", note: "mixed straight and curly apostrophes suggest pasted segments", fix: "Retype or normalize the quotes so the message reads as one piece." });

  const specifics = countSpecifics(text);
  if (words >= 80 && specifics === 0) add({ id: "spec-02", category: "content_specificity", severity: "high", count: 1, line: 1, excerpt: `${words} words, 0 specifics`, note: "no number, date, name or quote", fix: "Add the concrete detail: a date, number, name, or what someone said. Use [CHECK: ...] if you don't have it." });
  else if (words >= 150 && specifics === 1) add({ id: "spec-02", category: "content_specificity", severity: "med", count: 1, line: 1, excerpt: `${words} words, 1 specific`, note: "only one concrete detail", fix: "Add the concrete detail: a date, number, name, or what someone said." });

  if (msg && words >= 25 && !relationalHit && !ASK.test(text)) add({ id: "spec-07", category: "content_specificity", severity: "low", count: 1, line: 1, excerpt: "no question, request or deadline", note: "fine if it's FYI; otherwise say what you need and by when", fix: "End or (better) open with the ask: what you need, from whom, by when." });
  else if (msg && words > 100 && sentences.length >= 4) {
    const firstAsk = sentences.findIndex((s) => ASK.test(s));
    if (firstAsk >= 0 && firstAsk >= Math.ceil(sentences.length * 0.75)) add({ id: "ask-late", category: "content_specificity", severity: "low", count: 1, line: lineAt(text, Math.max(0, text.indexOf(sentences[firstAsk]))), excerpt: sentences[firstAsk].slice(0, 100), note: "the ask only appears at the end", fix: "Move the ask to the first or second sentence." });
  }

  const [soft, hard] = LENGTH[channel];
  if (words > soft) add({ id: "len", category: "channel", severity: words > hard ? "med" : "low", count: 1, line: 1, excerpt: `${words} words`, note: `long for ${channel} (aim for under ${soft})`, fix: "Cut the opener and closer first, then anything the reader doesn't need to act." });

  if (words < 300) {
    const bold = [...text.matchAll(/\*\*[^*\n]+\*\*/g)];
    if (bold.length && !has("str-05") && !has("str-06")) add({ id: "fmt-bold", category: "structural", severity: "med", count: bold.length, line: lineAt(text, bold[0].index!), excerpt: excerptAt(text, bold[0].index!, bold[0][0].length), note: "bold in a short message", fix: "Drop the bold; in a short message the first sentence carries the emphasis." });
  }
  const bullets = lines.filter((l) => /^\s*(?:[-*•]|\d+[.)])\s+\S/.test(l)).length;
  if (bullets && (channel === "text" || words < 120)) add({ id: "fmt-bullets", category: "structural", severity: channel === "text" ? "med" : "low", count: bullets, line: lines.findIndex((l) => /^\s*(?:[-*•]|\d+[.)])\s+\S/.test(l)) + 1, excerpt: "bulleted lines in a short message", note: "", fix: "Write it as one or two sentences unless the list is genuinely a list (dates, steps)." });

  const bangs = (text.match(/!/g) ?? []).length;
  if (words < 120 && bangs >= 2) add({ id: "tone-02", category: "tone", severity: msg ? "med" : "low", count: bangs, line: lineAt(text, text.indexOf("!")), excerpt: `${bangs} exclamation marks`, note: "unearned enthusiasm in a short business message", fix: "Keep at most one exclamation mark, and only where the news is actually good." });
  if (channel === "text" && (text.match(/;/g) ?? []).length >= 2) add({ id: "chan-07", category: "channel_sms", severity: "low", count: 1, line: 1, excerpt: "2+ semicolons", note: "texts don't use semicolons", fix: "Split into short sentences or just a comma." });

  // --- merge per tell id, relational raise, score ------------------------------------------------
  const byId = new Map<string, Finding>();
  for (const f of raw) {
    const prev = byId.get(f.id);
    if (!prev) byId.set(f.id, f);
    else { if (POINTS[f.severity] > POINTS[prev.severity]) { prev.severity = f.severity; prev.excerpt = f.excerpt; prev.line = f.line; } prev.count += f.count; prev.note = [prev.note, f.note].filter(Boolean).join("; "); }
  }
  const relational = byId.has("chan-04");
  const findings = [...byId.values()].map((f) => (relational && f.id !== "chan-04" && f.id !== "spec-05" ? { ...f, severity: RAISE[f.severity] } : f));
  // lex-04 hope-opener: a note alone; counts only when 2+ other tells are present
  const scored = findings.filter((f) => POINTS[f.severity] > 0);
  const hope = findings.find((f) => f.id === "lex-04");
  if (hope && scored.filter((f) => f.id !== "lex-04").length < 2 && !relational) hope.severity = "info";

  const live = findings.filter((f) => POINTS[f.severity] > 0);
  let points = live.reduce((a, f) => a + POINTS[f.severity] + (f.count >= 3 ? 1 : 0), 0);
  if (new Set(live.map((f) => f.category)).size >= 3) points += 2;
  const norm = points / Math.max(1, words / 150);
  let score = Math.max(0, Math.min(100, Math.round(100 - 8 * norm)));
  const high = findings.filter((f) => f.severity === "high").length;
  const blocked = findings.some((f) => (f.id === "lex-06" || f.id === "spec-03") && f.severity === "high");
  if (high) score = Math.min(score, 69);
  if (blocked) score = Math.min(score, 20);
  const verdict = score >= 80 ? "pass" : score >= 60 ? "edit" : "rewrite";
  findings.sort((a, b) => POINTS[b.severity] - POINTS[a.severity] || a.line - b.line);
  return {
    score, verdict, channel, words, sentences: sentences.length,
    em_dash_per_100: Number(per100((text.match(/—|\s--\s/g) ?? []).length).toFixed(2)),
    burstiness_cv: burst === null ? null : Number(burst.toFixed(2)), specifics, relational, blocked, high, findings,
  };
}

export function formatReport(r: Report): string {
  const out = [
    `Score: ${r.score}/100 (${r.verdict}) · ${r.channel} · ${r.words} words · em dashes ${r.em_dash_per_100}/100 words · sentence-length CV ${r.burstiness_cv ?? "n/a"} · specifics ${r.specifics}`,
  ];
  if (r.blocked) out.push("BLOCKED: leaked chatbot text or an unfilled placeholder. Do not send until fixed.");
  if (r.relational) out.push("Relational message (thanks, apology, congratulations, condolence, feedback): severities raised one level; Jermaine should write or closely approve it.");
  const shown = r.findings.filter((f) => f.severity !== "info");
  const notes = r.findings.filter((f) => f.severity === "info");
  out.push(shown.length ? `Findings (${shown.length}):` : "No findings above note level.");
  for (const f of shown) out.push(`  ${f.severity.toUpperCase().padEnd(4)} ${f.id.padEnd(11)} L${f.line} "${f.excerpt}"${f.count > 1 ? ` (x${f.count})` : ""}${f.note ? ` [${f.note}]` : ""}\n       fix: ${f.fix}`);
  if (notes.length) out.push(`Notes: ${notes.map((f) => `${f.id} L${f.line} "${f.excerpt}"${f.note ? ` [${f.note}]` : ""}`).join("; ")}`);
  return out.join("\n");
}

async function main(): Promise<number> {
  const argv = process.argv.slice(2);
  const ci = argv.indexOf("--channel");
  const channel = (ci >= 0 ? argv[ci + 1] : "email") as Channel;
  if (!CHANNELS.includes(channel)) { console.error(`--channel must be one of ${CHANNELS.join("|")}`); return 2; }
  const json = argv.includes("--json");
  const file = argv.filter((a, i) => !a.startsWith("--") && !(ci >= 0 && i === ci + 1))[0];
  let text: string;
  if (!file || file === "-") {
    if (process.stdin.isTTY) { console.error("usage: check-comms [file|-] [--channel email|linkedin|text|client] [--json]"); return 2; }
    text = readFileSync(0, "utf8");
  } else {
    text = readFileSync(isAbsolute(file) ? file : resolve(process.env.INIT_CWD ?? process.cwd(), file), "utf8");
  }
  const r = checkComms(text.replace(/\r\n/g, "\n"), { channel });
  console.log(json ? JSON.stringify(r, null, 2) : formatReport(r));
  return r.high ? 1 : 0;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().then((c) => process.exit(c), (e) => { console.error(`check-comms: ${(e as Error).message}`); process.exit(2); });
}
