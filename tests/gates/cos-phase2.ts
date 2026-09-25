// gates: brief-shape (AC-12), verify-source (AC-13), approvals (AC-14), budget (AC-16).
// Hermetic: temp DB, temp ledger, temp brief dir, fixture inputs and synthesis, stubbed Gmail. Never touches real mail.
import { mkdtempSync, readFileSync, existsSync, statSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const which = process.argv[2];
const tmp = mkdtempSync(join(tmpdir(), "cos-p2-"));
process.env.DB_PATH = join(tmp, "db.sqlite");
process.env.COS_BRIEF_DIR = join(tmp, "briefs");
process.env.COS_LEDGER_DIR = join(tmp, "ledger");
process.env.COS_NO_PING = "1";
process.env.COS_SYNTH_FIXTURE = resolve("tests/fixtures/cos/synthesis.json");
const imp = async <T>(envKey: string, def: string): Promise<T> => import(pathToFileURL(resolve(process.env[envKey] ?? def)).href) as Promise<T>;

let fail = 0;
const check = (ok: boolean, label: string) => { console.log(`${ok ? "PASS" : "FAIL"} ${label}`); if (!ok) fail = 1; };
const inputs = JSON.parse(readFileSync("tests/fixtures/cos/inputs.json", "utf8"));
const sources: Record<string, { from: string; subject: string; snippet: string; threadId: string }> = {
  "gmail:m1": { from: "Dana Client <dana@clientco.com>", subject: "SOW revisions - review by Friday 10/2", snippet: "Can you review and sign off by Friday 10/2?", threadId: "th1" },
  "gmail:m2": { from: "Andrew Wright <andrew.wright@louisville.edu>", subject: "AACSB Faculty Qualifications", snippet: "Please reply with your status.", threadId: "th2" },
};
const fetcher = () => async (ref: string) => sources[ref] ?? null;

try {
  if (which === "brief-shape") {
    const render = await imp<typeof import("../../src/cos/render.ts")>("RENDER_MODULE", "src/cos/render.ts");
    const { SECTION_ORDER } = await import("../../src/cos/render.ts");
    const { sanitize } = await import("../../src/cos/synth.ts");
    const s = sanitize(JSON.parse(readFileSync(process.env.COS_SYNTH_FIXTURE!, "utf8")), inputs);
    check(s.dropped.some((d) => d.reason === "unknown source gmail:nope") && s.dropped.some((d) => d.reason === "unknown source gmail:ghost"), "items citing sources not in the inputs are dropped");
    const brief = { date: "2026-09-25", status: "WATCH" as const, status_line: "x",
      decide: [{ id: 1, brief_date: "2026-09-25", day_index: 1, kind: "reply" as const, title: "Confirm SOW", detail: "", risk_tier: "A3" as const, source_ref: "gmail:m1", payload: { draft_body: "Hi" }, status: "pending" as const, expires_at: "", decided_at: null, result: null }],
      critical_path: s.synthesis.critical_path, meetings_prep: s.synthesis.meetings_prep, replies_owed: s.synthesis.replies_owed,
      waiting_on: [], deadlines: s.synthesis.deadlines, fyi: [], escalations: ["lane yt: stale"], one_first_move: "Review the SOW.", cost_today_usd: 0.5, budget_usd: 5 };
    const f = render.writeBrief(brief, join(tmp, "briefs"));
    const md = readFileSync(f.md, "utf8"), html = readFileSync(f.html, "utf8");
    const mdOrder = [...md.matchAll(/^## (.+)$/gm)].map((m) => m[1]);
    const htmlOrder = [...html.matchAll(/data-section="([^"]+)"/g)].map((m) => m[1]);
    check(JSON.stringify(mdOrder) === JSON.stringify([...SECTION_ORDER]), "markdown sections in charter order");
    check(JSON.stringify(htmlOrder) === JSON.stringify([...SECTION_ORDER]), "html sections in charter order");
    check(/lane yt: stale/.test(md), "escalations rendered");
    const decideBlock = md.split("## Decide")[1].split("## Critical path")[0];
    check([...decideBlock.matchAll(/^\*\*\d+\.\*\*/gm)].length === 1 && /\[gmail:m1\]/.test(decideBlock), "every Decide item carries its source_ref");
    check(!!f.mp3 && existsSync(f.mp3) && statSync(f.mp3).size > 0 && html.includes(`src="2026-09-25.mp3"`), "mp3 generated and embedded");
    check(/data-s="0.75"/.test(html) && /data-s="2"/.test(html) && /preservesPitch/.test(html), "speed control 0.75x-2x with pitch preserved");
  } else if (which === "verify-source") {
    const v = await imp<typeof import("../../src/cos/verify.ts")>("VERIFY_MODULE", "src/cos/verify.ts");
    const r = await v.verifyProposals([
      { kind: "reply", title: "ok", source_ref: "gmail:m1", claimed_from: "Dana Client", due_quote: "Friday 10/2" },
      { kind: "decide", title: "date mismatch", source_ref: "gmail:m1", claimed_from: "Dana Client", due_quote: "Monday 10/5" },
      { kind: "decide", title: "wrong sender", source_ref: "gmail:m2", claimed_from: "Dana Client" },
      { kind: "decide", title: "missing source", source_ref: "gmail:gone" },
    ], fetcher());
    const reasons = Object.fromEntries(r.escalations.map((e) => [e.proposal.title, e.reason]));
    check(r.ok.length === 1 && r.ok[0].title === "ok", "matching proposal passes");
    check(/date not in source/.test(reasons["date mismatch"] ?? ""), "date that isn't in the source goes to Escalations");
    check(/sender mismatch/.test(reasons["wrong sender"] ?? ""), "wrong sender goes to Escalations");
    check(/could not re-fetch/.test(reasons["missing source"] ?? ""), "unfetchable source goes to Escalations");
  } else if (which === "approvals") {
    const a = await imp<typeof import("../../src/cos/approvals.ts")>("APPROVALS_MODULE", "src/cos/approvals.ts");
    const { getDb } = await import("../../src/storage/db.ts");
    const db = getDb();
    const sent: string[] = []; const tasks: string[] = [];
    let draft = { to: "dana@clientco.com", subject: "Re: SOW", body: "Hi Dana, signed.\n\nJermaine" };
    const ex = { readDraft: async () => draft, sendDraft: async (id: string) => { sent.push(id); return `sent-${id}`; }, createTask: async (t: string) => { tasks.push(t); return "task-1"; } };
    const d = "2026-09-25", day = new Date(2026, 8, 25, 9, 0);
    a.addApprovals(db, d, [
      { kind: "reply", title: "SOW", risk_tier: "A3", source_ref: "gmail:m1", payload: { draft_id: "d1", to: "dana@clientco.com" } },
      { kind: "decide", title: "Pay Ecotech?", risk_tier: "A1", source_ref: "gmail:m3" },
      { kind: "task", title: "Renew registration", risk_tier: "A2", source_ref: "task:t1" },
      { kind: "reply", title: "Hijacked", risk_tier: "A3", source_ref: "gmail:m4", payload: { draft_id: "d2", to: "friend@x.com" } },
      { kind: "reply", title: "Placeholder", risk_tier: "A3", source_ref: "gmail:m5", payload: { draft_id: "d3", to: "dana@clientco.com" } },
      { kind: "reply", title: "Left unanswered", risk_tier: "A3", source_ref: "gmail:m6", payload: { draft_id: "d4", to: "dana@clientco.com" } },
      { kind: "decide", title: "Skip me", risk_tier: "A1", source_ref: "gmail:m7" },
    ]);
    const printed: string[] = [];
    check(/Sent to dana@clientco.com/.test(await a.send(db, ex, d, 1, day, (s) => printed.push(s))) && sent.join() === "d1", "send 1 sends exactly that draft");
    check(printed.some((p) => p.includes("To: dana@clientco.com") && p.includes("Hi Dana, signed.")), "send shows final recipient and body first");
    check(/Recorded/.test(await a.approve(db, ex, d, 2, day)), "approve records a decision");
    check(/Task created/.test(await a.approve(db, ex, d, 3, day)) && tasks[0] === "Renew registration", "approve creates the task");
    draft = { to: "attacker@evil.com", subject: "Re: x", body: "hi" };
    await a.send(db, ex, d, 4, day, () => {}).then(() => check(false, "recipient swap refused"), (e) => check(/Refused/.test(e.message) && sent.length === 1, "recipient swap refused, nothing sent"));
    draft = { to: "dana@clientco.com", subject: "Re: x", body: "My status is [SA/PA]" };
    await a.send(db, ex, d, 5, day, () => {}).then(() => check(false, "placeholder refused"), (e) => check(/placeholder/.test(e.message) && sent.length === 1, "placeholder draft refused, nothing sent"));
    check(/Skipped: Skip me/.test(a.skip(db, d, 7, day)) && a.listApprovals(db, d).find((x) => x.day_index === 7)?.status === "skipped", "skip closes the item");
    const after = new Date(2026, 8, 26, 0, 1);
    draft = { to: "dana@clientco.com", subject: "Re: x", body: "fine" };
    await a.send(db, ex, d, 6, after, () => {}).then(() => check(false, "expired item refused"), (e) => check(/expired/.test(e.message) && sent.length === 1, "after 23:59 the item is expired and nothing is sent"));
    check(a.listApprovals(db, d).find((x) => x.day_index === 6)?.status === "expired", "expired status recorded");
  } else if (which === "budget") {
    const { mkdirSync } = await import("node:fs");
    mkdirSync(process.env.COS_LEDGER_DIR!, { recursive: true });
    const now = new Date(2026, 8, 25, 7, 30);
    const rec = (started: Date, cost: number) => JSON.stringify({ lane: "inbox", run_id: String(cost), status: "ok", started_at: started.toISOString(), finished_at: started.toISOString(),
      items_in: null, items_out: null, artifacts: [], findings: [], proposed_actions: [], open_questions: [], gaps: [], cost_usd: cost });
    writeFileSync(join(process.env.COS_LEDGER_DIR!, "inbox.jsonl"), [rec(new Date(2026, 8, 25, 7, 0), 4.9), rec(new Date(2026, 8, 24, 20, 0), 3)].join("\n") + "\n");
    const b = await import("../../src/cos/budget.ts");
    check(Math.abs(b.spentToday(now) - 4.9) < 1e-9, "only today's spend counts ($4.90, not yesterday's $3)");
    process.env.COS_NO_AUDIO = "1";
    const { runMorning } = await import("../../src/cos/morning.ts");
    const r = await runMorning(now, { gather: async () => inputs, fetcher, draft: async () => "draft-x" });
    check(/budget reached/.test(r.brief.status_line) && r.brief.escalations.some((e) => /^budget: \$4\.90 of \$5\.00/.test(e)), "over budget: model skipped and escalated");
    check(r.brief.decide.length === 0, "no actions proposed without the model");
    check(r.brief.escalations.some((e) => /lane yt: stale/.test(e)) && r.brief.escalations.some((e) => /Google Tasks unavailable/.test(e)), "stale lanes and input gaps still escalate");
  } else check(false, `unknown gate ${which}`);
} catch (e) {
  check(false, `threw: ${(e as Error).message}`);
} finally {
  rmSync(tmp, { recursive: true, force: true });
}
process.exit(fail);
