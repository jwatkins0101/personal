// gates: commitments-dates (AC-18), commitment-close (AC-19), dedupe (AC-20), eod-handoff (AC-21), weekly-shape (AC-22).
// Hermetic: temp DB, ledger, EOD, brief and weekly dirs; fixture inputs; stubbed evidence checks. Never touches real mail.
import { mkdtempSync, readFileSync, existsSync, rmSync, mkdirSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const which = process.argv[2];
const tmp = mkdtempSync(join(tmpdir(), "cos-p3-"));
Object.assign(process.env, {
  DB_PATH: join(tmp, "db.sqlite"), COS_LEDGER_DIR: join(tmp, "ledger"), COS_EOD_DIR: join(tmp, "eod"),
  COS_BRIEF_DIR: join(tmp, "briefs"), COS_WEEKLY_DIR: join(tmp, "weekly"), COS_NO_PING: "1", COS_NO_AUDIO: "1",
  COS_SYNTH_FIXTURE: resolve("tests/fixtures/cos/synthesis.json"), COS_EOD_FIXTURE: resolve("tests/fixtures/cos/eod-extraction.json"),
});
const imp = async <T>(envKey: string, def: string): Promise<T> => import(pathToFileURL(resolve(process.env[envKey] ?? def)).href) as Promise<T>;
let fail = 0;
const check = (ok: boolean, label: string) => { console.log(`${ok ? "PASS" : "FAIL"} ${label}`); if (!ok) fail = 1; };
const thu = new Date(2026, 8, 24, 14, 0);

try {
  const { getDb } = await import("../../src/storage/db.ts");
  const db = getDb();
  if (which === "commitments-dates") {
    const d = await imp<typeof import("../../src/cos/dates.ts")>("DATES_MODULE", "src/cos/dates.ts");
    const cases: [string, string | null][] = [["by Friday", "2026-09-25"], ["10/2", "2026-10-02"], ["Oct 2", "2026-10-02"], ["tomorrow", "2026-09-25"],
      ["next next week", null], ["soon", null], ["next week", null], ["next Friday", null], ["ASAP", null]];
    for (const [q, want] of cases) check(d.resolveDue(q, thu).due_at === want, `"${q}" from a Thursday source -> ${want ?? "undated"}`);
    const { runEod } = await import("../../src/cos/eod.ts");
    const inputs = JSON.parse(readFileSync("tests/fixtures/cos/eod-inputs.json", "utf8"));
    const r = await runEod(new Date(2026, 8, 24, 17, 30), { gather: async () => inputs, checker: () => async () => true });
    const { listCommitments } = await import("../../src/cos/commitments.ts");
    const dana = listCommitments(db, "open").filter((c) => c.counterparty === "Dana Client");
    const vague = dana.find((c) => c.what === "Send the signed SOW");
    check(!!vague && vague.due_at === null && /next next week/.test(vague.open_question ?? ""), "vague 'next next week' stored undated with an open question");
    const wrongQuote = dana.find((c) => c.what === "Wrong quote test");
    check(!!wrongQuote && wrongQuote.due_at === null && r.record.gaps.some((g) => /"October 9" not found in gmail:r1/.test(g)), "a due quote not in the source is not used");
    check(listCommitments(db, "open").every((c) => c.source_ref.length > 0), "every commitment keeps its source_ref");
  } else if (which === "commitment-close") {
    const m = await imp<typeof import("../../src/cos/commitments.ts")>("COMMITMENTS_MODULE", "src/cos/commitments.ts");
    const a = m.upsertCommitment(db, { owner: "me", counterparty: "Jason", what: "Send the deck", due_quote: "by Friday", source_ref: "gmail:s1", source_date: thu }).commitment;
    const ok = async () => true, no = async () => false;
    const refused = async (p: Promise<unknown>, re: RegExp) => p.then(() => false, (e: Error) => re.test(e.message));
    check(await refused(m.closeCommitment(db, a.id, "", ok), /needs evidence/), "no evidence: refused");
    check(await refused(m.closeCommitment(db, a.id, "I did it", ok), /needs evidence/), "free-text evidence: refused");
    check(await refused(m.closeCommitment(db, a.id, "gmail:unknown", no), /could not be confirmed/), "unconfirmed evidence: refused");
    check(m.listCommitments(db, "open").some((c) => c.id === a.id), "still open after refusals");
    const c = await m.closeCommitment(db, a.id, "gmail:sent123", ok);
    check(c.status === "closed" && c.closed_evidence === "gmail:sent123", "confirmed sent message closes it, evidence recorded");
    check(await refused(m.closeCommitment(db, a.id, "gmail:sent123", ok), /already closed/), "double close refused");
  } else if (which === "dedupe") {
    const m = await imp<typeof import("../../src/cos/commitments.ts")>("COMMITMENTS_MODULE", "src/cos/commitments.ts");
    m.upsertCommitment(db, { owner: "me", counterparty: "Jason Nguyen <jason@acme.com>", what: "Send Jason the deck", due_quote: "by Friday", source_ref: "gmail:s1", source_date: thu });
    const r2 = m.upsertCommitment(db, { owner: "me", counterparty: "Jason N", what: "send the deck", due_quote: "friday", source_ref: "sms:101", source_date: thu });
    check(r2.action === "merged", "same promise by SMS merges into the email one");
    const open = m.listCommitments(db, "open");
    check(open.length === 1 && open[0].source_refs.length === 2, "one commitment, both sources kept");
    m.upsertCommitment(db, { owner: "me", counterparty: "Jason N", what: "Book the conference room", source_ref: "sms:102", source_date: thu });
    m.upsertCommitment(db, { owner: "them", counterparty: "Jason N", what: "Send the deck", source_ref: "sms:103", source_date: thu });
    check(m.listCommitments(db, "open").length === 3, "different promise, or the other direction, stays separate");
  } else if (which === "eod-handoff") {
    const eodMod = await imp<typeof import("../../src/cos/eod.ts")>("EOD_MODULE", "src/cos/eod.ts");
    const inputs = JSON.parse(readFileSync("tests/fixtures/cos/eod-inputs.json", "utf8"));
    await eodMod.runEod(new Date(2026, 8, 24, 17, 30), { gather: async () => inputs, checker: () => async () => true });
    const eodFile = join(process.env.COS_EOD_DIR!, "2026-09-24.json");
    check(existsSync(eodFile), "EOD writes eod/2026-09-24.json");
    const rec = existsSync(eodFile) ? JSON.parse(readFileSync(eodFile, "utf8")) : null;
    check(!!rec && rec.carry_forward.length === 1 && rec.slipped.length === 0 && rec.gaps.some((g: string) => /unknown source gmail:ghost/.test(g)), "carry-forward kept; invented item dropped with a gap");
    const { runMorning } = await import("../../src/cos/morning.ts");
    const morningInputs = JSON.parse(readFileSync("tests/fixtures/cos/../cos/inputs.json", "utf8"));
    const fetcher = () => async () => null;
    const fri = await runMorning(new Date(2026, 8, 25, 7, 30), { gather: async () => ({ ...morningInputs, date: "2026-09-25" }), fetcher, draft: async () => "d" });
    check(!fri.brief.escalations.some((e) => /missing_eod/.test(e)), "Friday's brief found Thursday's EOD");
    check(fri.brief.deadlines.some((x) => /deck/i.test(x.text) && x.source_ref?.startsWith("commitment:")), "your open commitment shows under Deadlines");
    check(fri.brief.waiting_on.some((x) => /signed SOW/.test(x.text) && /no date given/.test(x.text)), "their undated promise shows under Waiting on");
    const tue = await runMorning(new Date(2026, 8, 29, 7, 30), { gather: async () => ({ ...morningInputs, date: "2026-09-29" }), fetcher, draft: async () => "d" });
    check(tue.brief.escalations.some((e) => /missing_eod: no end-of-day wrap for 2026-09-28/.test(e)), "no Monday EOD: Tuesday's brief escalates missing_eod");
    check(tue.brief.escalations.some((e) => /overdue commitment #\d+: you owe "Send Jason the deck" \(due 2026-09-25\)/.test(e)), "past-due commitment escalates as a dropped ball");
  } else if (which === "weekly-shape") {
    const w = await imp<typeof import("../../src/cos/weekly.ts")>("WEEKLY_MODULE", "src/cos/weekly.ts");
    const { upsertCommitment } = await import("../../src/cos/commitments.ts");
    const charterBefore = createHash("sha256").update(readFileSync("cos/CLAUDE.md")).digest("hex");
    const fri = new Date(2026, 8, 25, 15, 0);
    const ins = db.prepare(`INSERT INTO cos_approvals (brief_date, day_index, kind, title, risk_tier, source_ref, status, created_at, expires_at, decided_at, result)
      VALUES (?,?,?,?,?,?,?,?,?,?,?)`);
    let n = 0;
    for (let day = 0; day < 25; day++) { // 25 clean task approvals across the last month
      const d = new Date(2026, 8, 25 - day); const ds = d.toISOString().slice(0, 10);
      ins.run(ds, ++n, "task", `t${n}`, "A2", `task:${n}`, "approved", `${ds} 11:30:00`, `${ds}T23:59:59Z`, `${ds}T13:30:00.000Z`, "task:x");
    }
    ins.run("2026-09-24", ++n, "reply", "edited reply", "A3", "gmail:e", "sent", "2026-09-24 11:30:00", "2026-09-24T23:59:59Z", "2026-09-24T12:30:00.000Z", "gmail:z;edited");
    ins.run("2026-09-23", ++n, "reply", "swap", "A3", "gmail:f", "failed", "2026-09-23 11:30:00", "2026-09-23T23:59:59Z", "2026-09-23T12:00:00.000Z", "recipient changed: x");
    upsertCommitment(db, { owner: "me", counterparty: "Jason", what: "Send the deck", due_quote: "9/21", source_ref: "gmail:s1", source_date: new Date(2026, 8, 18) });
    mkdirSync(process.env.COS_LEDGER_DIR!, { recursive: true });
    writeFileSync(join(process.env.COS_LEDGER_DIR!, "inbox.jsonl"), JSON.stringify({ lane: "inbox", run_id: "1", status: "ok", started_at: new Date(2026, 8, 24).toISOString(), finished_at: new Date(2026, 8, 24).toISOString(), items_in: null, items_out: null, artifacts: [], findings: [], proposed_actions: [], open_questions: [], gaps: [], cost_usd: 1.25 }) + "\n");
    const sc = w.buildScorecard(db, [{ lane: "inbox", schedule: { days: [1], times: ["07:00"] }, grace_minutes: 30 }], fri);
    check(sc.week === "2026-W39", "ISO week label");
    check(sc.dropped_balls.count === 1 && /Send the deck \(due 2026-09-21\)/.test(sc.dropped_balls.items[0] ?? ""), "dropped ball counted (open, past due)");
    check(sc.caught_errors.approvals_failed === 1 && sc.caught_errors.refused_sends === 1, "failed approval and refused send counted as caught errors");
    check(sc.approvals.created === 9 && sc.approvals.unchanged_rate === 0.88, "approvals this week and unchanged rate (7/8; the edited send doesn't count)");
    check(sc.decision_latency_hours.median === 2, "median decision latency in hours");
    check(sc.cost_usd === 1.25, "cost from lane ledgers");
    check(sc.promotion_candidates.length === 1 && /^task: 25 approved unchanged/.test(sc.promotion_candidates[0]), "task kind listed as promotion candidate (25 clean, 0 corrections); reply is not");
    const f = w.writeScorecard(sc);
    const md = readFileSync(f.md, "utf8");
    check(["Dropped balls", "Caught errors", "Approvals per day", "Approved unchanged", "Decision latency", "Cost"].every((k) => md.includes(k)), "scorecard has all metrics");
    check(/never changes automatically/.test(md) && createHash("sha256").update(readFileSync("cos/CLAUDE.md")).digest("hex") === charterBefore, "autonomy not changed by the review");
  } else check(false, `unknown gate ${which}`);
} catch (e) {
  check(false, `threw: ${(e as Error).message}`);
} finally {
  rmSync(tmp, { recursive: true, force: true });
}
process.exit(fail);
