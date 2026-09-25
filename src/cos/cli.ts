/**
 * Chief of Staff CLI: npm run cos -- <command>
 *   health            lane heartbeat report (AC-10); exits 1 when any lane is stale or failing
 *   morning           build today's brief (AC-12..16)
 *   queue [date]      list today's Decide items
 *   approve N | send N | skip N [--date YYYY-MM-DD]
 *   eod               end-of-day wrap + commitment ledger update (AC-18..21)
 *   weekly            Friday scorecard (AC-22)
 *   commitments       list open commitments
 *   close ID EVIDENCE close a commitment with evidence (gmail:/sms:/cal:/task:)
 *   board             run the live task board on http://127.0.0.1:8787 (launchd keeps it up)
 *   board-url         print the board URL (with its local token)
 *   agent-run JOB     run one "hand to agent" job (spawned by the board)
 *   agent-jobs        list recent agent jobs
 *   accounts          verify each Google account profile (who is really signed in)
 */
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { laneHealth, type LaneConfig } from "../../cos/lib/ledger.mjs";
import { getDb } from "../storage/db.js";
import { approve, send, skip, listApprovals, expireApprovals, localDate } from "./approvals.js";
import { realExecutors } from "./executors.js";

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const LANES_PATH = process.env.COS_LANES_PATH ?? resolve(REPO_ROOT, "cos/lanes.json");

function health(): number {
  const config = JSON.parse(readFileSync(LANES_PATH, "utf8")) as { lanes: LaneConfig[] };
  const now = process.env.COS_NOW ? new Date(process.env.COS_NOW) : new Date();
  const rows = laneHealth(config, now, process.env.COS_LEDGER_DIR);
  const icon = { ok: "OK   ", partial: "PART ", failing: "FAIL ", stale: "STALE" } as const;
  for (const r of rows) {
    const last = r.last_started_at ? `${r.last_started_at} (${r.last_status})` : "never";
    const extra = r.state === "stale" ? ` expected by ${r.expected_since}` : r.gaps.length ? ` gaps: ${r.gaps.join("; ")}` : "";
    console.log(`${icon[r.state]} ${r.lane.padEnd(12)} last=${last}${extra}`);
  }
  const bad = rows.filter((r) => r.state === "stale" || r.state === "failing");
  console.log(bad.length ? `\n${bad.length} lane(s) need attention` : "\nall lanes healthy");
  return bad.length ? 1 : 0;
}

