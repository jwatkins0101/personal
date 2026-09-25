/**
 * `npm run cos -- eod` (17:30): what got done, what slipped, decisions made, what carries forward,
 * and the commitment ledger update (AC-18..AC-21). Writes eod/YYYY-MM-DD.json, which the next
 * morning brief reads (or escalates `missing_eod`).
 */
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { getDb } from "../storage/db.js";
import { listMessageIds, getMessagesMeta, getMessageMeta } from "../mail/gmail-api.js";
import { MessagesClient } from "../messages/client.js";
import { loadContactIndex, nameOrHandle } from "../contacts/resolver.js";
import { ensureGtdLists, listTasks } from "../tasks/google-tasks.js";
import { getCachedEvents } from "../calendar/cache.js";
import { buildCosClaudeArgs } from "./claude.js";
import { parseClaudeJsonOutput } from "../claude/result.js";
import { remainingBudget, spentToday, DAILY_BUDGET_USD } from "./budget.js";
import { localDate } from "./approvals.js";
import { upsertCommitment, closeCommitment, listCommitments, type EvidenceChecker } from "./commitments.js";
import { writeLaneSummary } from "./summary.js";
import { pingSelf } from "./notify.js";
import { withAccount } from "../google/auth.js";
import { activeAccounts } from "./accounts.js";
import { gmailRef, parseGmailRef } from "./refs.js";

export const EOD_DIR = process.env.COS_EOD_DIR ?? join(homedir(), "Library/Application Support/assistance/eod");

export interface EodSource { ref: string; direction: "sent" | "received"; who: string; subject?: string; text: string; date: string }
export interface EodInputs {
  date: string;
  sources: EodSource[];
  approvals_today: { n: number; title: string; status: string; result: string | null }[];
  open_commitments: { id: number; owner: string; counterparty: string; what: string; due_at: string | null }[];
  gaps: string[];
}
interface Line { text: string; source_ref?: string }
export interface EodExtraction {
  done: Line[]; slipped: Line[]; decisions: Line[]; carry_forward: Line[];
  commitments_new: { owner: "me" | "them"; counterparty: string; what: string; due_quote?: string; source_ref: string }[];
  commitments_closed: { id: number; evidence: string }[];
}
export interface EodRecord extends Omit<EodExtraction, "commitments_new" | "commitments_closed"> {
  date: string; generated_at: string;
  commitments: { created: number[]; merged: number[]; closed: number[]; close_refused: string[]; open_count: number; open_questions: string[] };
  gaps: string[];
}

const midnight = (now: Date) => new Date(now.getFullYear(), now.getMonth(), now.getDate());

export async function gatherEod(now = new Date()): Promise<EodInputs> {
  const gaps: string[] = [];
  const since = Math.floor(midnight(now).getTime() / 1000);
  const sources: EodSource[] = [];
  const mail = async (account: string, q: string, direction: "sent" | "received") => {
    try {
      const metas = await withAccount(account, async () => getMessagesMeta(await listMessageIds(q, 40)));
      for (const m of metas) if (direction === "sent" || !m.listUnsub)
        sources.push({ ref: gmailRef(account, m.id), direction, who: direction === "sent" ? m.to : m.from, subject: m.subject, text: m.snippet, date: m.date });
    } catch (e) { gaps.push(`Gmail ${direction} (${account}) unavailable: ${(e as Error).message.slice(0, 120)}`); }
  };
  for (const acct of activeAccounts()) {
    await mail(acct.id, `in:sent after:${since}`, "sent");
    await mail(acct.id, `in:inbox after:${since}`, "received");
  }
  try {
    const client = new MessagesClient();
    const [a, b] = await Promise.all([
      client.searchMessages({ startDate: midnight(now), limit: 1000 }),
      client.extractRecentAttributedBodyMessages(1, 3000),
    ]);
    const byId = new Map<number, (typeof a)[number]>();
    for (const m of [...a, ...b]) if (m.date >= midnight(now) && (m.text ?? "").trim().length > 2 && !byId.has(m.id)) byId.set(m.id, m);
    await loadContactIndex();
    for (const m of [...byId.values()].slice(-120)) {
      sources.push({ ref: `sms:${m.id}`, direction: m.isFromMe ? "sent" : "received", who: await nameOrHandle(m.handleId), text: m.text.slice(0, 300), date: m.date.toISOString() });
    }
  } catch (e) { gaps.push(`SMS unavailable: ${(e as Error).message.slice(0, 120)}`); }
  const db = getDb();
  const date = localDate(now);
  const approvals_today = (db.prepare("SELECT day_index n, title, status, result FROM cos_approvals WHERE brief_date = ? ORDER BY day_index").all(date) as EodInputs["approvals_today"]);
  const open_commitments = listCommitments(db, "open").map(({ id, owner, counterparty, what, due_at }) => ({ id, owner, counterparty, what, due_at }));
  return { date, sources, approvals_today, open_commitments, gaps };
}

