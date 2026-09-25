/**
 * Live task board (D16, AC-24/AC-25): http://127.0.0.1:8787, kept running by launchd.
 * - Shows pending Decide items, what you completed (today / this week), open and overdue
 *   commitments, lane health, and today's brief. The page polls /api/state every 5 seconds.
 * - Buttons run the same approvals code as the CLI: send always previews recipient and body
 *   first and keeps every refusal (placeholder, recipient swap, expiry).
 * - Bound to 127.0.0.1; every request needs the local token; Host must be localhost (blocks
 *   DNS rebinding). No request can come from another machine.
 */
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { randomBytes, timingSafeEqual } from "node:crypto";
import { chmodSync, existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import type Database from "better-sqlite3";
import { laneHealth, type LaneConfig } from "../../cos/lib/ledger.mjs";
import { approve, send, skip, markDone, respond, resume, heldItems, expireApprovals, localDate, PLACEHOLDER, type Executors, type Verdict } from "./approvals.js";
import type { RepliedFn } from "./replied.js";
import { gmailWebLink, parseGmailRef } from "./refs.js";
import { emailForAccount } from "./accounts.js";
import { listWork } from "./work.js";
import { createJob, cancelJob, jobsForItem, reapStaleJobs, type Job } from "./agent.js";
import { listCommitments, closeCommitment, type EvidenceChecker } from "./commitments.js";
import { spentToday, DAILY_BUDGET_USD } from "./budget.js";
import { BRIEF_DIR } from "./morning.js";
import { EOD_DIR } from "./eod.js";

export const BOARD_PORT = Number(process.env.COS_BOARD_PORT ?? "8787");
export const TOKEN_PATH = process.env.COS_BOARD_TOKEN_PATH ?? join(homedir(), "Library/Application Support/assistance/board-token");

export function loadOrCreateToken(path = TOKEN_PATH): string {
  if (existsSync(path)) return readFileSync(path, "utf8").trim();
  mkdirSync(dirname(path), { recursive: true });
  const t = randomBytes(24).toString("hex");
  writeFileSync(path, t + "\n", { mode: 0o600 });
  chmodSync(path, 0o600);
  return t;
}

export interface CompletedItem { at: string; kind: "sent" | "approved" | "skipped" | "closed" | "task" | "done"; text: string; detail?: string; ref?: string }
export interface BoardState {
  generated_at: string; date: string;
  decide: { date: string; n: number; kind: string; title: string; account: string | null; detail: string; source_ref: string; link?: string; to?: string; draft_body?: string; has_placeholder: boolean; expires_at: string;
    elsewhere: { app: string; link: string; mailbox: string; suggested: string | null } | null;
    agent: { id: number; status: string; started_at: string | null; finished_at: string | null; summary: string | null; needs_from_you: string[]; findings: { claim: string; source_ref: string }[]; gaps: string[]; drafted: boolean; cost_usd: number | null; error: string | null } | null }[];
  completed: { today: CompletedItem[]; week: CompletedItem[] };
  work: { id: number; goal: string; title: string; agent: string; status: string; result: string | null; updated_at: string }[];
  held: { id: number; date: string; n: number; title: string; note: string; since: string; source_ref: string; link?: string }[];
  commitments: { id: number; owner: string; counterparty: string; what: string; due_at: string | null; overdue: boolean; open_question: string | null; sources: string[] }[];
  lanes: { lane: string; state: string; last_started_at: string | null; gaps: string[] }[];
  brief: { date: string; exists: boolean; has_audio: boolean };
  cost_today: number; budget: number;
  warnings: string[];
}

export interface BoardDeps {
  db: Database.Database;
  lanes: LaneConfig[];
  executors: Executors;
  checker: EvidenceChecker;
  /** Google Tasks completed since an ISO time; may throw (shown as a warning). */
  tasksCompletedSince: (iso: string) => Promise<{ id: string; title: string; completed?: string; list?: string }[]>;
  /** Starts an agent runner for a queued job (detached process in production; inline in tests). */
  startAgent?: (jobId: number) => void;
  /** Reply detection for gmail-sourced items (auto-complete what you handled in Gmail). */
  replied?: RepliedFn;
  now?: () => Date;
  briefDir?: string;
  eodDir?: string;
}

const gmailLink = (ref: string) => gmailWebLink(ref, emailForAccount);

let replyCheckedAt = 0;
/** Auto-completes pending gmail-sourced items you already replied to (at most once a minute). */
async function reconcileReplies(deps: BoardDeps, now: Date): Promise<void> {
  if (!deps.replied || Date.now() - replyCheckedAt < 60_000) return;
  replyCheckedAt = Date.now();
  const rows = deps.db.prepare("SELECT brief_date, day_index, source_ref FROM cos_approvals WHERE status='pending' AND source_ref LIKE 'gmail:%'").all() as { brief_date: string; day_index: number; source_ref: string }[];
  for (const r of rows) {
    try { const rep = await deps.replied(r.source_ref); if (rep) markDone(deps.db, r.brief_date, r.day_index, `${rep.sentId} (you replied ${rep.at})`, now); }
    catch { /* leave pending; never auto-complete on an error */ }
  }
}

let tasksCache: { at: number; since: string; items: Awaited<ReturnType<BoardDeps["tasksCompletedSince"]>>; error?: string } | null = null;

export async function buildState(deps: BoardDeps): Promise<BoardState> {
  const now = deps.now?.() ?? new Date();
  const db = deps.db;
  expireApprovals(db, now);
  reapStaleJobs(db, now);
  await reconcileReplies(deps, now);
  const date = localDate(now);
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const weekStart = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 6);
  const warnings: string[] = [];

  type Row = { brief_date: string; day_index: number; kind: string; title: string; detail: string; source_ref: string; payload_json: string; status: string; expires_at: string; decided_at: string | null; result: string | null };
  const pending = db.prepare("SELECT * FROM cos_approvals WHERE status='pending' ORDER BY brief_date, day_index").all() as Row[];
  const decide = pending.map((r) => {
    const p = JSON.parse(r.payload_json || "{}") as { to?: string; draft_body?: string; suggested_reply?: string; reply_via?: string; reply_link?: string; reply_mailbox?: string };
    const j: Job | undefined = jobsForItem(db, r.brief_date, r.day_index).at(-1);
    const agent = j ? { id: j.id, status: j.status, started_at: j.started_at, finished_at: j.finished_at, summary: j.summary, needs_from_you: j.result?.needs_from_you ?? [],
      findings: j.result?.findings ?? [], gaps: j.result?.gaps ?? [], drafted: !!j.draft_id, cost_usd: j.cost_usd, error: j.error } : null;
    return { date: r.brief_date, n: r.day_index, kind: r.kind, title: r.title, detail: r.detail, source_ref: r.source_ref, link: gmailLink(r.source_ref), account: parseGmailRef(r.source_ref)?.account ?? null,
      to: p.to, draft_body: p.draft_body, has_placeholder: !!p.draft_body && PLACEHOLDER.test(p.draft_body), expires_at: r.expires_at, agent,
      elsewhere: p.reply_via ? { app: p.reply_via, link: p.reply_link ?? "", mailbox: p.reply_mailbox ?? "", suggested: p.suggested_reply ?? null } : null };
  });

  const completed: CompletedItem[] = [];
  const decided = db.prepare("SELECT * FROM cos_approvals WHERE status IN ('approved','sent','skipped') AND decided_at >= ?").all(weekStart.toISOString()) as Row[];
  for (const r of decided) {
    const done = (r.result ?? "").startsWith("done:");
    completed.push({ at: r.decided_at!, kind: done ? "done" : (r.status as CompletedItem["kind"]), text: r.title,
      detail: done ? (/^(gmail|cal):/.test(r.result!.slice(5)) ? `you handled it: ${r.result!.slice(5)}` : "marked done by you")
        : r.status === "sent" ? `sent${(r.result ?? "").includes(";edited") ? " (you edited it)" : ""}` : r.status, ref: r.source_ref });
  }
  for (const c of listCommitments(db, "closed")) {
    const at = new Date(c.updated_at.replace(" ", "T") + "Z");
    if (at >= weekStart) completed.push({ at: at.toISOString(), kind: "closed", text: `${c.owner === "me" ? "You kept" : `${c.counterparty} kept`}: ${c.what}`, detail: c.closed_evidence ?? undefined, ref: `commitment:${c.id}` });
  }
  // Google Tasks checked off (cached 60s: it is a network call).
  const since = weekStart.toISOString();
  if (!tasksCache || tasksCache.since !== since || Date.now() - tasksCache.at > 60_000) {
    try { tasksCache = { at: Date.now(), since, items: await deps.tasksCompletedSince(since) }; }
    catch (e) { tasksCache = { at: Date.now(), since, items: [], error: (e as Error).message.slice(0, 120) }; }
  }
  if (tasksCache.error) warnings.push(`Google Tasks unavailable: ${tasksCache.error}`);
  for (const t of tasksCache.items) if (t.completed) completed.push({ at: t.completed, kind: "task", text: t.title, detail: t.list, ref: `task:${t.id}` });
  // End-of-day "done" lists for this week.
  const eodDir = deps.eodDir ?? EOD_DIR;
  if (existsSync(eodDir)) for (const f of readdirSync(eodDir).filter((x) => /^\d{4}-\d{2}-\d{2}\.json$/.test(x))) {
    const d = f.slice(0, 10);
    if (d < localDate(weekStart) || d > date) continue;
    try {
      const rec = JSON.parse(readFileSync(join(eodDir, f), "utf8")) as { generated_at: string; done: { text: string; source_ref?: string }[] };
      for (const x of rec.done ?? []) completed.push({ at: rec.generated_at, kind: "done", text: x.text, detail: `end of day ${d}`, ref: x.source_ref });
    } catch { warnings.push(`unreadable end-of-day file ${f}`); }
  }
  completed.sort((a, b) => b.at.localeCompare(a.at));

  const commitments = listCommitments(db, "open").map((c) => ({ id: c.id, owner: c.owner, counterparty: c.counterparty, what: c.what, due_at: c.due_at,
    overdue: !!c.due_at && c.due_at < date, open_question: c.open_question, sources: c.source_refs }));
  commitments.sort((a, b) => Number(b.overdue) - Number(a.overdue) || (a.due_at ?? "9999").localeCompare(b.due_at ?? "9999"));

  const lanes = laneHealth({ lanes: deps.lanes }, now).map((l) => ({ lane: l.lane, state: l.state, last_started_at: l.last_started_at, gaps: l.gaps }));
  const held = heldItems(db).map((h) => ({ id: h.id, date: h.brief_date, n: h.day_index, title: h.title, note: h.hold_note ?? "", since: h.decided_at ?? "", source_ref: h.source_ref, link: gmailLink(h.source_ref) }));
  const work = listWork(db, todayStart.toISOString()).map((w) => ({ id: w.id, goal: w.goal, title: w.title, agent: w.agent, status: w.status, result: w.result, updated_at: w.updated_at }));
  const briefDir = deps.briefDir ?? BRIEF_DIR;
  return {
    generated_at: now.toISOString(), date, decide,
    completed: { today: completed.filter((c) => new Date(c.at) >= todayStart), week: completed.filter((c) => new Date(c.at) < todayStart) },
    work, held, commitments, lanes,
    brief: { date, exists: existsSync(join(briefDir, `${date}.html`)), has_audio: existsSync(join(briefDir, `${date}.mp3`)) },
    cost_today: Math.round(spentToday(now) * 100) / 100, budget: DAILY_BUDGET_USD, warnings,
  };
}