async function main(): Promise<number> {
  const argv = process.argv.slice(2);
  const [cmd, arg] = argv;
  const date = argv.includes("--date") ? argv[argv.indexOf("--date") + 1] : localDate();
  const n = Number(arg);
  switch (cmd) {
    case "health":
      return health();
    case "morning": {
      const { runMorning } = await import("./morning.js");
      const r = await runMorning();
      console.log(`brief: ${r.files.html}\nstatus: ${r.brief.status} · decide: ${r.brief.decide.length} · escalations: ${r.brief.escalations.length} · ping: ${r.ping}`);
      return 0;
    }
    case "eod": {
      const { runEod } = await import("./eod.js");
      const r = await runEod();
      const c = r.record.commitments;
      console.log(`eod: ${r.path}\ndone ${r.record.done.length} · slipped ${r.record.slipped.length} · commitments +${c.created.length} new, ${c.merged.length} merged, ${c.closed.length} closed, ${c.open_count} open · gaps ${r.record.gaps.length}`);
      return 0;
    }
    case "weekly": {
      const { buildScorecard, writeScorecard } = await import("./weekly.js");
      const { pingSelf } = await import("./notify.js");
      const { writeLaneSummary } = await import("./summary.js");
      const config = JSON.parse(readFileSync(LANES_PATH, "utf8")) as { lanes: LaneConfig[] };
      const sc = buildScorecard(getDb(), config.lanes);
      const f = writeScorecard(sc);
      writeLaneSummary({ items_in: 1, items_out: { scorecard: 1 }, artifacts: [f.md, f.json], cost_usd: 0 });
      await pingSelf(`Weekly review ${sc.week}: ${sc.dropped_balls.count} dropped balls, ${sc.caught_errors.count} caught errors, ${sc.approvals.per_day} approvals/day, $${sc.cost_usd.toFixed(2)}.\n${f.md}`, `Weekly review ${sc.week}`);
      console.log(`weekly: ${f.md}`);
      return 0;
    }
    case "commitments": {
      const { listCommitments } = await import("./commitments.js");
      const rows = listCommitments(getDb(), "open");
      if (!rows.length) console.log("No open commitments.");
      for (const c of rows) console.log(`#${c.id} [${c.owner}] ${c.counterparty}: ${c.what} · due ${c.due_at ?? "?"}${c.open_question ? ` · ${c.open_question}` : ""} (${c.source_refs.join(", ")})`);
      return 0;
    }
    case "close": {
      const { closeCommitment } = await import("./commitments.js");
      const { makeEvidenceChecker } = await import("./eod.js");
      const ev = argv[2];
      try {
        const c = await closeCommitment(getDb(), n, ev, makeEvidenceChecker({ date: date, sources: [], approvals_today: [], open_commitments: [], gaps: [] }));
        console.log(`Closed #${c.id}: ${c.what} (evidence ${c.closed_evidence})`); return 0;
      } catch (e) { console.error((e as Error).message); return 1; }
    }
    case "board": {
      const { createBoardServer, loadOrCreateToken, BOARD_PORT } = await import("./board.js");
      const { makeEvidenceChecker } = await import("./eod.js");
      const { listCompletedSince } = await import("../tasks/google-tasks.js");
      const config = JSON.parse(readFileSync(LANES_PATH, "utf8")) as { lanes: LaneConfig[] };
      const token = loadOrCreateToken();
      const server = createBoardServer({
        db: getDb(), lanes: config.lanes, executors: realExecutors,
        checker: makeEvidenceChecker({ date, sources: [], approvals_today: [], open_commitments: [], gaps: [] }),
        tasksCompletedSince: listCompletedSince,
        replied: (await import("./replied.js")).repliedAfter,
        startAgent: (id: number) => { void import("./agent.js").then((a) => a.spawnJobRunner(id)); },
      }, token, BOARD_PORT);
      await new Promise<void>((res) => server.listen(BOARD_PORT, "127.0.0.1", res));
      console.log(`board: http://127.0.0.1:${BOARD_PORT}/?t=${token}`);
      return new Promise<number>(() => {}); // run until launchd stops it
    }
    case "board-url": {
      const { loadOrCreateToken, BOARD_PORT } = await import("./board.js");
      console.log(`http://127.0.0.1:${BOARD_PORT}/?t=${loadOrCreateToken()}`);
      return 0;
    }
    case "agent-run": {
      const a = await import("./agent.js");
      const { getMessageMeta, getMessageIdHeader, createReplyDraft } = await import("../mail/gmail-api.js");
      const j = await a.runJob(getDb(), n, {
        runClaude: process.env.COS_AGENT_FIXTURE ? () => a.readFixtureResult() : a.realRunClaude,
        fetchSource: async (ref) => { const m = await getMessageMeta(ref.slice(6)); return { from: m.from, subject: m.subject, threadId: m.threadId, to: m.to, cc: m.cc }; },
        messageIdHeader: getMessageIdHeader,
        createReplyDraft,
      });
      console.log(`agent job ${j.id}: ${j.status}${j.error ? ` - ${j.error}` : ""}`);
      return j.status === "ready" ? 0 : 1;
    }
    case "agent-jobs": {
      for (const r of getDb().prepare("SELECT id, brief_date, day_index, status, cost_usd, error, summary FROM cos_agent_jobs ORDER BY id DESC LIMIT 20").all() as Record<string, unknown>[])
        console.log(`#${r.id} ${r.brief_date}/${r.day_index} ${r.status}${r.cost_usd != null ? ` $${Number(r.cost_usd).toFixed(2)}` : ""} ${r.error ?? String(r.summary ?? "").slice(0, 80)}`);
      return 0;
    }
    case "accounts": {
      const { loadAccounts, checkAccount, loginCommand } = await import("./accounts.js");
      const f = loadAccounts();
      let bad = 0;
      for (const a of f.accounts) {
        const c = checkAccount(a);
        const mark = { ok: "OK   ", needs_login: "LOGIN", wrong_account: "WRONG", error: "ERROR" }[c.state];
        console.log(`${mark} ${a.id.padEnd(11)} expected ${c.expected ?? "?"}${c.signed_in_as ? `, signed in as ${c.signed_in_as}` : ""}${c.detail ? ` (${c.detail})` : ""}`);
        if (c.state !== "ok") { bad++; console.log(`      login: ${loginCommand(a, f.scopes)}`); }
      }
      for (const n of f.not_google) console.log(`SKIP  ${n.id.padEnd(11)} ${n.email}: ${n.provider}. ${n.note}`);
      return bad ? 1 : 0;
    }
    case "ping-test": {
      const { sendIMessageToSelf } = await import("./notify.js");
      const r = sendIMessageToSelf(`Chief of Staff test ping ${new Date().toLocaleTimeString()}`);
      console.log(r.ok ? "iMessage sent to self" : `iMessage failed: ${r.error}`);
      return r.ok ? 0 : 1;
    }
    case "queue": {
      const db = getDb(); expireApprovals(db);
      const rows = listApprovals(db, arg && /^\d{4}-/.test(arg) ? arg : date);
      if (!rows.length) console.log("Nothing queued.");
      for (const a of rows) console.log(`${String(a.day_index).padStart(2)}. [${a.status}] ${a.kind === "reply" ? "send" : "approve"} ${a.day_index}: ${a.title}  (${a.source_ref})`);
      return 0;
    }
    case "done": {
      const { markDone } = await import("./approvals.js");
      try { console.log(markDone(getDb(), date, n, "by you")); return 0; } catch (e) { console.error((e as Error).message); return 1; }
    }
    case "approve": case "send": case "skip": {
      if (!Number.isInteger(n) || n < 1) { console.error(`usage: npm run cos -- ${cmd} N`); return 2; }
      const db = getDb();
      try {
        const msg = cmd === "approve" ? await approve(db, realExecutors, date, n)
          : cmd === "send" ? await send(db, realExecutors, date, n)
          : skip(db, date, n);
        console.log(msg); return 0;
      } catch (e) { console.error((e as Error).message); return 1; }
    }
    default:
      console.error("usage: npm run cos -- health | morning | eod | weekly | queue | approve N | send N | skip N | commitments | close ID EVIDENCE [--date YYYY-MM-DD]");
      return 2;
  }
}

main().then((c) => process.exit(c), (e) => { console.error(e); process.exit(1); });