const PROMPT = (i: EodInputs) => `You are writing Jermaine's end-of-day wrap for ${i.date}. Use ONLY the inputs.
Return ONLY a JSON object:
{
 "done": [{"text":"...","source_ref":"..."}],
 "slipped": [{"text":"...","source_ref":"..."}],
 "decisions": [{"text":"...","source_ref":"..."}],
 "carry_forward": [{"text":"what tomorrow's brief must pick up","source_ref":"..."}],
 "commitments_new": [{"owner":"me|them","counterparty":"name","what":"the promise, <= 12 words","due_quote":"exact words from the source that state when, copied verbatim; omit if none","source_ref":"gmail:<id>|sms:<id>"}],
 "commitments_closed": [{"id": <open commitment id>, "evidence":"gmail:<id of a SENT message that fulfils it> | sms:<id>"}]
}
Rules:
- A commitment is an explicit promise to do something: "I'll send it Friday" (owner "me" when Jermaine said it, "them" when someone promised him). Not requests, not questions.
- due_quote must be copied exactly from that source's text or subject. Never convert or infer dates.
- Close a commitment only when a SENT source in the inputs clearly fulfils it; cite that source.
- source_ref values must come from the inputs (gmail:, sms:, approval:<n>, commitment:<id>).
- Short items, no more than 15 words each.

INPUTS:
${JSON.stringify(i, null, 1)}`;

export function extractEod(inputs: EodInputs, maxBudgetUsd: number): { extraction: EodExtraction; cost_usd: number | null } {
  if (process.env.COS_EOD_FIXTURE) return { extraction: JSON.parse(readFileSync(process.env.COS_EOD_FIXTURE, "utf8")), cost_usd: 0 };
  const env = { ...process.env }; delete env.CLAUDECODE;
  const res = spawnSync("claude", [...buildCosClaudeArgs({ maxBudgetUsd }), "--tools", ""], { input: PROMPT(inputs), encoding: "utf8", env, maxBuffer: 50 * 1024 * 1024, timeout: 600_000 });
  if (res.status !== 0) throw new Error(`claude exited ${res.status}: ${(res.stderr ?? "").slice(0, 200)}`);
  const out = parseClaudeJsonOutput(res.stdout);
  const m = out.text.match(/\{[\s\S]*\}/);
  if (out.isError || !m) throw new Error("EOD extraction was not JSON");
  return { extraction: JSON.parse(m[0]), cost_usd: out.costUsd };
}

/** Evidence that a commitment was fulfilled: a SENT Gmail message, a sent SMS in today's inputs, a past calendar event, or a completed task. */
export function makeEvidenceChecker(inputs: EodInputs, now = new Date()): EvidenceChecker {
  return async (ev) => {
    const [kind, id] = [ev.slice(0, ev.indexOf(":")), ev.slice(ev.indexOf(":") + 1)];
    if (kind === "gmail") { const g = parseGmailRef(ev); if (!g) return false; try { return (await withAccount(g.account, () => getMessageMeta(g.id))).labelIds.includes("SENT"); } catch { return false; } }
    if (kind === "sms") return inputs.sources.some((s) => s.ref === ev && s.direction === "sent");
    if (kind === "cal") return getCachedEvents(1, now).some((e) => `cal:${e.title}@${e.start}` === ev && new Date(e.start.replace(" ", "T")) <= now);
    if (kind === "task") {
      try { const ids = await ensureGtdLists(); for (const l of Object.values(ids)) if ((await listTasks(l, true)).some((t) => t.id === id && t.status === "completed")) return true; } catch { /* fall through */ }
      return false;
    }
    return false;
  };
}