const sameToken = (a: string, b: string) => { const x = Buffer.from(a), y = Buffer.from(b); return x.length === y.length && timingSafeEqual(x, y); };

async function readJson(req: IncomingMessage): Promise<Record<string, unknown>> {
  let size = 0; const chunks: Buffer[] = [];
  for await (const c of req) { size += (c as Buffer).length; if (size > 10_000) throw new Error("body too large"); chunks.push(c as Buffer); }
  const raw = Buffer.concat(chunks).toString("utf8").trim();
  return raw ? JSON.parse(raw) : {};
}

export function createBoardServer(deps: BoardDeps, token: string, port = BOARD_PORT): Server {
  // Host must name this server's actual port on localhost (blocks DNS rebinding).
  const boundPort = () => ((server.address() as { port?: number } | null)?.port ?? port);
  const hostOk = (h: string) => h === `127.0.0.1:${boundPort()}` || h === `localhost:${boundPort()}`;
  const json = (res: ServerResponse, code: number, body: unknown) => {
    res.writeHead(code, { "Content-Type": "application/json", "Cache-Control": "no-store" });
    res.end(JSON.stringify(body));
  };
  const server = createServer(async (req, res) => {
    try {
      const url = new URL(req.url ?? "/", `http://127.0.0.1:${boundPort()}`);
      if (!hostOk(req.headers.host ?? "")) return json(res, 403, { ok: false, error: "forbidden host" });
      if (url.pathname === "/healthz") return json(res, 200, { ok: true });
      const qToken = url.searchParams.get("t") ?? "";
      const hToken = String(req.headers["x-cos-token"] ?? "");

      // Page and brief files: token in the query string.
      if (req.method === "GET" && (url.pathname === "/" || url.pathname.startsWith("/brief/"))) {
        if (!sameToken(qToken, token)) { res.writeHead(401, { "Content-Type": "text/plain" }); return res.end("Missing or wrong token. Open the URL printed by: npm run cos -- board-url"); }
        if (url.pathname === "/") { res.writeHead(200, { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" }); return res.end(BOARD_HTML); }
        const m = url.pathname.match(/^\/brief\/(\d{4}-\d{2}-\d{2})\.(html|mp3)$/);
        const file = m ? join(deps.briefDir ?? BRIEF_DIR, `${m[1]}.${m[2]}`) : "";
        if (!m || !existsSync(file)) { res.writeHead(404); return res.end("not found"); }
        let body = readFileSync(file);
        if (m[2] === "html") body = Buffer.from(body.toString("utf8").replace(/src="(\d{4}-\d{2}-\d{2}\.mp3)"/, `src="/brief/$1?t=${token}"`));
        res.writeHead(200, { "Content-Type": m[2] === "html" ? "text/html; charset=utf-8" : "audio/mpeg", "Referrer-Policy": "no-referrer" });
        return res.end(body);
      }

      // API: token in a header (a custom header also blocks cross-site form posts).
      if (!url.pathname.startsWith("/api/")) { res.writeHead(404); return res.end("not found"); }
      if (!sameToken(hToken, token)) return json(res, 401, { ok: false, error: "missing or wrong token" });
      if (req.method === "GET" && url.pathname === "/api/state") return json(res, 200, await buildState(deps));
      if (req.method !== "POST") return json(res, 405, { ok: false, error: "method not allowed" });
      if (!String(req.headers["content-type"] ?? "").startsWith("application/json")) return json(res, 415, { ok: false, error: "JSON only" });
      const body = await readJson(req);
      const now = deps.now?.() ?? new Date();

      let m = url.pathname.match(/^\/api\/approvals\/(\d{4}-\d{2}-\d{2})\/(\d+)\/(approve|skip|preview|send|done)$/);
      if (m) {
        const [, d, nStr, action] = m; const n = Number(nStr);
        try {
          if (action === "approve") return json(res, 200, { ok: true, message: await approve(deps.db, deps.executors, d, n, now) });
          if (action === "skip") return json(res, 200, { ok: true, message: skip(deps.db, d, n, now) });
          if (action === "done") return json(res, 200, { ok: true, message: markDone(deps.db, d, n, "by you", now) });
          const row = deps.db.prepare("SELECT kind, status, payload_json, expires_at FROM cos_approvals WHERE brief_date=? AND day_index=?").get(d, n) as { kind: string; status: string; payload_json: string; expires_at: string } | undefined;
          if (!row) throw new Error(`No item ${n} in the ${d} brief.`);
          if (row.kind !== "reply") throw new Error(`Item ${n} is not an email draft.`);
          if (action === "preview") {
            if (row.status !== "pending" || new Date(row.expires_at) < now) throw new Error(`Item ${n} is ${row.status === "pending" ? "expired" : row.status}; nothing to send.`);
            const pl = JSON.parse(row.payload_json); const draft = await deps.executors.readDraft(String(pl.draft_id ?? ""), pl.account);
            return json(res, 200, { ok: true, preview: draft, placeholder: (draft.body.match(PLACEHOLDER) ?? draft.subject.match(PLACEHOLDER))?.[0] ?? null });
          }
          if (body.confirm !== true) return json(res, 400, { ok: false, error: "send needs {\"confirm\": true} after a preview" });
          return json(res, 200, { ok: true, message: await send(deps.db, deps.executors, d, n, now, () => {}) });
        } catch (e) { return json(res, 400, { ok: false, error: (e as Error).message }); }
      }
      m = url.pathname.match(/^\/api\/approvals\/(\d{4}-\d{2}-\d{2})\/(\d+)\/agent$/);
      if (m) {
        try {
          const job = createJob(deps.db, m[1], Number(m[2]), String(body.note ?? ""), now);
          deps.startAgent?.(job.id);
          return json(res, 200, { ok: true, message: `Agent started on item ${m[2]}. It prepares; you review.`, job: job.id });
        } catch (e) { return json(res, 400, { ok: false, error: (e as Error).message }); }
      }
      m = url.pathname.match(/^\/api\/approvals\/(\d{4}-\d{2}-\d{2})\/(\d+)\/respond$/);
      if (m) {
        const verdict = String(body.verdict ?? "") as Verdict;
        if (!["done", "accept", "dismiss", "spam", "hold"].includes(verdict)) return json(res, 400, { ok: false, error: "verdict must be done, accept, dismiss, spam or hold" });
        try { return json(res, 200, { ok: true, message: await respond(deps.db, deps.executors, m[1], Number(m[2]), verdict, String(body.note ?? ""), now) }); }
        catch (e) { return json(res, 400, { ok: false, error: (e as Error).message }); }
      }
      m = url.pathname.match(/^\/api\/held\/(\d+)\/resume$/);
      if (m) {
        try { return json(res, 200, { ok: true, message: resume(deps.db, Number(m[1]), now) }); }
        catch (e) { return json(res, 400, { ok: false, error: (e as Error).message }); }
      }
      m = url.pathname.match(/^\/api\/agent\/(\d+)\/cancel$/);
      if (m) {
        try { cancelJob(deps.db, Number(m[1]), now); return json(res, 200, { ok: true, message: "Agent stopped." }); }
        catch (e) { return json(res, 400, { ok: false, error: (e as Error).message }); }
      }
      m = url.pathname.match(/^\/api\/commitments\/(\d+)\/close$/);
      if (m) {
        try { const c = await closeCommitment(deps.db, Number(m[1]), String(body.evidence ?? ""), deps.checker); return json(res, 200, { ok: true, message: `Closed: ${c.what}` }); }
        catch (e) { return json(res, 400, { ok: false, error: (e as Error).message }); }
      }
      return json(res, 404, { ok: false, error: "unknown action" });
    } catch (e) {
      return json(res, 500, { ok: false, error: (e as Error).message.slice(0, 200) });
    }
  });
  return server;
}

export const BOARD_HTML = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="referrer" content="no-referrer"><title>Chief of Staff Board</title><style>
:root{--bg:#f7f6f2;--card:#fff;--ink:#1c1b18;--muted:#6b675e;--line:#e2dfd6;--accent:#2f5d50;--accent-ink:#fff;--warn:#9a5b12;--warn-soft:#f6ead6;--bad:#a3312a;--ok:#2f7d4f}
@media (prefers-color-scheme:dark){:root:not([data-theme="light"]){--bg:#141412;--card:#1d1c1a;--ink:#ecebe6;--muted:#a19d93;--line:#34322d;--accent:#7fc3ab;--accent-ink:#0f1a16;--warn:#e2ad63;--warn-soft:#3a2d18;--bad:#f08b82;--ok:#7fd3a0}}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--ink);font:15px/1.5 -apple-system,system-ui,sans-serif}
main{max-width:1100px;margin:0 auto;padding:20px 16px 60px}header{display:flex;flex-wrap:wrap;gap:10px;align-items:center;justify-content:space-between;margin-bottom:14px}
h1{font:600 24px/1.2 Georgia,serif;margin:0}.live{font-size:12px;color:var(--muted)}.dot{display:inline-block;width:8px;height:8px;border-radius:50%;background:var(--ok);margin-right:6px;vertical-align:1px}
.dot.stale{background:var(--bad)}.grid{display:grid;grid-template-columns:1fr 1fr;gap:16px}@media (max-width:820px){.grid{grid-template-columns:1fr}}
section{background:var(--card);border:1px solid var(--line);border-radius:12px;padding:14px}h2{font:600 12px/1 system-ui;letter-spacing:.1em;text-transform:uppercase;color:var(--muted);margin:0 0 10px}
.item{border-top:1px solid var(--line);padding:10px 0}.item:first-of-type{border-top:0}.t{font-weight:600}.m{color:var(--muted);font-size:13px}
.btns{display:flex;flex-wrap:wrap;gap:6px;margin-top:8px}button{border:1px solid var(--line);background:none;color:var(--ink);border-radius:8px;padding:5px 10px;font:600 13px system-ui;cursor:pointer}
button.primary{background:var(--accent);color:var(--accent-ink);border-color:var(--accent)}button.danger{border-color:var(--bad);color:var(--bad)}button:disabled{opacity:.5;cursor:default}
.preview{margin-top:8px;border:1px solid var(--line);border-radius:8px;padding:10px;background:var(--bg)}.preview pre{white-space:pre-wrap;margin:6px 0;font:14px/1.45 system-ui}
.warn{background:var(--warn-soft);color:var(--warn);border-radius:8px;padding:6px 10px;font-size:13px;margin:6px 0}.pill{display:inline-block;font:700 11px system-ui;padding:2px 7px;border-radius:999px;border:1px solid var(--line);margin-right:6px}
.pill.overdue,.pill.failing,.pill.stale{color:var(--bad);border-color:var(--bad)}.pill.ok{color:var(--ok);border-color:var(--ok)}.pill.sent,.pill.approved,.pill.closed,.pill.task,.pill.done{color:var(--ok);border-color:var(--ok)}.pill.skipped{color:var(--muted)}
.lanes{display:flex;flex-wrap:wrap;gap:6px}a{color:var(--accent)}.empty{color:var(--muted);font-size:14px}.msg{position:fixed;left:50%;bottom:16px;transform:translateX(-50%);background:var(--ink);color:var(--bg);padding:8px 14px;border-radius:10px;font-size:14px;display:none;max-width:90vw}
input{border:1px solid var(--line);background:var(--bg);color:var(--ink);border-radius:8px;padding:5px 8px;font:13px ui-monospace,monospace;width:220px}h3{font:600 13px system-ui;margin:12px 0 4px;color:var(--muted)}
</style></head><body><main>
<header><h1>Chief of Staff</h1><div class="live"><span class="dot" id="dot"></span><span id="upd">loading…</span> · <span id="cost"></span> · <a id="brief" href="#" target="_blank" rel="noreferrer">today's brief</a></div></header>
<div id="warn"></div>
<div class="grid">
<section><h2>Decide <span id="nd"></span></h2><div id="decide"></div></section>
<section><h2>Work in progress <span id="nw"></span></h2><div id="work"></div></section>
<section><h2>Completed</h2><h3>Today</h3><div id="done-today"></div><h3>Earlier this week</h3><div id="done-week"></div></section>
<section><h2>Commitments <span id="nc"></span></h2><div id="commit"></div><h3>On hold</h3><div id="held"></div></section>
<section><h2>Lanes</h2><div class="lanes" id="lanes"></div></section>
</div></main><div class="msg" id="msg"></div>
<script>
const T=new URLSearchParams(location.search).get('t')||'';history.replaceState(null,'',location.pathname+'?t='+T);
const $=id=>document.getElementById(id);const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let busy=false,openPreview=null,openAgent=null,lastOk=0;
function toast(t){const m=$('msg');m.textContent=t;m.style.display='block';clearTimeout(toast.h);toast.h=setTimeout(()=>m.style.display='none',4000)}
async function api(path,body){const r=await fetch(path,{method:body?'POST':'GET',headers:{'x-cos-token':T,...(body?{'content-type':'application/json'}:{})},body:body?JSON.stringify(body):undefined});return r.json()}
const time=iso=>new Date(iso).toLocaleTimeString([], {hour:'numeric',minute:'2-digit'});const day=iso=>new Date(iso).toLocaleDateString([], {weekday:'short',month:'short',day:'numeric'});
function render(s){window.__s=s;
 $('upd').textContent='updated '+time(s.generated_at);$('cost').textContent='$'+s.cost_today.toFixed(2)+' of $'+s.budget.toFixed(2);
 $('brief').href=s.brief.exists?'/brief/'+s.date+'.html?t='+T:'#';$('brief').style.display=s.brief.exists?'':'none';
 $('warn').innerHTML=s.warnings.map(w=>'<div class="warn">'+esc(w)+'</div>').join('');
 $('nd').textContent=s.decide.length?'('+s.decide.length+')':'';
 if(!(busy||openPreview||openAgent)) $('decide').innerHTML=s.decide.length?s.decide.map(d=>{const id=d.date+'/'+d.n;return '<div class="item" data-id="'+id+'"><div class="t">'+d.n+'. '+(d.account&&d.account!=='personal'?'<span class="pill">'+esc(d.account)+'</span>':'')+esc(d.title)+'</div>'+
  (d.detail?'<div class="m">'+esc(d.detail)+'</div>':'')+'<div class="m">'+esc(d.source_ref)+(d.link?' · <a href="'+esc(d.link)+'" target="_blank" rel="noreferrer">source</a>':'')+(d.date!==s.date?' · from '+esc(d.date):'')+'</div>'+
  (d.kind==='reply'&&d.draft_body?'<div class="preview"><div class="m">Draft to '+esc(d.to)+'</div><pre>'+esc(d.draft_body)+'</pre>'+(d.has_placeholder?'<div class="warn">Has placeholder text: edit it in Gmail before sending.</div>':'')+'</div>':'')+
  elsewhereBlock(d)+agentBlock(d)+'<div class="btns">'+(d.kind==='reply'?'<button class="primary" onclick="preview(\\''+id+'\\')">Review &amp; send…</button>':'<button class="primary" onclick="act(\\''+id+'\\',\\'approve\\')">Approve</button>')+
  (d.agent&&(d.agent.status==='queued'||d.agent.status==='running')?'':'<button data-agent="'+id+'">'+(d.agent&&d.agent.status==='ready'?'Ask agent again':'Hand to agent')+'</button>')+
  '<button onclick="act(\\''+id+'\\',\\'done\\')">Done already</button><button onclick="act(\\''+id+'\\',\\'skip\\')">Skip</button></div><div id="ag-'+id.replace('/','-')+'"></div><div id="pv-'+id.replace('/','-')+'"></div></div>'}).join(''):'<div class="empty">Nothing waiting on you.</div>';
 const done=xs=>xs.length?xs.map(c=>'<div class="item"><span class="pill '+c.kind+'">'+c.kind+'</span>'+esc(c.text)+'<div class="m">'+(c.at?day(c.at)+' '+time(c.at):'')+(c.detail?' · '+esc(c.detail):'')+'</div></div>').join(''):'<div class="empty">Nothing yet.</div>';
 $('done-today').innerHTML=done(s.completed.today);$('done-week').innerHTML=done(s.completed.week);
 const od=s.commitments.filter(c=>c.overdue).length;$('nc').textContent='('+s.commitments.length+' open'+(od?', '+od+' overdue':'')+')';
 if(!busy) $('commit').innerHTML=s.commitments.length?s.commitments.map(c=>'<div class="item">'+(c.overdue?'<span class="pill overdue">overdue</span>':'')+'<span class="t">'+(c.owner==='me'?'You → '+esc(c.counterparty):esc(c.counterparty)+' → you')+'</span>: '+esc(c.what)+
  '<div class="m">due '+esc(c.due_at||'no date given')+(c.open_question?' · '+esc(c.open_question):'')+' · '+esc(c.sources.join(', '))+'</div>'+
  '<div class="btns"><input id="ev-'+c.id+'" placeholder="gmail:<sent id> / task:<id>"><button onclick="closeC('+c.id+')">Mark kept</button></div></div>').join(''):'<div class="empty">No open commitments.</div>';
 const open=s.work.filter(w=>['queued','running','review'].includes(w.status));$('nw').textContent=open.length?'('+open.length+')':'';
 $('work').innerHTML=s.work.length?s.work.map(w=>'<div class="item"><span class="pill '+esc(w.status)+'">'+esc(w.status)+'</span>'+esc(w.title)+'<div class="m">'+esc(w.agent)+' · '+esc(w.goal)+(w.result?' · '+esc(w.result):'')+'</div></div>').join(''):'<div class="empty">Nothing in progress. Start with /cos in Claude Code.</div>';
 $('held').innerHTML=s.held.length?s.held.map(h=>'<div class="item"><span class="pill">hold</span>'+esc(h.title)+'<div class="m">'+esc(h.note)+(h.link?' · <a href="'+esc(h.link)+'" target="_blank" rel="noreferrer">source</a>':'')+'</div><div class="btns"><button data-resume="'+h.id+'">Resume</button></div></div>').join(''):'<div class="empty">Nothing on hold.</div>';
 $('lanes').innerHTML=s.lanes.map(l=>'<span class="pill '+l.state+'" title="'+esc((l.last_started_at||'never')+' '+l.gaps.join('; '))+'">'+esc(l.lane)+' '+(l.state==='ok'?'✓':l.state)+'</span>').join('');
}
async function refresh(){try{const s=await api('/api/state');if(s.ok===false)throw new Error(s.error);render(s);lastOk=Date.now()}catch(e){$('upd').textContent='offline: '+e.message}$('dot').className='dot'+(Date.now()-lastOk>15000?' stale':'')}
async function act(id,a){busy=true;const[d,n]=id.split('/');const r=await api('/api/approvals/'+d+'/'+n+'/'+a,{});busy=false;toast(r.ok?r.message:r.error);refresh()}
async function preview(id){const[d,n]=id.split('/');const box=$('pv-'+id.replace('/','-'));const r=await api('/api/approvals/'+d+'/'+n+'/preview',{});
 if(!r.ok){toast(r.error);return}openPreview=id;box.innerHTML='<div class="preview"><div class="m">This exact email will be sent:</div><div><b>To:</b> '+esc(r.preview.to)+'</div><div><b>Subject:</b> '+esc(r.preview.subject)+'</div><pre>'+esc(r.preview.body)+'</pre>'+
 (r.placeholder?'<div class="warn">Contains placeholder "'+esc(r.placeholder)+'". Sending will be refused until you edit it in Gmail.</div>':'')+
 '<div class="btns"><button class="primary" onclick="sendNow(\\''+id+'\\')">Send now</button><button onclick="cancelPv(\\''+id+'\\')">Cancel</button></div></div>'}
function cancelPv(id){openPreview=null;$('pv-'+id.replace('/','-')).innerHTML='';refresh()}
async function sendNow(id){const[d,n]=id.split('/');busy=true;const r=await api('/api/approvals/'+d+'/'+n+'/send',{confirm:true});busy=false;openPreview=null;toast(r.ok?r.message:r.error);refresh()}
async function closeC(id){const ev=$('ev-'+id).value.trim();const r=await api('/api/commitments/'+id+'/close',{evidence:ev});toast(r.ok?r.message:r.error);refresh()}
function mins(a,b){const m=Math.max(0,Math.round(((b?new Date(b):new Date())-new Date(a))/60000));return m<1?'<1 min':m+' min'}
function elsewhereBlock(d){const e=d.elsewhere;if(!e)return'';
 return '<div class="preview"><div class="t">✉ Reply from '+esc(e.app)+' ('+esc(e.mailbox)+' address)</div><div class="m">This came to your '+esc(e.mailbox)+' address. A Gmail reply would come from your Gmail address, so no draft was made.</div>'+
  (e.suggested?'<pre>'+esc(e.suggested)+'</pre>':'')+'<div class="btns"><a href="'+esc(e.link)+'" target="_blank" rel="noreferrer"><button>Open '+esc(e.app)+'</button></a>'+(e.suggested?'<button data-copy="'+d.date+'/'+d.n+'">Copy text</button>':'')+'</div></div>'}
function agentBlock(d){const a=d.agent;if(!a)return'';
 if(a.status==='queued'||a.status==='running')return '<div class="preview"><div class="t">🤖 Agent working…'+(a.started_at?' ('+mins(a.started_at)+')':' (starting)')+'</div><div class="m">Reading the thread and searching your mail. It prepares; you review.</div><div class="btns"><button data-stop="'+a.id+'">Stop</button></div></div>';
 if(a.status==='ready')return '<div class="preview"><div class="t">🤖 Ready for review</div><div>'+esc(a.summary)+'</div>'+
  (a.needs_from_you.length?'<div class="m" style="margin-top:6px"><b>Needs from you:</b></div><ul>'+a.needs_from_you.map(x=>'<li>'+esc(x)+'</li>').join('')+'</ul>':'')+
  (a.findings.length?'<details><summary class="m">What it found ('+a.findings.length+')</summary><ul>'+a.findings.map(f=>'<li>'+esc(f.claim)+' <span class="m">'+esc(f.source_ref)+'</span></li>').join('')+'</ul></details>':'')+
  (a.gaps.length?'<div class="m">Could not find: '+esc(a.gaps.join('; '))+'</div>':'')+
  '<div class="m">'+(a.drafted?'Draft reply saved to Gmail: use Review &amp; send.':'No draft made.')+(a.cost_usd!=null?' · $'+a.cost_usd.toFixed(2):'')+'</div></div>';
 if(a.status==='failed')return '<div class="warn">Agent could not finish: '+esc(a.error||'unknown error')+'</div>';
 if(a.status==='cancelled')return '<div class="m">Agent stopped.</div>';return''}
document.addEventListener('click',async e=>{const b=e.target.closest('button');if(!b)return;
 if(b.dataset.agent){const id=b.dataset.agent;openAgent=id;const box=$('ag-'+id.replace('/','-'));
  box.innerHTML='<div class="preview"><div class="m">Anything the agent should know? (optional)</div><textarea id="note-'+id.replace('/','-')+'" rows="2" style="width:100%;margin-top:6px;border:1px solid var(--line);border-radius:8px;background:var(--bg);color:var(--ink);font:14px system-ui;padding:6px" placeholder="e.g. use last year&#39;s AACSB form"></textarea><div class="btns"><button class="primary" data-start="'+id+'">Start agent</button><button data-close="'+id+'">Cancel</button></div></div>'}
 else if(b.dataset.start){const id=b.dataset.start;const[d,n]=id.split('/');const note=($('note-'+id.replace('/','-'))||{}).value||'';b.disabled=true;
  const r=await api('/api/approvals/'+d+'/'+n+'/agent',{note});openAgent=null;toast(r.ok?r.message:r.error);refresh()}
 else if(b.dataset.close){openAgent=null;refresh()}
 else if(b.dataset.copy){const it=(window.__s&&window.__s.decide||[]).find(x=>x.date+'/'+x.n===b.dataset.copy);if(it&&it.elsewhere&&it.elsewhere.suggested){try{await navigator.clipboard.writeText(it.elsewhere.suggested);toast('Copied. Paste it into your reply in '+it.elsewhere.app+'.')}catch(e){toast('Could not copy: select the text instead.')}}}
 else if(b.dataset.resume){const r=await api('/api/held/'+b.dataset.resume+'/resume',{});toast(r.ok?r.message:r.error);refresh()}
 else if(b.dataset.stop){const r=await api('/api/agent/'+b.dataset.stop+'/cancel',{});toast(r.ok?r.message:r.error);refresh()}});
refresh();setInterval(()=>{if(!document.hidden)refresh()},5000);document.addEventListener('visibilitychange',()=>{if(!document.hidden)refresh()});
</script></body></html>`;
