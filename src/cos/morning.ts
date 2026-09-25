/**
 * `npm run cos -- morning`: builds the 07:30 brief (AC-12..AC-16).
 * gather → budget check → synthesize (or deterministic fallback) → verify sources → draft replies (A2)
 * → queue approvals → render md/html/mp3 → ping → report counts to the lane wrapper.
 */
import { homedir } from "node:os";
import { join } from "node:path";
import { getDb } from "../storage/db.js";
import { addApprovals, expireApprovals, listApprovals, PLACEHOLDER, type NewApproval } from "./approvals.js";
import { remainingBudget, spentToday, DAILY_BUDGET_USD } from "./budget.js";
import { gatherInputs, type BriefInputs } from "./gather.js";
import { synthesize, fallbackSynthesis, type Synthesis } from "./synth.js";
import { verifyProposals, type Fetcher, type Proposal } from "./verify.js";
import { writeBrief, type Brief } from "./render.js";
import { pingSelf } from "./notify.js";
import { writeLaneSummary } from "./summary.js";
import { getMessageMeta, getMessageIdHeader, createReplyDraft } from "../mail/gmail-api.js";
import { previousWorkday, readEod } from "./eod.js";
import { listCommitments, overdue } from "./commitments.js";

export const BRIEF_DIR = process.env.COS_BRIEF_DIR ?? join(homedir(), "Library/Application Support/assistance/briefs");
const MIN_SYNTH_BUDGET = 0.25;
const MAX_SYNTH_BUDGET = 2.0;

export const emailAddress = (from: string) => (from.match(/<([^>]+)>/)?.[1] ?? from).trim().toLowerCase();

export function makeFetcher(inputs: BriefInputs): Fetcher {
  return async (ref) => {
    if (ref.startsWith("gmail:")) {
      const m = await getMessageMeta(ref.slice(6));
      return { from: m.from, subject: m.subject, snippet: m.snippet, threadId: m.threadId };
    }
    if (ref.startsWith("task:")) {
      const t = inputs.tasks.find((x) => `task:${x.id}` === ref);
      return t ? { from: "", subject: t.title, snippet: `${t.notes ?? ""} ${t.due ?? ""}` } : null;
    }
    if (ref.startsWith("cal:")) {
      const c = inputs.calendar.find((x) => x.ref === ref);
      return c ? { from: "", subject: c.title, snippet: `${c.start} ${c.end} ${c.location ?? ""}` } : null;
    }
    return null;
  };
}

export interface MorningResult { brief: Brief; files: { md: string; html: string; mp3: string | null }; ping: string }

