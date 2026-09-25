// gates: ledger-schema (AC-07), reconcile (AC-08), artifacts (AC-09), heartbeat (AC-10).
// Usage: tsx tests/gates/ledger.ts <schema|reconcile|artifacts|heartbeat>; COS_LEDGER_LIB swaps the library (negative validation).
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const lib = await import(pathToFileURL(resolve(process.env.COS_LEDGER_LIB ?? "cos/lib/ledger.mjs")).href);
const which = process.argv[2];
const dir = mkdtempSync(join(tmpdir(), "cos-ledger-gate-"));
let fail = 0;
const check = (ok: boolean, label: string) => { console.log(`${ok ? "PASS" : "FAIL"} ${label}`); if (!ok) fail = 1; };
const base = () => ({
  lane: "inbox", run_id: "r1", status: "ok", started_at: "2026-09-24T12:00:00Z", finished_at: "2026-09-24T12:01:00Z",
  items_in: 16, items_out: { archived: 9, starred: 2, kept: 5 }, artifacts: [] as string[], findings: [], proposed_actions: [],
  open_questions: [], gaps: [] as string[], cost_usd: 0.1,
});

try {
  if (which === "schema") {
    check(lib.validateRecord(base()).length === 0, "valid record accepted");
    const bad = { ...base(), status: "great", items_out: { archived: -1 }, findings: [{ claim: "x" }], artifacts: ["relative/path"] };
    const problems = lib.validateRecord(bad);
    check(problems.length >= 4, `invalid record rejected with ${problems.length} problems`);
    const stored = lib.appendRecord(bad, dir);
    check(stored.status === "failed" && stored.gaps.some((g: string) => g.startsWith("invalid_record")), "invalid record is logged as failed/invalid_record");
    const lines = readFileSync(join(dir, "inbox.jsonl"), "utf8").trim().split("\n");
    check(lines.length === 1 && JSON.parse(lines[0]).status === "failed", "one JSONL line written per run");
    check(lib.validateRecord({ ...base(), items_in: null }).length > 0, "items_in/items_out must be set together");
  } else if (which === "reconcile") {
    const r = lib.appendRecord({ ...base(), items_in: 17, items_out: { archived: 9, starred: 2, kept: 5 } }, dir);
    check(r.status === "failed", "17 in vs 16 out marks the run failed");
    check(r.gaps.includes("reconciliation: in=17 out=16"), "gap names both counts");
    check(lib.appendRecord(base(), dir).status === "ok", "reconciled run stays ok");
    check(lib.appendRecord({ ...base(), lane: "flights", items_in: null, items_out: null }, dir).status === "ok", "non-counting lane is not reconciled");
  } else if (which === "artifacts") {
    const real = join(dir, "brief.html"); writeFileSync(real, "<p>ok</p>");
    const empty = join(dir, "empty.html"); writeFileSync(empty, "");
    check(lib.appendRecord({ ...base(), artifacts: [real] }, dir).status === "ok", "existing non-empty artifact passes");
    const miss = lib.appendRecord({ ...base(), artifacts: [join(dir, "nope.pdf")] }, dir);
    check(miss.status === "failed" && miss.gaps.some((g: string) => g.startsWith("missing_artifact")), "missing artifact fails the run");
    check(lib.appendRecord({ ...base(), artifacts: [empty] }, dir).status === "failed", "empty artifact fails the run");
  } else if (which === "heartbeat") {
    const cfg = { lanes: [
      { lane: "inbox", schedule: { days: [1,2,3,4,5,6,7], times: ["07:00", "08:00"] }, grace_minutes: 30 },
      { lane: "yt", schedule: { days: [1,2,3,4,5,6,7], times: ["07:03"] }, grace_minutes: 90 },
      { lane: "deals", schedule: { days: [3, 7], times: ["07:18"] }, grace_minutes: 90 },
    ] };
    const at = (d: string) => new Date(d);
    lib.appendRecord({ ...base(), started_at: at("2026-09-24T08:00:30").toISOString() }, dir);
    lib.appendRecord({ ...base(), lane: "yt", items_in: null, items_out: null, started_at: at("2026-09-16T07:03:00").toISOString() }, dir);
    lib.appendRecord({ ...base(), lane: "deals", items_in: null, items_out: null, status: "failed", gaps: ["exit_code: 127"], started_at: at("2026-09-23T07:18:00").toISOString() }, dir);
    const h = Object.fromEntries(lib.laneHealth(cfg, at("2026-09-24T09:00:00"), dir).map((x: { lane: string }) => [x.lane, x]));
    check(h.inbox.state === "ok", "inbox ran at 08:00, healthy at 09:00");
    check(h.yt.state === "stale", "yt last ran 09-16: stale");
    check(h.deals.state === "failing", "deals last run failed: failing");
    const h2 = Object.fromEntries(lib.laneHealth(cfg, at("2026-09-24T08:20:00"), dir).map((x: { lane: string }) => [x.lane, x]));
    check(h2.inbox.state === "ok", "within grace period nothing is stale");
    const h3 = Object.fromEntries(lib.laneHealth(cfg, at("2026-09-24T10:00:00"), dir).map((x: { lane: string }) => [x.lane, x]));
    check(h3.inbox.state === "ok", "no 09:00 slot configured: still ok at 10:00");
  } else {
    check(false, `unknown gate ${which}`);
  }
} finally {
  rmSync(dir, { recursive: true, force: true });
}
process.exit(fail);