export async function runEod(now = new Date(), deps: { gather?: (now: Date) => Promise<EodInputs>; checker?: (i: EodInputs) => EvidenceChecker } = {}): Promise<{ record: EodRecord; path: string }> {
  const inputs = await (deps.gather ?? gatherEod)(now);
  const gaps = [...inputs.gaps];
  const known = new Set<string>([...inputs.sources.map((s) => s.ref), ...inputs.approvals_today.map((a) => `approval:${a.n}`), ...inputs.open_commitments.map((c) => `commitment:${c.id}`)]);
  let ex: EodExtraction = { done: [], slipped: [], decisions: [], carry_forward: [], commitments_new: [], commitments_closed: [] };
  let cost = 0;
  const remaining = remainingBudget(now);
  if (remaining < 0.25) gaps.push(`budget: $${spentToday(now).toFixed(2)} of $${DAILY_BUDGET_USD.toFixed(2)} spent; EOD extraction skipped`);
  else {
    try { const r = extractEod(inputs, Math.min(remaining, 2)); ex = r.extraction; cost = r.cost_usd ?? 0; }
    catch (e) { gaps.push(`EOD extraction failed: ${(e as Error).message.slice(0, 160)}`); }
  }
  const keep = (xs: Line[] | undefined) => (xs ?? []).filter((x) => { const ok = !x.source_ref || known.has(x.source_ref); if (!ok) gaps.push(`dropped "${x.text}": unknown source ${x.source_ref}`); return ok; });

  const db = getDb();
  const created: number[] = [], merged: number[] = [], closed: number[] = [], close_refused: string[] = [];
  let dropped = 0;
  for (const c of ex.commitments_new ?? []) {
    const src = inputs.sources.find((s) => s.ref === c.source_ref);
    if (!src) { gaps.push(`dropped commitment "${c.what}": unknown source ${c.source_ref}`); dropped++; continue; }
    // The quote must really be in the source; otherwise keep the promise but not the date.
    const hay = `${src.subject ?? ""} ${src.text}`.toLowerCase();
    const quote = c.due_quote && hay.includes(c.due_quote.toLowerCase()) ? c.due_quote : null;
    if (c.due_quote && !quote) gaps.push(`due words "${c.due_quote}" not found in ${c.source_ref}; left undated`);
    const r = upsertCommitment(db, { owner: c.owner === "them" ? "them" : "me", counterparty: c.counterparty, what: c.what, due_quote: quote, source_ref: c.source_ref, source_date: new Date(src.date) });
    (r.action === "created" ? created : merged).push(r.commitment.id);
  }
  const checker = (deps.checker ?? makeEvidenceChecker)(inputs);
  for (const c of ex.commitments_closed ?? []) {
    try { closed.push((await closeCommitment(db, Number(c.id), c.evidence, checker)).id); }
    catch (e) { close_refused.push(`#${c.id}: ${(e as Error).message}`); }
  }
  const open = listCommitments(db, "open");
  const record: EodRecord = {
    date: inputs.date, generated_at: now.toISOString(),
    done: keep(ex.done), slipped: keep(ex.slipped), decisions: keep(ex.decisions), carry_forward: keep(ex.carry_forward),
    commitments: { created, merged, closed, close_refused, open_count: open.length, open_questions: open.filter((c) => c.open_question).map((c) => `#${c.id} ${c.open_question}`) },
    gaps,
  };
  mkdirSync(EOD_DIR, { recursive: true });
  const path = join(EOD_DIR, `${inputs.date}.json`);
  writeFileSync(path, JSON.stringify(record, null, 2));
  const md = join(EOD_DIR, `${inputs.date}.md`);
  const list = (xs: Line[]) => xs.length ? xs.map((x) => `- ${x.text}${x.source_ref ? ` [${x.source_ref}]` : ""}`).join("\n") : "None.";
  writeFileSync(md, `# End of day: ${inputs.date}\n\n## Done\n\n${list(record.done)}\n\n## Slipped\n\n${list(record.slipped)}\n\n## Decisions\n\n${list(record.decisions)}\n\n## Carry forward\n\n${list(record.carry_forward)}\n\n## Commitments\n\n${created.length} new, ${merged.length} merged, ${closed.length} closed, ${open.length} open.${record.commitments.open_questions.length ? "\n\nOpen questions:\n" + record.commitments.open_questions.map((q) => `- ${q}`).join("\n") : ""}${close_refused.length ? "\n\nClose refused:\n" + close_refused.map((q) => `- ${q}`).join("\n") : ""}\n\n## Gaps\n\n${gaps.length ? gaps.map((g) => `- ${g}`).join("\n") : "None."}\n`);

  const proposals = (ex.commitments_new ?? []).length + (ex.commitments_closed ?? []).length;
  writeLaneSummary({
    items_in: proposals,
    items_out: { created: created.length, merged: merged.length, closed: closed.length, close_refused: close_refused.length, dropped },
    artifacts: [path, md], gaps, cost_usd: cost,
    status: gaps.some((g) => /unavailable|failed/.test(g)) ? "partial" : "ok",
  });
  if (process.env.COS_EOD_PING === "1") await pingSelf(`EOD ${inputs.date}: ${record.done.length} done, ${record.slipped.length} slipped, ${open.length} open commitments.`, `End of day ${inputs.date}`);
  return { record, path };
}

/** The most recent weekday before `date` (Monday's brief reads Friday's EOD). */
export function previousWorkday(date: string): string {
  const [y, m, d] = date.split("-").map(Number);
  let p = new Date(y, m - 1, d - 1);
  while (p.getDay() === 0 || p.getDay() === 6) p = new Date(p.getFullYear(), p.getMonth(), p.getDate() - 1);
  return localDate(p);
}

export function readEod(date: string): EodRecord | null {
  const p = join(EOD_DIR, `${date}.json`);
  return existsSync(p) ? (JSON.parse(readFileSync(p, "utf8")) as EodRecord) : null;
}