export async function runMorning(now = new Date(), deps: { gather?: (now: Date) => Promise<BriefInputs>; fetcher?: (i: BriefInputs) => Fetcher; draft?: typeof createReplyDraft } = {}): Promise<MorningResult> {
  const db = getDb();
  expireApprovals(db, now);
  const inputs = await (deps.gather ?? gatherInputs)(now);
  const escalations: string[] = [];

  // Lane health and input gaps always surface.
  for (const l of inputs.lanes) if (l.state !== "ok") escalations.push(`lane ${l.lane}: ${l.state}${l.last_started_at ? ` (last run ${l.last_started_at})` : " (never ran)"}${l.gaps.length ? ` - ${l.gaps.join("; ")}` : ""}`);
  for (const g of inputs.lane_gaps) if (!inputs.lanes.some((l) => l.lane === g.lane && l.state !== "ok")) escalations.push(`lane ${g.lane} run at ${g.started_at}: ${g.status} - ${g.gaps.join("; ")}`);
  for (const g of inputs.gaps) escalations.push(g);

  // Phase 3: yesterday's end-of-day hand-off and the commitment ledger (AC-18, AC-21).
  const prevDay = previousWorkday(inputs.date);
  const eod = readEod(prevDay);
  if (!eod) escalations.push(`missing_eod: no end-of-day wrap for ${prevDay}`);
  inputs.eod = eod ? { date: eod.date, carry_forward: eod.carry_forward.map((c, i) => ({ text: c.text, ref: `eod:${eod.date}#${i + 1}` })) } : null;
  const openCommitments = listCommitments(db, "open");
  inputs.commitments = openCommitments.map((c) => ({ ref: `commitment:${c.id}`, owner: c.owner, counterparty: c.counterparty, what: c.what, due_at: c.due_at, open_question: c.open_question }));
  for (const c of overdue(db, inputs.date)) escalations.push(`overdue commitment #${c.id}: ${c.owner === "me" ? "you owe" : `${c.counterparty} owes you`} "${c.what}" (due ${c.due_at}) [commitment:${c.id}]`);

  // Budget (D7) and synthesis.
  const remaining = remainingBudget(now);
  let synthesis: Synthesis;
  let cost = 0;
  if (remaining < MIN_SYNTH_BUDGET) {
    synthesis = fallbackSynthesis(inputs, "daily budget reached");
    escalations.push(`budget: $${spentToday(now).toFixed(2)} of $${DAILY_BUDGET_USD.toFixed(2)} spent; model ranking skipped`);
  } else {
    try {
      const r = synthesize(inputs, Math.min(remaining, MAX_SYNTH_BUDGET));
      synthesis = r.synthesis; cost = r.cost_usd ?? 0;
      for (const d of r.dropped) escalations.push(`dropped "${d.item}": ${d.reason}`);
    } catch (e) {
      synthesis = fallbackSynthesis(inputs, "model call failed");
      escalations.push(`synthesis failed: ${(e as Error).message.slice(0, 160)}`);
    }
  }

  // Verify every proposed action against its source (source-or-silence).
  const fetcher = (deps.fetcher ?? makeFetcher)(inputs);
  const { ok, escalations: failed } = await verifyProposals(synthesis.decide, fetcher);
  for (const f of failed) escalations.push(`not verified, held back: "${f.proposal.title}" - ${f.reason}`);

  // Don't queue the same source twice in one day (re-runs are idempotent).
  const already = new Set(listApprovals(db, inputs.date).map((a) => a.source_ref));
  const fresh = ok.filter((p) => !already.has(p.source_ref));
  const toQueue: NewApproval[] = [];
  const draft = deps.draft ?? (process.env.COS_NO_DRAFTS === "1" ? async () => `dry-run-${Date.now()}` : createReplyDraft);
  let draftFailed = 0;
  for (const p of fresh) {
    if (p.kind === "reply" && p.draft_body && PLACEHOLDER.test(p.draft_body)) {
      // A reply that needs information the CoS doesn't have becomes a decision, not a draft.
      toQueue.push({ kind: "decide", title: p.title, detail: `needs your input before replying (${p.draft_body.match(PLACEHOLDER)?.[0]}). ${p.detail ?? ""}`.trim(), risk_tier: "A1", source_ref: p.source_ref, payload: {} });
      continue;
    }
    if (p.kind === "reply") {
      if (!p.source_ref.startsWith("gmail:") || !p.draft_body) { escalations.push(`reply "${p.title}" had no email source or draft text`); draftFailed++; continue; }
      try {
        const id = p.source_ref.slice(6);
        const src = await fetcher(p.source_ref);
        const to = emailAddress(src?.from ?? "");
        const inReplyTo = await getMessageIdHeader(id).catch(() => "");
        const draftId = await draft({ to, subject: src?.subject ?? p.title, body: p.draft_body, threadId: src?.threadId ?? "", inReplyTo });
        toQueue.push({ kind: "reply", title: p.title, detail: p.detail, risk_tier: "A3", source_ref: p.source_ref, payload: { draft_id: draftId, to, draft_body: p.draft_body } });
      } catch (e) {
        escalations.push(`draft for "${p.title}" failed: ${(e as Error).message.slice(0, 120)}`); draftFailed++;
      }
    } else {
      toQueue.push({ kind: p.kind, title: p.title, detail: p.detail, risk_tier: p.kind === "task" ? "A2" : "A1", source_ref: p.source_ref, payload: p.due_quote ? { due_quote: p.due_quote } : {} });
    }
  }
  addApprovals(db, inputs.date, toQueue);
  const decide = listApprovals(db, inputs.date).filter((a) => a.status === "pending");

  // Commitments always show, whatever the model ranked (deterministic, deduped by source_ref).
  const addUnique = (xs: { text: string; source_ref?: string }[], ys: { text: string; source_ref: string }[]) => { for (const y of ys) if (!xs.some((x) => x.source_ref === y.source_ref)) xs.push(y); };
  const in14 = new Date(now.getTime() + 14 * 86400_000).toISOString().slice(0, 10);
  addUnique(synthesis.waiting_on, openCommitments.filter((c) => c.owner === "them").map((c) => ({ text: `${c.counterparty}: ${c.what}${c.due_at ? ` (due ${c.due_at})` : " (no date given)"}`, source_ref: `commitment:${c.id}` })));
  addUnique(synthesis.deadlines, openCommitments.filter((c) => c.owner === "me" && c.due_at && c.due_at >= inputs.date && c.due_at <= in14).map((c) => ({ text: `You to ${c.counterparty}: ${c.what} (due ${c.due_at})`, source_ref: `commitment:${c.id}` })));

  const brief: Brief = {
    date: inputs.date, status: synthesis.status, status_line: synthesis.status_line, decide,
    critical_path: synthesis.critical_path, meetings_prep: synthesis.meetings_prep, replies_owed: synthesis.replies_owed,
    waiting_on: synthesis.waiting_on, deadlines: synthesis.deadlines, fyi: synthesis.fyi, escalations,
    one_first_move: synthesis.one_first_move, cost_today_usd: spentToday(now) + cost, budget_usd: DAILY_BUDGET_USD,
  };
  if (brief.status === "CLEAR" && escalations.length) brief.status = "WATCH";
  const files = writeBrief(brief, BRIEF_DIR);

  const pingText = `Brief ${brief.date}: ${brief.status} · ${decide.length} to decide${escalations.length ? ` · ${escalations.length} escalation(s)` : ""}. First move: ${brief.one_first_move}`.slice(0, 300);
  const ping = await pingSelf(`${pingText}\n${files.html}`, `Morning brief ${brief.date}: ${brief.status}`);

  writeLaneSummary({
    items_in: synthesis.decide.length,
    items_out: { queued: toQueue.length, not_verified: failed.length, already_queued: ok.length - fresh.length, draft_failed: draftFailed },
    artifacts: [files.md, files.html, ...(files.mp3 ? [files.mp3] : [])],
    status: ping.channel === "none" && process.env.COS_NO_PING !== "1" ? "partial" : "ok",
    gaps: ping.error ? [`ping: ${ping.error}`] : [],
    cost_usd: cost,
  });
  return { brief, files, ping: ping.channel + (ping.error ? ` (${ping.error})` : "") };
}
