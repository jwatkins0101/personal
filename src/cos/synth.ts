/**
 * One charter-bound, tool-less Claude call turns the gathered inputs into the brief's content.
 * COS_SYNTH_FIXTURE substitutes a canned response (gates). Items citing a source that is not in
 * the inputs are dropped to Escalations: the model cannot invent a source_ref.
 */
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { buildCosClaudeArgs } from "./claude.js";
import { parseClaudeJsonOutput } from "../claude/result.js";
import type { BriefInputs } from "./gather.js";
import type { Proposal } from "./verify.js";

export interface Line { text: string; source_ref?: string }
export interface Synthesis {
  status: "CLEAR" | "WATCH" | "CRITICAL";
  status_line: string;
  decide: Proposal[];
  critical_path: Line[];
  meetings_prep: Line[];
  replies_owed: Line[];
  waiting_on: Line[];
  deadlines: (Line & { date_quote?: string })[];
  fyi: Line[];
  one_first_move: string;
}

export interface SynthResult { synthesis: Synthesis; cost_usd: number | null; dropped: { item: string; reason: string }[] }

const PROMPT = (inputs: BriefInputs) => `You are writing Jermaine's morning brief for ${inputs.date}. Use ONLY the inputs below.

Return ONLY a JSON object with exactly these keys:
{
 "status": "CLEAR" | "WATCH" | "CRITICAL",
 "status_line": "one sentence: why this status",
 "decide": [ up to 5 items that need his yes/no today:
   {"kind":"reply"|"decide"|"task", "title":"...", "detail":"one line of context",
    "source_ref":"gmail:<id> | task:<id> | cal:<ref>",
    "claimed_from":"sender name or address exactly as in the input's from field (gmail only)",
    "due_quote":"ONLY if a date or deadline matters: the exact words from the subject or snippet, copied verbatim; otherwise omit",
    "draft_body":"reply only: a short, plain-text reply in his voice; no signature beyond 'Jermaine'"} ],
 "critical_path": [ up to 5 {"text":"...","source_ref":"..."} ranked by importance, not urgency ],
 "meetings_prep": [ {"text":"...","source_ref":"cal:..."} only meetings that need prep ],
 "replies_owed": [ {"text":"...","source_ref":"gmail:..."} ],
 "waiting_on": [ {"text":"...","source_ref":"..."} ],
 "deadlines": [ {"text":"...","date_quote":"verbatim date words","source_ref":"..."} next 7-14 days only ],
 "fyi": [ {"text":"...","source_ref":"yt:brief | deals:brief | gmail:..."} ],
 "one_first_move": "the single first thing to do"
}

Rules:
- Every item must carry a source_ref that appears in the inputs (gmail:<inbox id>, task:<task id>, cal:<calendar ref>, lane:<lane>, yt:brief, deals:brief).
- "reply" only for a real person's email you can answer completely in plain text right now. NEVER use placeholders like [link], [date] or [status]: if the answer needs information, a file, an attachment, money, or personal/financial/health documents, make it a "decide" item describing what is needed instead.
- "reply" only for a real person's email that needs an answer. Never propose sending anything else; never propose payments, purchases, sign-ups or calendar changes as actions (surface them as "decide").
- Never infer a date from vague words. If a date matters and the source doesn't state it, leave due_quote out and say "no date given".
- Failed or stale lanes and input gaps are not your job to explain; the system lists them under Escalations.
- Be brief. No item longer than 20 words except draft_body.

INPUTS:
${JSON.stringify(inputs, null, 1)}`;

function knownRefs(inputs: BriefInputs): Set<string> {
  const s = new Set<string>(["yt:brief", "deals:brief"]);
  inputs.inbox.forEach((m) => s.add(`gmail:${m.id}`));
  inputs.tasks.forEach((t) => s.add(`task:${t.id}`));
  inputs.calendar.forEach((c) => s.add(c.ref));
  inputs.lanes.forEach((l) => s.add(`lane:${l.lane}`));
  return s;
}

export function sanitize(raw: Synthesis, inputs: BriefInputs): { synthesis: Synthesis; dropped: SynthResult["dropped"] } {
  const refs = knownRefs(inputs);
  const dropped: SynthResult["dropped"] = [];
  const keep = <T extends { source_ref?: string; text?: string; title?: string }>(xs: T[] | undefined, required: boolean): T[] =>
    (xs ?? []).filter((x) => {
      const ok = x.source_ref ? refs.has(x.source_ref) : !required;
      if (!ok) dropped.push({ item: x.title ?? x.text ?? "(item)", reason: x.source_ref ? `unknown source ${x.source_ref}` : "no source_ref" });
      return ok;
    });
  const status = ["CLEAR", "WATCH", "CRITICAL"].includes(raw.status) ? raw.status : "WATCH";
  return {
    dropped,
    synthesis: {
      status, status_line: String(raw.status_line ?? ""),
      decide: keep(raw.decide, true).slice(0, 5),
      critical_path: keep(raw.critical_path, true).slice(0, 5),
      meetings_prep: keep(raw.meetings_prep, true),
      replies_owed: keep(raw.replies_owed, true),
      waiting_on: keep(raw.waiting_on, true),
      deadlines: keep(raw.deadlines, true),
      fyi: keep(raw.fyi, false),
      one_first_move: String(raw.one_first_move ?? ""),
    },
  };
}

/** Deterministic brief content used when the budget is exhausted or the model call fails. */
export function fallbackSynthesis(inputs: BriefInputs, why: string): Synthesis {
  return {
    status: "WATCH", status_line: `Ranking skipped: ${why}. Showing raw inputs.`,
    decide: [],
    critical_path: inputs.inbox.filter((m) => m.starred).slice(0, 5).map((m) => ({ text: `${m.subject} (${m.from})`, source_ref: `gmail:${m.id}` })),
    meetings_prep: inputs.calendar.filter((c) => c.day === "today" && !c.all_day).map((c) => ({ text: `${c.start} ${c.title}`, source_ref: c.ref })),
    replies_owed: inputs.inbox.slice(0, 8).map((m) => ({ text: `${m.subject} (${m.from})`, source_ref: `gmail:${m.id}` })),
    waiting_on: [], deadlines: [], fyi: [], one_first_move: "Read the inbox list below.",
  };
}

export function synthesize(inputs: BriefInputs, maxBudgetUsd: number): SynthResult {
  if (process.env.COS_SYNTH_FIXTURE) {
    const raw = JSON.parse(readFileSync(process.env.COS_SYNTH_FIXTURE, "utf8")) as Synthesis;
    const s = sanitize(raw, inputs);
    return { synthesis: s.synthesis, cost_usd: 0, dropped: s.dropped };
  }
  const args = [...buildCosClaudeArgs({ maxBudgetUsd }), "--tools", ""];
  const env = { ...process.env }; delete env.CLAUDECODE;
  const res = spawnSync("claude", args, { input: PROMPT(inputs), encoding: "utf8", env, maxBuffer: 50 * 1024 * 1024, timeout: 600_000 });
  if (res.status !== 0) throw new Error(`claude exited ${res.status}: ${(res.stderr ?? "").slice(0, 300)}`);
  const out = parseClaudeJsonOutput(res.stdout);
  if (out.isError) throw new Error(`claude returned an error: ${out.text.slice(0, 300)}`);
  const m = out.text.match(/\{[\s\S]*\}/);
  if (!m) throw new Error("synthesis was not JSON");
  const s = sanitize(JSON.parse(m[0]) as Synthesis, inputs);
  return { synthesis: s.synthesis, cost_usd: out.costUsd, dropped: s.dropped };
}
