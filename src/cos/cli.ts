/**
 * Chief of Staff CLI: npm run cos -- <command>
 *   health            lane heartbeat report (AC-10); exits 1 when any lane is stale or failing
 *   morning           build today's brief (AC-12..16)
 *   queue [date]      list today's Decide items
 *   approve N | send N | skip N [--date YYYY-MM-DD]
 */
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { laneHealth, type LaneConfig } from "../../cos/lib/ledger.mjs";
import { getDb } from "../storage/db.js";
import { approve, send, skip, listApprovals, expireApprovals, localDate, type Executors } from "./approvals.js";
import { readDraft, sendDraft } from "../mail/gmail-api.js";
import { ensureGtdLists, insertTask } from "../tasks/google-tasks.js";

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

const realExecutors: Executors = {
  readDraft, sendDraft,
  async createTask(title, notes) { const ids = await ensureGtdLists(); return (await insertTask(ids.inbox, { title, notes })).id; },
};

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
    case "queue": {
      const db = getDb(); expireApprovals(db);
      const rows = listApprovals(db, arg && /^\d{4}-/.test(arg) ? arg : date);
      if (!rows.length) console.log("Nothing queued.");
      for (const a of rows) console.log(`${String(a.day_index).padStart(2)}. [${a.status}] ${a.kind === "reply" ? "send" : "approve"} ${a.day_index}: ${a.title}  (${a.source_ref})`);
      return 0;
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
      console.error("usage: npm run cos -- health | morning | queue | approve N | send N | skip N [--date YYYY-MM-DD]");
      return 2;
  }
}

main().then((c) => process.exit(c), (e) => { console.error(e); process.exit(1); });
